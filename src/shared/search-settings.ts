import type { SearchSettings } from './types'

export const searchDefaults = (): SearchSettings => ({ loadConcurrency: 8, historyLimit: 25, hideViewed: false })
export function restoreSearchSettings(value: unknown): SearchSettings {
  const settings = searchDefaults()
  if (!value || typeof value !== 'object') return settings
  const saved = value as Partial<SearchSettings>
  if (Number.isInteger(saved.loadConcurrency) && saved.loadConcurrency! >= 5 && saved.loadConcurrency! <= 20) settings.loadConcurrency = saved.loadConcurrency!
  if (Number.isInteger(saved.historyLimit) && saved.historyLimit! >= 5 && saved.historyLimit! <= 30) settings.historyLimit = saved.historyLimit!
  if (typeof saved.hideViewed === 'boolean') settings.hideViewed = saved.hideViewed
  return settings
}
export function validateSearchSettings(value: unknown): SearchSettings {
  if (!value || typeof value !== 'object') throw new Error('搜索设置无效')
  const v = value as SearchSettings
  if (!Number.isInteger(v.loadConcurrency) || v.loadConcurrency < 5 || v.loadConcurrency > 20 ||
      !Number.isInteger(v.historyLimit) || v.historyLimit < 5 || v.historyLimit > 30 || typeof v.hideViewed !== 'boolean') throw new Error('搜索设置数值越界')
  return { loadConcurrency: v.loadConcurrency, historyLimit: v.historyLimit, hideViewed: v.hideViewed }
}
