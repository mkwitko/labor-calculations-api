import { EventEmitter } from 'node:events'
import type { MessageView, Viewer } from './message-service'

/**
 * Broker **de processo**. Serve enquanto o back roda em uma instância só.
 *
 * Com duas réplicas, quem estiver conectado ao processo B não recebe o que
 * nasceu no processo A, e o sintoma é silencioso: a mensagem só aparece no
 * refresh. Escalar horizontalmente exige trocar isto por Redis pub/sub — o
 * Postgres não serve, porque o Neon com pooling não suporta LISTEN/NOTIFY.
 */
export type BrokerEvent =
  | { type: 'message'; caseId: string; message: MessageView }
  | { type: 'read'; caseId: string; viewer: Viewer; at: string }

export type Channel = {
  organizationId: string
  caseId: string
  viewer: Viewer
}

const emitter = new EventEmitter()
// Uma aba por pessoa é o caso comum, mas várias são legítimas; o teto padrão
// de 10 gritaria "possible EventEmitter memory leak" sem motivo.
emitter.setMaxListeners(0)

function key(channel: Channel): string {
  return `org:${channel.organizationId}:case:${channel.caseId}:${channel.viewer}`
}

export function subscribe(
  channel: Channel,
  listener: (event: BrokerEvent) => void,
): () => void {
  const name = key(channel)
  emitter.on(name, listener)

  return () => {
    emitter.off(name, listener)
  }
}

export function publish(channel: Channel, event: BrokerEvent): void {
  emitter.emit(key(channel), event)
}

export function subscriberCount(channel: Channel): number {
  return emitter.listenerCount(key(channel))
}
