import { describe, expect, it } from 'vitest'
import { readZip, ZipError } from './zip'

// --- minimal ZIP writer used only to produce fixtures for the reader ---
// Deliberately built from web APIs alone (the same ones the app runs on),
// so this test needs no Node typings.

interface Entry {
  name: string
  content: string
  /** 0 = stored, 8 = deflate */
  method: 0 | 8
  /** general-purpose flags in the central header (bit 0 = encrypted) */
  flags?: number
}

const utf8 = new TextEncoder()

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** Build a ZIP archive. CRC fields are left zero — the reader ignores them. */
async function buildZip(entries: Entry[], comment = ''): Promise<Uint8Array> {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const raw = utf8.encode(entry.content)
    const data = entry.method === 8 ? await deflateRaw(raw) : raw
    const name = utf8.encode(entry.name)

    const local = new Uint8Array(30)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, entry.method, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, name.length, true)
    locals.push(local, name, data)

    const central = new Uint8Array(46)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, entry.flags ?? 0, true)
    cv.setUint16(10, entry.method, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    centrals.push(central, name)

    offset += local.length + name.length + data.length
  }

  const localBuf = concat(locals)
  const centralBuf = concat(centrals)
  const commentBuf = utf8.encode(comment)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralBuf.length, true)
  ev.setUint32(16, localBuf.length, true)
  ev.setUint16(20, commentBuf.length, true)

  return concat([localBuf, centralBuf, eocd, commentBuf])
}

const zipBlob = async (entries: Entry[], comment?: string) =>
  new Blob([await buildZip(entries, comment)])

describe('readZip', () => {
  it('reads deflated and stored entries', async () => {
    const csv = 'show_name,season_number\nBreaking Bad,1\n'
    const entries = await readZip(
      await zipBlob([
        { name: 'seen_episode.csv', content: csv, method: 8 },
        { name: 'follows.csv', content: 'a,b\n1,2\n', method: 0 },
      ]),
    )
    expect(entries.map((e) => e.name)).toEqual(['seen_episode.csv', 'follows.csv'])
    expect(await entries[0].text()).toBe(csv)
    expect(await entries[1].text()).toBe('a,b\n1,2\n')
  })

  it('survives content large enough to actually compress', async () => {
    const big = 'id,name\n' + Array.from({ length: 2000 }, (_, i) => `${i},Show ${i}`).join('\n')
    const entries = await readZip(await zipBlob([{ name: 'big.csv', content: big, method: 8 }]))
    expect(await entries[0].text()).toBe(big)
  })

  it('finds the directory even when the archive has a trailing comment', async () => {
    const entries = await readZip(
      await zipBlob([{ name: 'a.csv', content: 'x\n', method: 8 }], 'exported by TV Time'),
    )
    expect(await entries[0].text()).toBe('x\n')
  })

  it('skips directory entries and macOS resource forks', async () => {
    const entries = await readZip(
      await zipBlob([
        { name: 'export/', content: '', method: 0 },
        { name: '__MACOSX/._seen.csv', content: 'junk', method: 0 },
        { name: 'export/seen.csv', content: 'ok\n', method: 0 },
      ]),
    )
    expect(entries.map((e) => e.name)).toEqual(['export/seen.csv'])
  })

  it('preserves UTF-8 content', async () => {
    const text = 'name\nBörgen — 日本語\n'
    const entries = await readZip(await zipBlob([{ name: 'u.csv', content: text, method: 8 }]))
    expect(await entries[0].text()).toBe(text)
  })

  it('rejects password-protected archives with a clear message', async () => {
    const blob = await zipBlob([{ name: 'a.csv', content: 'x\n', method: 0, flags: 0x1 }])
    await expect(readZip(blob)).rejects.toThrow(/password/i)
  })

  it('rejects files that are not ZIP archives', async () => {
    await expect(readZip(new Blob(['just some text, not a zip at all']))).rejects.toBeInstanceOf(
      ZipError,
    )
  })
})
