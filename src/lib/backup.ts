// Backup & restore: the whole library (plus settings) as a single JSON file.
// With everything in localStorage, this is the user's only safety net — make
// taking backups trivially easy.

import { useLibrary } from '../store/library'
import { settingsValues, useSettings, type SettingsValues } from '../store/settings'
import type { TrackedShow } from '../types'

interface BackupFile {
  app: 'PanimuTV'
  version: number
  exportedAt: string
  library: Record<number, TrackedShow>
  settings?: Partial<SettingsValues>
}

export function exportBackup(): void {
  const payload: BackupFile = {
    app: 'PanimuTV',
    version: 1,
    exportedAt: new Date().toISOString(),
    library: useLibrary.getState().shows,
    settings: settingsValues(useSettings.getState()),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `panimutv-backup-${new Date().toISOString().slice(0, 10)}.json`
  // iOS Safari needs the anchor in the DOM, and revoking the URL immediately
  // can cancel the download — defer it.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Replace the current library/settings with a backup. Returns show count. */
export async function importBackup(file: File): Promise<number> {
  const text = await file.text()
  let parsed: Partial<BackupFile>
  try {
    parsed = JSON.parse(text) as Partial<BackupFile>
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (parsed?.app !== 'PanimuTV' || typeof parsed.library !== 'object' || !parsed.library) {
    throw new Error('That file is not a PanimuTV backup.')
  }
  useLibrary.getState().replaceAll(parsed.library as Record<number, TrackedShow>)
  if (parsed.settings) useSettings.getState().update(parsed.settings)
  return Object.keys(parsed.library).length
}
