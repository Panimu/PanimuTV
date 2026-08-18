// Minimal toast bus — call toast() from anywhere, render with useToasts().

import { useEffect, useState } from 'react'

export interface ToastMsg {
  id: number
  text: string
}

let seq = 0
let toasts: ToastMsg[] = []
const listeners = new Set<(t: ToastMsg[]) => void>()

function emit(): void {
  for (const listener of listeners) listener(toasts)
}

export function toast(text: string): void {
  const entry = { id: ++seq, text }
  toasts = [...toasts, entry]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== entry.id)
    emit()
  }, 3500)
}

export function useToasts(): ToastMsg[] {
  const [list, setList] = useState<ToastMsg[]>(toasts)
  useEffect(() => {
    listeners.add(setList)
    return () => {
      listeners.delete(setList)
    }
  }, [])
  return list
}
