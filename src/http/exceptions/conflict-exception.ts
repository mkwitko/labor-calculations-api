import { HttpException } from './http-exception'

export class ConflictException extends HttpException {
  constructor(message = 'Conflito', showError = true) {
    super(409, message, 'ConflictException', 'E006', showError)
  }
}
