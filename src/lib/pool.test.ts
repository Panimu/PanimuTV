import { describe, expect, it } from 'vitest'
import { pooled, PRIORITY } from './pool'

const defer = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('pooled', () => {
  it('runs queued work in priority order, not arrival order', async () => {
    const order: string[] = []
    // Fill all four slots with work we control.
    const blockers = Array.from({ length: 4 }, () => defer())
    const running = blockers.map((b, i) =>
      pooled(async () => {
        order.push(`block${i}`)
        await b.promise
      }, PRIORITY.interactive),
    )
    // Queue background work first, then higher-priority work.
    const queued = [
      pooled(async () => void order.push('background'), PRIORITY.background),
      pooled(async () => void order.push('schedule-far'), PRIORITY.schedule + 500),
      pooled(async () => void order.push('schedule-near'), PRIORITY.schedule + 1),
      pooled(async () => void order.push('interactive'), PRIORITY.interactive),
    ]
    for (const b of blockers) b.resolve()
    await Promise.all([...running, ...queued])
    expect(order.slice(4)).toEqual([
      'interactive',
      'schedule-near',
      'schedule-far',
      'background',
    ])
  })

  it('keeps arrival order within one priority level', async () => {
    const order: number[] = []
    const blockers = Array.from({ length: 4 }, () => defer())
    const running = blockers.map((b) => pooled(async () => void (await b.promise)))
    const queued = [1, 2, 3, 4, 5].map((n) =>
      pooled(async () => void order.push(n), PRIORITY.schedule),
    )
    for (const b of blockers) b.resolve()
    await Promise.all([...running, ...queued])
    expect(order).toEqual([1, 2, 3, 4, 5])
  })

  it('releases its slot when work rejects', async () => {
    const blockers = Array.from({ length: 4 }, () => defer())
    const running = blockers.map((b) => pooled(async () => void (await b.promise)))
    const failing = pooled(async () => {
      throw new Error('boom')
    })
    const after = pooled(async () => 'ok')
    for (const b of blockers) b.resolve()
    await expect(failing).rejects.toThrow('boom')
    await expect(after).resolves.toBe('ok')
    await Promise.all(running)
  })
})
