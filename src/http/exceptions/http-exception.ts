// src/exceptions/http-exception.ts
export class HttpException extends Error {
  statusCode: number
  code?: string
  showError: boolean

  constructor(
    statusCode: number,
    message: string,
    name: string,
    code?: string,
    showError = false,
  ) {
    super(message)
    this.name = name
    this.statusCode = statusCode
    this.code = code
    this.showError = showError
    Object.setPrototypeOf(this, HttpException.prototype)
  }
}
