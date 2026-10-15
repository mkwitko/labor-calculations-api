import { HttpException } from './http-exception'

export class PrismaException extends HttpException {
  constructor(message = 'Erro no banco de dados') {
    super(500, message, 'PrismaException', 'E008')
  }
}
