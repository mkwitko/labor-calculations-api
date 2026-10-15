import { Prisma } from '@prisma/client'
import {
  formatFieldName,
  translateName,
} from '../translate/prisma-fields-translation'

export function handlePrismaError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handleKnownRequestError(error)
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return 'Ocorreu um erro inesperado no sistema. Por favor, tente novamente.'
  }
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return 'Ocorreu um erro crítico no sistema. Por favor, entre em contato com o suporte.'
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return 'Não foi possível inicializar o sistema. Por favor, tente novamente em alguns instantes.'
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return 'Os dados fornecidos são inválidos. Por favor, verifique as informações e tente novamente.'
  }
  return 'Ocorreu um erro inesperado. Por favor, tente novamente.'
}

function handleKnownRequestError(
  error: Prisma.PrismaClientKnownRequestError,
): string {
  const modelName = error.meta?.modelName
    ? translateName(error.meta.modelName as string, true)
    : 'registro'

  const fieldName = error.meta?.target
    ? formatFieldName(error.meta.target as string)
    : formatFieldName(error.meta?.field_name as string)

  switch (error.code) {
    case 'P2000':
      return `O valor inserido é muito longo para o campo "${fieldName}".`
    case 'P2001':
      return `${modelName} não encontrado(a).`
    case 'P2002':
      return `Já existe um(a) ${modelName.toLowerCase()} com este(a) ${fieldName}.`
    case 'P2003':
      return `A ${fieldName} informada não existe no sistema.`
    case 'P2004':
      return 'Não foi possível realizar a operação devido a uma restrição do banco de dados.'
    case 'P2005':
      return `O valor fornecido para o campo "${fieldName}" é inválido.`
    case 'P2006':
      return `O valor fornecido para o campo "${fieldName}" em ${modelName.toLowerCase()} é inválido.`
    case 'P2007':
      return 'Os dados fornecidos não atendem aos critérios de validação.'
    case 'P2008':
      return 'Houve um erro na consulta ao banco de dados.'
    case 'P2009':
      return 'A consulta ao banco de dados é inválida.'
    case 'P2010':
      return 'Ocorreu um erro ao executar a consulta no banco de dados.'
    case 'P2011':
      return `O campo "${fieldName}" não pode ficar vazio.`
    case 'P2012':
      return `O campo "${fieldName}" é obrigatório.`
    case 'P2013':
      return `O campo "${fieldName}" é obrigatório para esta operação.`
    case 'P2014':
      return 'Não é possível realizar esta operação devido a um relacionamento obrigatório entre registros.'
    case 'P2015':
      return 'O registro relacionado não foi encontrado.'
    case 'P2025':
      return 'Não foi possível completar a operação pois alguns registros relacionados não foram encontrados.'
    case 'P6000':
      return 'Ocorreu um erro de conexão com o banco de dados.'
    default:
      return 'Ocorreu um erro inesperado. Por favor, tente novamente.'
  }
}

// Helper function to get translated field name
export function getTranslatedFieldName(fieldName: string): string {
  return translateName(fieldName)
}

// Helper function to get translated model name
export function getTranslatedModelName(modelName: string): string {
  return translateName(modelName, true)
}
