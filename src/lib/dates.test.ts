import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, fmtMinutes, parseISO, relDay, toISO } from './dates'

describe('dates', () => {
  it('round-trips ISO strings as local dates', () => {
    expect(toISO(parseISO('2026-08-18'))).toBe('2026-08-18')
    expect(toISO(parseISO('2026-01-01'))).toBe('2026-01-01')
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29') // leap year
  })

  it('computes day differences', () => {
    expect(daysBetween('2026-08-18', '2026-08-18')).toBe(0)
    expect(daysBetween('2026-08-18', '2026-08-25')).toBe(7)
    expect(daysBetween('2026-08-18', '2026-08-11')).toBe(-7)
  })

  it('labels relative days', () => {
    expect(relDay('2026-08-18', '2026-08-18')).toBe('Today')
    expect(relDay('2026-08-19', '2026-08-18')).toBe('Tomorrow')
    expect(relDay('2026-08-17', '2026-08-18')).toBe('Yesterday')
    expect(relDay('2026-08-20', '2026-08-18')).toBeNull()
  })

  it('formats watch time', () => {
    expect(fmtMinutes(45)).toBe('45m')
    expect(fmtMinutes(140)).toBe('2h 20m')
    expect(fmtMinutes(3000)).toBe('2d 2h')
  })
})
