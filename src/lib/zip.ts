// Minimal ZIP reader built on the browser's native DecompressionStream, so
// importing an archive costs no extra dependency. Handles the two methods
// real-world exports use: stored (0) and deflate (8).

export interface ZipEntry {
  name: string
  text: () => Promise<string>
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50
const ZIP64_MARKER = 0xffffffff

export class ZipError extends Error {}

/** Find the End Of Central Directory record, scanning back over any comment. */
function findEocd(view: DataView): number {
  const maxComment = 0xffff
  const start = Math.max(0, view.byteLength - maxComment - 22)
  for (let i = view.byteLength - 22; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i
  }
  throw new ZipError("That doesn't look like a ZIP file.")
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError(
      'This browser cannot unzip files. Unzip the export yourself and import the CSV files instead.',
    )
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * List the files in a ZIP archive. Entry contents are decompressed lazily so
 * a large archive only pays for the files that are actually read.
 */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const buffer = await file.arrayBuffer()
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const eocd = findEocd(view)

  const count = view.getUint16(eocd + 10, true)
  const cenSize = view.getUint32(eocd + 12, true)
  const cenOffset = view.getUint32(eocd + 16, true)
  if (cenOffset === ZIP64_MARKER || cenSize === ZIP64_MARKER || count === 0xffff) {
    throw new ZipError('ZIP64 archives are not supported — unzip it and import the CSV files.')
  }

  const decoder = new TextDecoder('utf-8')
  const entries: ZipEntry[] = []
  let ptr = cenOffset

  for (let i = 0; i < count; i++) {
    if (ptr + 46 > view.byteLength || view.getUint32(ptr, true) !== CEN_SIG) break
    const method = view.getUint16(ptr + 10, true)
    const compressedSize = view.getUint32(ptr + 20, true)
    const nameLen = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 30, true)
    const commentLen = view.getUint16(ptr + 32, true)
    const localOffset = view.getUint32(ptr + 42, true)
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen))
    ptr += 46 + nameLen + extraLen + commentLen

    // Directory entries and macOS resource forks carry no useful content.
    if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue
    if (compressedSize === ZIP64_MARKER) {
      throw new ZipError('ZIP64 archives are not supported — unzip it and import the CSV files.')
    }

    entries.push({
      name,
      text: async () => {
        // The local header repeats the name/extra fields with its own lengths.
        if (view.getUint32(localOffset, true) !== LOC_SIG) {
          throw new ZipError(`Corrupt entry in ZIP: ${name}`)
        }
        const locNameLen = view.getUint16(localOffset + 26, true)
        const locExtraLen = view.getUint16(localOffset + 28, true)
        const dataStart = localOffset + 30 + locNameLen + locExtraLen
        const raw = bytes.subarray(dataStart, dataStart + compressedSize)
        if (method === 0) return decoder.decode(raw)
        if (method === 8) return decoder.decode(await inflateRaw(raw))
        throw new ZipError(`Unsupported compression in ZIP entry: ${name}`)
      },
    })
  }

  if (!entries.length) throw new ZipError('That ZIP file is empty.')
  return entries
}
