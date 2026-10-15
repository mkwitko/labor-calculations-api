import { describe, expect, it, vi } from 'vitest'
import { publish, subscribe, subscriberCount } from './broker'

const channel = {
  organizationId: 'org_1',
  caseId: 'case_1',
  viewer: 'lawyer' as const,
}

describe('broker', () => {
  it('entrega ao assinante do canal', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(channel, listener)

    publish(channel, {
      type: 'read',
      caseId: 'case_1',
      viewer: 'client',
      at: 'agora',
    })

    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('para de entregar depois de desassinar', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(channel, listener)
    unsubscribe()

    publish(channel, {
      type: 'read',
      caseId: 'case_1',
      viewer: 'client',
      at: 'agora',
    })

    expect(listener).not.toHaveBeenCalled()
    expect(subscriberCount(channel)).toBe(0)
  })

  it('não entrega para outro caso nem para o outro lado', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(channel, listener)

    publish(
      { ...channel, caseId: 'case_2' },
      { type: 'read', caseId: 'case_2', viewer: 'client', at: 'agora' },
    )
    publish(
      { ...channel, viewer: 'client' },
      { type: 'read', caseId: 'case_1', viewer: 'lawyer', at: 'agora' },
    )

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('publicar sem assinante não estoura', () => {
    expect(() =>
      publish(
        { organizationId: 'org_x', caseId: 'case_x', viewer: 'client' },
        { type: 'read', caseId: 'case_x', viewer: 'lawyer', at: 'agora' },
      ),
    ).not.toThrow()
  })
})
