import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    alias: {
      "@/": `${path.resolve(__dirname, "./src")}/`,
    },
    fileParallelism: false,
    // O padrão de 5s é dimensionado para teste unitário. Aqui a fixture típica
    // fala com o Postgres, cria vários usuários (argon2 por usuário) e a
    // organização pessoal de cada um: sob carga isso passa de 5s e a suíte
    // falhava num teste diferente a cada rodada, por timeout e não por lógica.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Nota de ambiente: `src/env/index.ts` começa com `import 'dotenv/config'`,
    // que carrega o `.env` e preenche toda chave que o `.env.test` não define.
    // Como `.env.test` define nove chaves, a suíte roda com as credenciais reais
    // de desenvolvimento — Stripe, Resend, Sentry, Axiom. É o comportamento
    // escolhido; para isolar, declarar as chaves como string vazia em `env` aqui
    // (dotenv não sobrescreve variável já definida).
  },
})