export interface SearchInput {
  customCategory?: number
  site?: SiteId
  pixivMode?: 'rank' | 'tag' | 'author'
  pixivKind?: 'all' | 'illust' | 'manga' | 'ugoira'
  pixivPeriod?: 'daily' | 'weekly' | 'monthly' | 'rookie' | 'original' | 'male' | 'female'
  pixivDate?: string
  keyword: string
  page: number
  count: number
  filterResolution: boolean
  minWidth: number
  minHeight: number
  orientation: 0 | 1 | 2
}
export interface Picture {
  customCategory?: number
  thumbnailReferer?: string
  previewReferer?: string
  site?: SiteId
  title?: string
  keyword?: string
  unsupported?: string
  pageCount?: number
  rank?: number
  tip?: string
  tipHighlight?: boolean
  pages?: { original: string; preview: string; referer?: string; previewReferer?: string }[]
  /** Assigned by the main process per result entry; the site's ID can repeat. */
  key: string
  id: number
  width: number
  height: number
  score: number
  author: string
  authorId: string
  tags: string[]
  date: string
  source: string
  detail: string
  thumbnail: string
  large?: string
  preview: string
  original: string
  bytes: number
  nsfw: boolean
  viewed: boolean
  filtered: boolean
}
export interface VisualPage {
  index: number
  firstPage: number
  nextPage: number
  complete: boolean
  items: Picture[]
  realPages: { page: number; count: number; output: number; start: number; end: number }[]
  error?: string
  cursor?: string
}
export interface SearchSettings { loadConcurrency: number; historyLimit: number; hideViewed: boolean }
export interface BackgroundImage { url: string; width: number; height: number; align: 'left' | 'center' | 'right' }
export interface DisplaySettings { showBackground: boolean; lowPerformance: boolean }
export interface SiteDefinition { name: string; home: string; login: string; hosts: readonly string[]; custom?: boolean; dynamicCategories?: boolean; categories?: string[]; keyword?: boolean; icon?: string; cookieAuthKey?: string }
export interface BrowserState {
  sites: Record<string, SiteDefinition>
  customErrors: string[]
  displaySettings: DisplaySettings
  searchSettings: SearchSettings
  siteCounts: Record<SiteId, number>
  acrylicEnabled: boolean
  count: number
  size: number
  history: string[]
  bounds?: { x: number; y: number; width: number; height: number }
}
export interface BrowserApi {
  customCategories(site: SiteId): Promise<string[]>
  onCustomCategories(callback: (site: SiteId, names: string[]) => void): () => void
  openCustomDirectory(): Promise<void>
  setDisplaySettings(value: DisplaySettings): Promise<void>
  background(): Promise<BackgroundImage | undefined>
  changeBackground(): Promise<BackgroundImage | undefined>
  openBackgroundDirectory(): Promise<void>
  setSearchSettings(value: SearchSettings): Promise<void>
  clearHistory(): Promise<void>
  network(): Promise<NetworkSnapshot>
  setNetwork(value: NetworkSettings): Promise<void>
  onNetwork(callback: (value: NetworkSnapshot) => void): () => void
  login(site: SiteId): Promise<void>
  logout(site: SiteId): Promise<void>
  detail(key: string): Promise<Picture>
  downloads(): Promise<DownloadSnapshot>
  onDownloads(callback: (value: DownloadSnapshot) => void): () => void
  enqueue(keys: string[], quality: string): Promise<number>
  downloadAction(action: DownloadAction, ids: string[]): Promise<void>
  downloadSettings(value: DownloadSettings): Promise<void>
  downloadDirectory(): Promise<string | undefined>
  revealDownload(id: string): Promise<void>
  exportDownloads(): Promise<boolean>
  importDownloads(text: string): Promise<{ added: number; errors: string[] }>
  setAcrylic(enabled: boolean): Promise<void>
  appearance(): Promise<Appearance>
  onAppearance(callback: (value: Appearance) => void): () => void
  init(): Promise<BrowserState>
  search(input: SearchInput): Promise<VisualPage>
  next(): Promise<VisualPage>
  cancel(): Promise<void>
  hints(keyword: string, site?: SiteId): Promise<{ word: string; count: string }[]>
  preview(key: string): Promise<void>
  previewItem(): Promise<Picture>
  onImageProgress(callback: (progress: { key: string; loaded: number; total: number }) => void): () => void
  copy(text: string): Promise<void>
  open(key: string): Promise<void>
  size(value: number): Promise<void>
  count(value: number, site?: SiteId): Promise<void>
}
export interface Appearance { acrylicEnabled: boolean; reducedTransparency: boolean; dark: boolean; active: boolean; nativeBlur: boolean; platform: string }
declare global { interface Window { moe: BrowserApi } }

export const defaults: SearchInput = { keyword: '', page: 1, count: 60, filterResolution: false, minWidth: 1024, minHeight: 768, orientation: 0 }

export interface DownloadSettings {
  directory: string
  concurrency: number
  fileTemplate: string
  folderTemplate: string
  autoRename: boolean
  tagCount: number
  firstOnly: boolean
  firstCount: number
}
export interface DownloadSource {
  site?: SiteId
  id: string | number
  url: string
  referer: string
  detail: string
  keyword: string
  title?: string
  author?: string
  authorId?: string
  tags: string[]
  date?: string
  name?: string
  picture?: Picture
  children?: DownloadSource[]
}
export type DownloadStatus = 'queued' | 'downloading' | 'stopped' | 'failed' | 'success' | 'skip' | 'cancelled'
export type DownloadAction = 'stop' | 'retry' | 'remove' | 'clear' | 'clear-success-retry-failed'
export interface DownloadTask {
  id: string
  source: DownloadSource
  path: string
  root: string
  name: string
  status: DownloadStatus
  text: string
  loaded: number
  total: number
  progress: number
  autoRename: boolean
  children?: DownloadTask[]
}
export interface DownloadSnapshot { settings: DownloadSettings; tasks: DownloadTask[] }

export type SiteId = string
export type ProxyMode = 'none' | 'custom' | 'system'
export interface NetworkSettings { globalMode: ProxyMode; proxyAddress: string; siteModes: Record<SiteId, ProxyMode | 'default'> }
export interface NetworkSnapshot { settings: NetworkSettings; loggedIn: Record<SiteId, boolean> }
export interface LoginStatus { site: SiteId; state: 'idle' | 'verifying' | 'failed' | 'success'; text: string }
