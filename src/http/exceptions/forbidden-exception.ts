import { HttpException } from './http-exception'

export class ForbiddenException extends HttpException {
  constructor(message = 'Acesso negado', showError = true) {
    super(403, message, 'ForbiddenException', 'E004', showError)
  }
}
