import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('parses headers and rows, normalizing header names', () => {
    const table = parseCsv('Show Name,Season Number\nBreaking Bad,1\n')
    expect(table.headers).toEqual(['show_name', 'season_number'])
    expect(table.rows).toEqual([{ show_name: 'Breaking Bad', season_number: '1' }])
  })

  it('handles quoted fields with commas, quotes and newlines', () => {
    const text = 'name,note\n"Cheers, Again","He said ""hi""\nthen left"\n'
    const table = parseCsv(text)
    expect(table.rows[0].name).toBe('Cheers, Again')
    expect(table.rows[0].note).toBe('He said "hi"\nthen left')
  })

  it('strips a UTF-8 BOM and CRLF line endings', () => {
    const table = parseCsv('﻿a,b\r\n1,2\r\n')
    expect(table.headers).toEqual(['a', 'b'])
    expect(table.rows).toEqual([{ a: '1', b: '2' }])
  })

  it('sniffs semicolon and tab delimiters', () => {
    expect(parseCsv('a;b\n1;2').rows[0]).toEqual({ a: '1', b: '2' })
    expect(parseCsv('a\tb\n1\t2').rows[0]).toEqual({ a: '1', b: '2' })
  })

  it('ignores blank trailing lines and pads short rows', () => {
    const table = parseCsv('a,b,c\n1,2\n\n')
    expect(table.rows).toEqual([{ a: '1', b: '2', c: '' }])
  })

  it('returns an empty table for empty input', () => {
    expect(parseCsv('   ')).toEqual({ headers: [], rows: [] })
  })
})
