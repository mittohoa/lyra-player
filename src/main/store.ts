import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings, Playlist, Track } from '@shared/types'
import { log } from './logger'

const DEFAULTS: AppSettings = {
  libraryFolders: [],
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false,
  downloadFolder: '',
  ytDlpPath: '',
  ffmpegPath: '',
  spotify: { clientId: '', clientSecret: '' },
  translateEngine: 'tot',
  translateTo: 'vi',
  whisperModel: 'base',
  whisperLanguage: 'auto',
  autoFetchLyrics: true,
  minimizeToTray: true,
  globalMediaKeys: true,
  followSystemMedia: false,
  externalSubtitles: true,
  subtitleLangs: 'vi,en',
  hotkeys: {
    toggleOverlay: 'Ctrl+Alt+L',
    lyricsEarlier: 'Ctrl+Alt+Left',
    lyricsLater: 'Ctrl+Alt+Right'
  },
  launchAtStartup: false,
  startMinimized: false,
  writeLrcSidecar: true,
  theme: 'dark',
  overlay: {
    enabled: false,
    clickThrough: false,
    locked: false,
    // 0 = chua ai chon. Lan mo dau tien `resolveOverlayFontSize` do man hinh
    // roi thay bang so that - mot con so chot cung o day khong the vua cho ca
    // laptop 1366 lan man hinh 4K.
    fontSize: 0,
    fontFamily: 'Segoe UI',
    color: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 3,
    backgroundOpacity: 0,
    backgroundColor: '#000000',
    contextLines: 1,
    align: 'center',
    showWhenPaused: true,
    bounds: null
  }
}

/**
 * Kho JSON don gian tren dia. Ghi settings dong bo (nho, goi luc thoat app),
 * ghi library/playlists bat dong bo va co debounce vi co the rat lon.
 */
class JsonStore<T> {
  private cache: T
  private writeTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly file: string,
    private readonly fallback: T,
    private readonly merge: (loaded: unknown, fallback: T) => T = (loaded, fb) =>
      (loaded ?? fb) as T
  ) {
    this.cache = this.load()
  }

  private load(): T {
    try {
      if (!existsSync(this.file)) return structuredClone(this.fallback)
      return this.merge(JSON.parse(readFileSync(this.file, 'utf8')), this.fallback)
    } catch (err) {
      log.warn('lưu dữ liệu', `Không đọc được ${this.file} — dùng giá trị mặc định`, err)
      return structuredClone(this.fallback)
    }
  }

  get(): T {
    return this.cache
  }

  set(value: T): void {
    this.cache = value
    this.scheduleWrite()
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      void this.flushAsync()
    }, 400)
  }

  private async flushAsync(): Promise<void> {
    try {
      await fs.mkdir(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      await fs.writeFile(tmp, JSON.stringify(this.cache, null, 2), 'utf8')
      await fs.rename(tmp, this.file)
    } catch (err) {
      log.error('lưu dữ liệu', `Không ghi được ${this.file}`, err)
    }
  }

  /** Ghi ngay lap tuc, dung khi app sap thoat. */
  flushSync(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, JSON.stringify(this.cache, null, 2), 'utf8')
    } catch (err) {
      log.error('lưu dữ liệu', `Không ghi được ${this.file}`, err)
    }
  }
}

/** Gop settings da luu voi mac dinh, giu duoc khoa moi khi nang cap app. */
function mergeSettings(loaded: unknown, fallback: AppSettings): AppSettings {
  const src = (loaded ?? {}) as Partial<AppSettings>
  return {
    ...fallback,
    ...src,
    spotify: { ...fallback.spotify, ...(src.spotify ?? {}) },
    hotkeys: { ...fallback.hotkeys, ...(src.hotkeys ?? {}) },
    overlay: { ...fallback.overlay, ...(src.overlay ?? {}) }
  }
}

// Thu muc nay do Electron quyet dinh tu `productName` trong package.json - va
// no van la "Lyra" du app da doi ten thanh AURA. Xem `electron-builder.yml`:
// doi no thanh AURA la du lieu cu cua nguoi dung nam lai o %APPDATA%/Lyra ma
// app khong con nhin thay.
const dir = app.getPath('userData')

export const settingsStore = new JsonStore<AppSettings>(
  join(dir, 'settings.json'),
  DEFAULTS,
  mergeSettings
)

export const libraryStore = new JsonStore<Track[]>(join(dir, 'library.json'), [])

export const playlistStore = new JsonStore<Playlist[]>(join(dir, 'playlists.json'), [])

/** Lyric nguoi dung tu dan/chinh, khoa theo track id. */
export const manualLyricsStore = new JsonStore<Record<string, string>>(
  join(dir, 'lyrics-manual.json'),
  {}
)

/** Ban dich lyric da tai ve, khoa theo `${trackId}|${ngonNgu}`. */
export const translationStore = new JsonStore<Record<string, string[]>>(
  join(dir, 'translations.json'),
  {}
)

/** Offset lyric nguoi dung chinh tay, khoa theo track id, don vi giay. */
export const lyricsOffsetStore = new JsonStore<Record<string, number>>(
  join(dir, 'lyrics-offset.json'),
  {}
)

export function getSettings(): AppSettings {
  return settingsStore.get()
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const next = mergeSettings({ ...settingsStore.get(), ...patch }, DEFAULTS)
  settingsStore.set(next)
  return next
}

export function flushAllStores(): void {
  settingsStore.flushSync()
  libraryStore.flushSync()
  playlistStore.flushSync()
  manualLyricsStore.flushSync()
  lyricsOffsetStore.flushSync()
  translationStore.flushSync()
}

export { DEFAULTS as defaultSettings }
