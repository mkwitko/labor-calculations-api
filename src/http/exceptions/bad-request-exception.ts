import { HttpException } from './http-exception'

export class BadRequestException extends HttpException {
  constructor(message = 'Requisição inválida', showError = true) {
    super(400, message, 'BadRequestException', 'E002', showError)
  }
}
