// Publishes the system document templates' .docx files (committed under
// prisma/templates/system/, described by manifest.ts) to R2. To change a
// template, edit its .docx (or the generator) and re-run the generator, then
// this seed.
//
// This no longer touches the database: a `DocumentTemplate` row with a null
// `organizationId` isn't representable anymore. The rows are created per
// organization by `cloneSystemTemplates`, which points each clone at the same
// `fileKey` this script publishes.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { putObject } from '../src/lib/r2'
import { SYSTEM_TEMPLATE_MANIFEST } from './templates/manifest'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const systemDir = join(here, 'templates', 'system')

  console.log('🌱 Publishing system document templates to R2...')

  for (const t of SYSTEM_TEMPLATE_MANIFEST) {
    const buffer = readFileSync(join(systemDir, t.file))
    const fileKey = `templates/system/${t.type}-v${t.version}.docx`
    await putObject(fileKey, buffer, DOCX_MIME)
    console.log(`✓ Published: ${fileKey}`)
  }

  console.log('✅ System document templates published successfully!')
}

main().catch((e) => {
  console.error('❌ Error seeding templates:', e)
  process.exit(1)
})
