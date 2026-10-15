import { HttpException } from './http-exception'

export class PaymentRequiredException extends HttpException {
  constructor(
    message = 'Assinatura inativa. Regularize o pagamento para continuar.',
    showError = true,
  ) {
    super(402, message, 'PaymentRequiredException', 'E007', showError)
  }
}
