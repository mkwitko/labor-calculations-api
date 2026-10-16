import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { fastifyCookie } from '@fastify/cookie'
import { fastifyCors } from '@fastify/cors'
import { fastifyHelmet } from '@fastify/helmet'
import { fastifyJwt } from '@fastify/jwt'
import { fastifyRateLimit } from '@fastify/rate-limit'
import { fastifySwagger } from '@fastify/swagger'
import scalarApiReference from '@scalar/fastify-api-reference'
import { fastify } from 'fastify'

import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { env } from './env'
import { errorHandler } from './http/exceptions/handler/error-handler'
import { bodyCaptureHooks, requestLogger } from './http/hooks/request-logger'
import { runWithTenantStore } from './lib/tenant-context'
import Routing from './routing'
import { API_KEY_TOKEN_PREFIX } from './services/api/api-key-service'
import { STRIPE_WEBHOOK_PATH } from './utils/constants'
import { swaggerToMarkdown } from './utils/swagger-to-md'

export const app = fastify({
  bodyLimit: 1048576,
  genReqId: () => randomUUID(),
  trustProxy: env.TRUST_PROXY,
}).withTypeProvider<ZodTypeProvider>()

app.setSerializerCompiler(serializerCompiler)
app.setValidatorCompiler(validatorCompiler)

app.register(fastifyCors, {
  origin: [env.CLIENT_URL],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: true,
  allowedHeaders: ['x-session-id', 'Content-Type', 'Accept', 'Authorization'],
})

app.register(fastifyHelmet, {
  global: true,
  contentSecurityPolicy: false,
})

app.register(fastifyRateLimit, {
  // Em teste o store é em memória e todos os requests do arquivo vêm do mesmo
  // IP: a matriz de papéis sozinha passa de 100 requests por minuto e começaria
  // a receber 429 no lugar do status que ela afere. Os limites por rota
  // (`config.rateLimit`) continuam valendo em todo ambiente.
  max: env.ENV === 'test' ? 10_000 : 100,
  timeWindow: '1 minute',
  // A conta de `/v1` é por chave, não por IP: um integrador atrás de NAT não
  // pode gastar a cota do vizinho. O `keyGenerator` roda em `onRequest`, antes
  // do preHandler que resolve a chave, então ele usa o **prefixo** do token —
  // que já identifica a chave sozinho e é a parte pública dela. Prefixo
  // forjado só gasta a própria cota inventada; a chamada morre em 401 logo
  // depois.
  keyGenerator: (request) => {
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? ''
    const prefix = token.split('.')[0]

    return prefix.startsWith(API_KEY_TOKEN_PREFIX) ? prefix : request.ip
  },
})

app.register(fastifyCookie)

app.register(fastifyJwt, {
  sign: {
    algorithm: 'RS256',
  },
  secret: {
    public: Buffer.from(env.JWT_PUBLIC_KEY, 'base64'),
    private: Buffer.from(env.JWT_PRIVATE_KEY, 'base64'),
  },
  verify: {
    algorithms: ['RS256'],
  },
})

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'Labor Calculations API',
      version: '2.0.0',
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        /**
         * A chave de API não é o JWT do app: formato diferente, hook diferente
         * (`api-key-auth.ts`) e público diferente — quem lê a referência
         * pública nunca viu um cookie deste produto.
         */
        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'ApiKey',
        },
      },
    },
  },

  transform: jsonSchemaTransform,
})

if (env.ENV === 'development') {
  app.register(scalarApiReference, {
    routePrefix: '/docs',
    configuration: {
      theme: 'elysiajs',
    },
  })
}

/**
 * A referência pública sobe em **todo** ambiente e lê a spec filtrada. O
 * `/docs` acima continua restrito ao desenvolvimento porque serve o app
 * inteiro, incluindo rotas internas.
 */
app.register(scalarApiReference, {
  routePrefix: '/docs/api',
  configuration: {
    theme: 'elysiajs',
    url: '/openapi/v1.json',
  },
})

// Stripe signs the raw request bytes, so the webhook route needs them intact.
// The parser runs after routing, so we can keep the buffer for that one route
// and let every other route behave exactly as the default JSON parser does.
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (request, body, done) => {
    const raw = body as Buffer

    if (request.routeOptions.url === STRIPE_WEBHOOK_PATH) {
      request.rawBody = raw
    }

    if (raw.length === 0) {
      done(null, undefined)
      return
    }

    try {
      done(null, JSON.parse(raw.toString('utf8')))
    } catch {
      const err = new Error(
        'Corpo da requisição não é um JSON válido',
      ) as Error & {
        statusCode?: number
      }
      err.statusCode = 400
      done(err, undefined)
    }
  },
)

app.decorateRequest('errorContext', null)
app.decorateRequest('capturedRequestBody', null)
app.decorateRequest('capturedResponseBody', null)
app.decorateRequest('rawBody', null)

// Estilo callback de propósito: `done()` é chamado de dentro do
// AsyncLocalStorage.run, e é isso que faz o contexto alcançar o handler.
app.addHook('onRequest', (_request, _reply, done) => {
  runWithTenantStore(done)
})

app.addHook('onRequest', bodyCaptureHooks.onRequest)
app.addHook('onSend', bodyCaptureHooks.onSend)
app.addHook('onResponse', requestLogger)

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

Routing()

app.ready(async () => {
  if (env.ENV !== 'production') {
    try {
      const json = await app.swagger()
      fs.writeFileSync('swagger.json', JSON.stringify(json, null, 2))
      const md = swaggerToMarkdown(json)
      fs.writeFileSync('swagger.md', md)

      if (env.SWAGGER_FRONT_DIR) {
        fs.writeFileSync(
          `${env.SWAGGER_FRONT_DIR}/swagger.json`,
          JSON.stringify(json, null, 2),
        )
        fs.writeFileSync(`${env.SWAGGER_FRONT_DIR}/swagger.md`, md)
      }
    } catch {
      // Swagger file writes are non-critical; ignore failures
    }
  }
})

app.setErrorHandler(errorHandler)
