export interface SearchInput {
  keyword: string
  page: number
  count: number
  filterResolution: boolean
  minWidth: number
  minHeight: number
  orientation: 0 | 1 | 2
}
export interface Picture {
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
}
export interface BrowserState {
  count: number
  size: number
  history: string[]
  bounds?: { x: number; y: number; width: number; height: number }
}
export interface BrowserApi {
  appearance(): Promise<Appearance>
  onAppearance(callback: (value: Appearance) => void): () => void
  init(): Promise<BrowserState>
  search(input: SearchInput): Promise<VisualPage>
  next(): Promise<VisualPage>
  cancel(): Promise<void>
  hints(keyword: string): Promise<{ word: string; count: string }[]>
  preview(key: string): Promise<void>
  previewItem(): Promise<Picture>
  onImageProgress(callback: (progress: { key: string; loaded: number; total: number }) => void): () => void
  copy(text: string): Promise<void>
  open(key: string): Promise<void>
  size(value: number): Promise<void>
  count(value: number): Promise<void>
}
export interface Appearance { dark: boolean; active: boolean; nativeBlur: boolean; platform: string }
declare global { interface Window { moe: BrowserApi } }

export const defaults: SearchInput = { keyword: '', page: 1, count: 60, filterResolution: false, minWidth: 1024, minHeight: 768, orientation: 0 }
