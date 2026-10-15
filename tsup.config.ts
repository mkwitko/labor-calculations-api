import path from 'node:path'
import { defineConfig } from 'tsup'

// `prisma/prisma` and `prisma/templates/manifest` are files of this repo,
// resolved in development through tsconfig's `baseUrl: "."`. esbuild does not
// apply baseUrl to bare specifiers, and `prisma` is also a real dependency, so
// tsup marks them as external and the bundle ends up requiring the npm package:
//
//   Error: Package subpath './prisma' is not defined by "exports"
//   in /app/node_modules/prisma/package.json  (ERR_PACKAGE_PATH_NOT_EXPORTED)
//
// The crash only happens on the compiled bundle (`dist/server.js`), never under
// `tsx`, which is why it surfaced in the container and not in development.
// Aliasing the two specifiers to their real files makes them part of the bundle.
const repoRoot = __dirname

export default defineConfig({
  entry: ['src/server.ts'],

  sourcemap: true,

  noExternal: [/^prisma\//],

  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      'prisma/prisma': path.join(repoRoot, 'prisma/prisma.ts'),
      'prisma/templates/manifest': path.join(
        repoRoot,
        'prisma/templates/manifest.ts',
      ),
    }
  },
})
