// In-memory localStorage for node tests, installed at import time so that
// modules creating zustand persist stores can evaluate safely. Import this
// BEFORE any module that touches the stores.

const memory = new Map<string, string>()

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size
    },
  } as Storage
}

export {}
