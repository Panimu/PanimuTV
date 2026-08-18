import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_API_KEY } from '../config'
import type { UserStatus } from '../types'

export interface SettingsValues {
  apiKey: string
  /** Optional subscriber PIN — only needed for user-supported TheTVDB keys. */
  pin: string
  /** 3-letter TheTVDB language code (eng, spa, …) used for translations & discovery. */
  language: string
  /** 3-letter TheTVDB country code (usa, gbr, …) used for discovery. */
  country: string
  /** Which library statuses appear in the release schedule. */
  scheduleStatuses: UserStatus[]
}

interface SettingsState extends SettingsValues {
  update: (patch: Partial<SettingsValues>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: DEFAULT_API_KEY,
      pin: '',
      language: 'eng',
      country: 'usa',
      scheduleStatuses: ['watching', 'planned', 'onhold'],
      update: (patch) => set(patch),
    }),
    { name: 'panimu.settings.v1', version: 1 },
  ),
)

export function settingsValues(state: SettingsState): SettingsValues {
  const { apiKey, pin, language, country, scheduleStatuses } = state
  return { apiKey, pin, language, country, scheduleStatuses }
}
