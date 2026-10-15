type SwaggerDoc = {
  info: {
    title: string
    version: string
  }
  paths?: Record<string, any>
}

function formatSummary(summary?: string): string {
  return summary ? `**Summary:** ${summary}\n\n` : ''
}

function formatDescription(description?: string): string {
  return description ? `${description}\n\n` : ''
}

function formatParameters(parameters?: any[]): string {
  if (!parameters?.length) {
    return ''
  }

  const items = parameters
    .map(
      (param) =>
        `- \`${param.name}\` (${param.in}) ${
          param.required ? 'required' : 'optional'
        }`,
    )
    .join('\n')

  return `**Parameters:**\n\n${items}\n\n`
}

function formatRequestBody(requestBody?: any): string {
  if (!requestBody) {
    return ''
  }

  const schema = requestBody.content?.['application/json']?.schema || {}

  return [
    '**Request Body:**\n',
    '```json',
    JSON.stringify(schema, null, 2),
    '```',
    '',
  ].join('\n')
}

function formatResponses(responses?: Record<string, any>): string {
  if (!responses) {
    return ''
  }

  const items = Object.entries(responses)
    .map(([code, response]) => `- **${code}**: ${response.description || ''}`)
    .join('\n')

  return `**Responses:**\n\n${items}\n\n`
}

function formatEndpoint(path: string, method: string, endpoint: any): string {
  return [
    `### ${method.toUpperCase()} ${path}\n`,
    formatSummary(endpoint.summary),
    formatDescription(endpoint.description),
    formatParameters(endpoint.parameters),
    formatRequestBody(endpoint.requestBody),
    formatResponses(endpoint.responses),
    '---\n',
  ].join('\n')
}

function formatPaths(paths: Record<string, any>): string {
  let md = '## Endpoints\n\n'

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, endpoint] of Object.entries(
      methods as Record<string, any>,
    )) {
      md += formatEndpoint(path, method, endpoint)
    }
  }

  return md
}

export function swaggerToMarkdown(swagger: SwaggerDoc): string {
  let md = `# ${swagger.info.title}\n\n`
  md += `Version: ${swagger.info.version}\n\n`

  if (swagger.paths) {
    md += formatPaths(swagger.paths)
  }

  return md
}
