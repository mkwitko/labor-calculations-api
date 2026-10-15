import { HttpException } from './http-exception'

export class UnprocessableEntityException extends HttpException {
  constructor(message: string, showError = true) {
    super(422, message, 'UnprocessableEntityException', 'E005', showError)
  }
}
