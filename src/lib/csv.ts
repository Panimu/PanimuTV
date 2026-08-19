// RFC 4180-ish CSV parser: quoted fields, embedded delimiters and newlines,
// doubled quotes, CRLF, and a UTF-8 BOM. Tolerant by design — these files
// come from someone else's exporter.

export interface CsvTable {
  headers: string[]
  rows: Record<string, string>[]
}

/** Guess the delimiter from the header line (comma, semicolon, or tab). */
function sniffDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
  const counts = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].d : ','
}

function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Parse CSV text into headers plus row objects keyed by normalized header. */
export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^\uFEFF/, '')
  if (!text.trim()) return { headers: [], rows: [] }
  const delimiter = sniffDelimiter(text)
  const raw = splitRows(text, delimiter)
  if (!raw.length) return { headers: [], rows: [] }

  const headers = raw[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i]
    // Skip blank trailing lines.
    if (cells.length === 1 && cells[0].trim() === '') continue
    const obj: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = (cells[c] ?? '').trim()
    rows.push(obj)
  }
  return { headers, rows }
}
