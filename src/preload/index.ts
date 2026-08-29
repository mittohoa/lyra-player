import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type AiAlignProgress,
  type AiInstallProgress,
  type AiStatus,
  type DownloadProgress,
  type ExternalLyricsResult,
  type LogEntry,
  type Notice,
  type RendererLog,
  type OverlayCommand,
  type OverlayState,
  type OverlayTick,
  type SmtcNowPlaying
} from '@shared/ipc'
import type {
  AppSettings,
  Lyrics,
  LyricLine,
  LyricsQuery,
  OverlaySettings,
  Playlist,
  ResolvedStream,
  ScanProgress,
  SearchResult,
  SourceId,
  Track
} from '@shared/types'

/**
 * Boc `invoke` de boc bo tien to Electron tu dan vao moi loi IPC.
 *
 * Tien trinh chinh da doi loi thanh cau tieng Viet roi, nhung Electron van goi
 * lai thanh:
 *
 *   Error invoking remote method 'lyrics:set-manual': Error: Không tìm thấy file.
 *
 * De nguyen thi cau tieng Viet bi chon sau mot chuoi ky thuat khong ai doc.
 * Bo o day - mot cho duy nhat - thi moi kenh deu sach, khong the sot kenh nao.
 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const clean = raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')
    throw new Error(clean || raw)
  }
}

/** Boc `on` de tra ve ham huy dang ky - React useEffect dung truc tiep. */
function subscribe<T extends unknown[]>(
  channel: string,
  handler: (...args: T) => void
): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void =>
    handler(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  settings: {
    get: (): Promise<AppSettings> => invoke(IPC.settingsGet),
    patch: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      invoke(IPC.settingsPatch, patch)
  },

  library: {
    get: (): Promise<Track[]> => invoke(IPC.libraryGet),
    scan: (): Promise<Track[]> => invoke(IPC.libraryScan),
    addFolder: (): Promise<string[]> => invoke(IPC.libraryAddFolder),
    removeFolder: (folder: string): Promise<string[]> =>
      invoke(IPC.libraryRemoveFolder, folder),
    addFiles: (paths?: string[]): Promise<Track[]> =>
      invoke(IPC.libraryAddFiles, paths),
    remove: (ids: string[]): Promise<Track[]> => invoke(IPC.libraryRemove, ids),
    onProgress: (handler: (p: ScanProgress) => void): (() => void) =>
      subscribe<[ScanProgress]>(IPC.libraryProgress, handler)
  },

  lyrics: {
    resolve: (query: LyricsQuery, embedded?: string, track?: Track): Promise<Lyrics> =>
      invoke(IPC.lyricsResolve, query, embedded, track),
    refetch: (query: LyricsQuery): Promise<Lyrics> => invoke(IPC.lyricsRefetch, query),
    getManual: (trackId: string): Promise<string | null> =>
      invoke(IPC.lyricsGetManual, trackId),
    setManual: (trackId: string, content: string): Promise<void> =>
      invoke(IPC.lyricsSetManual, trackId, content),
    setOffset: (trackId: string, offset: number): Promise<void> =>
      invoke(IPC.lyricsSetOffset, trackId, offset),
    /** Tim lyric cho bai dang phat o app khac, tu chuoi ten tho cua Windows. */
    forExternal: (raw: {
      title: string
      artist?: string
      album?: string
      duration?: number
    }): Promise<ExternalLyricsResult | null> => invoke(IPC.lyricsForExternal, raw)
  },

  sources: {
    status: (): Promise<
      { id: SourceId; label: string; searchable: boolean; playable: boolean; error: string | null }[]
    > => invoke(IPC.sourcesStatus),
    search: (query: string, ids: SourceId[], limit?: number): Promise<SearchResult[]> =>
      invoke(IPC.sourcesSearch, query, ids, limit),
    resolve: (track: Track, force?: boolean): Promise<ResolvedStream> =>
      invoke(IPC.sourcesResolve, track, force),
    fromUrl: (url: string): Promise<Track> => invoke(IPC.sourcesFromUrl, url)
  },

  playlists: {
    get: (): Promise<Playlist[]> => invoke(IPC.playlistsGet),
    save: (playlists: Playlist[]): Promise<Playlist[]> =>
      invoke(IPC.playlistsSave, playlists)
  },

  overlay: {
    setVisible: (visible: boolean): Promise<void> =>
      invoke(IPC.overlaySetVisible, visible),
    setClickThrough: (enabled: boolean): Promise<void> =>
      invoke(IPC.overlaySetClickThrough, enabled),
    patchSettings: (patch: Partial<OverlaySettings>): Promise<OverlaySettings> =>
      invoke(IPC.overlayPatchSettings, patch),

    /** Cua so chinh -> overlay: trang thai day du, chi khi doi bai hoac doi lyric. */
    pushState: (state: OverlayState): void => ipcRenderer.send(IPC.overlayPushState, state),
    /** Cua so chinh -> overlay: nhip vi tri phat, khong kem mang lyric. */
    pushTick: (tick: OverlayTick): void => ipcRenderer.send(IPC.overlayPushTick, tick),
    /** Overlay lay lai trang thai gan nhat khi vua mo. */
    pullState: (): Promise<OverlayState | null> => invoke(IPC.overlayState),
    onState: (handler: (state: OverlayState) => void): (() => void) =>
      subscribe<[OverlayState]>(IPC.overlayState, handler),
    onTick: (handler: (tick: OverlayTick) => void): (() => void) =>
      subscribe<[OverlayTick]>(IPC.overlayTick, handler),
    onSettings: (handler: (settings: OverlaySettings) => void): (() => void) =>
      subscribe<[OverlaySettings]>(IPC.overlaySettings, handler),

    /** Overlay -> cua so chinh (nut dieu khien tren overlay). */
    sendCommand: (command: OverlayCommand): void =>
      ipcRenderer.send(IPC.overlaySendCommand, command),
    onCommand: (handler: (command: OverlayCommand) => void): (() => void) =>
      subscribe<[OverlayCommand]>(IPC.overlayCommand, handler)
  },

  ytdlp: {
    status: (): Promise<{ path: string | null }> => invoke(IPC.ytdlpStatus),
    install: (): Promise<string> => invoke(IPC.ytdlpInstall),
    pick: (): Promise<string | null> => invoke(IPC.ytdlpPick)
  },

  /** Phan AI: can timestamp bang Whisper (chay tren may) va dich lyric (qua API). */
  ai: {
    status: (): Promise<AiStatus> => invoke(IPC.aiStatus),
    install: (size: string): Promise<AiStatus> => invoke(IPC.aiInstall, size),
    onInstallProgress: (handler: (p: AiInstallProgress) => void): (() => void) =>
      subscribe<[AiInstallProgress]>(IPC.aiInstallProgress, handler),

    align: (
      track: Track,
      plainLines: string[]
    ): Promise<{ lines: LyricLine[]; confidence: number; lrc: string }> =>
      invoke(IPC.aiAlign, track, plainLines),
    onAlignProgress: (handler: (p: AiAlignProgress) => void): (() => void) =>
      subscribe<[AiAlignProgress]>(IPC.aiAlignProgress, handler),

    translate: (trackId: string, lines: string[], lang?: string): Promise<string[]> =>
      invoke(IPC.aiTranslate, trackId, lines, lang),
    getTranslation: (trackId: string, lang?: string): Promise<string[] | null> =>
      invoke(IPC.aiGetTranslation, trackId, lang),
    onTranslateProgress: (
      handler: (p: { trackId: string; done: number; total: number }) => void
    ): (() => void) =>
      subscribe<[{ trackId: string; done: number; total: number }]>(
        IPC.aiTranslateProgress,
        handler
      ),

    checkKey: (): Promise<{ ok: boolean; error?: string }> => invoke(IPC.aiCheckKey)
  },

  /** Mau chu dao cua anh bia - de nen app doi mau theo bai dang phat. */
  artwork: {
    color: (url: string): Promise<string | null> => invoke(IPC.artworkColor, url)
  },

  download: {
    track: (track: Track): Promise<string> => invoke(IPC.downloadTrack, track),
    pickFolder: (): Promise<string> => invoke(IPC.downloadPickFolder),
    openFolder: (): Promise<void> => invoke(IPC.downloadOpenFolder),
    onProgress: (handler: (p: DownloadProgress) => void): (() => void) =>
      subscribe<[DownloadProgress]>(IPC.downloadProgress, handler)
  },

  /** Nhac dang phat o app khac (Spotify, trinh duyet...) qua SMTC cua Windows. */
  smtc: {
    now: (): Promise<SmtcNowPlaying | null> => invoke(IPC.smtcNow),
    setWatch: (enabled: boolean): Promise<boolean> =>
      invoke(IPC.smtcSetWatch, enabled),
    onNow: (handler: (now: SmtcNowPlaying | null) => void): (() => void) =>
      subscribe<[SmtcNowPlaying | null]>(IPC.smtcNow, handler)
  },

  /** Nhat ky va canh bao. */
  log: {
    recent: (limit?: number): Promise<LogEntry[]> => invoke(IPC.logRecent, limit),
    clear: (): Promise<void> => invoke(IPC.logClear),
    openFolder: (): Promise<void> => invoke(IPC.logOpenFolder),
    /** Gui loi ben giao dien ve de ghi chung mot file voi loi ben kia. */
    write: (entry: RendererLog): void => ipcRenderer.send(IPC.logFromRenderer, entry),
    onEntry: (handler: (entry: LogEntry) => void): (() => void) =>
      subscribe<[LogEntry]>(IPC.logEntry, handler),
    /** Canh bao chu dong tu tien trinh chinh - hien thanh toast. */
    onNotice: (handler: (notice: Notice) => void): (() => void) =>
      subscribe<[Notice]>(IPC.notice, handler)
  },

  window: {
    minimize: (): void => ipcRenderer.send(IPC.windowMinimize),
    maximize: (): void => ipcRenderer.send(IPC.windowMaximize),
    close: (): void => ipcRenderer.send(IPC.windowClose)
  },

  system: {
    openExternal: (url: string): Promise<void> => invoke(IPC.openExternal, url),
    revealInFolder: (path: string): Promise<void> => invoke(IPC.revealInFolder, path),
    /** Electron 32 bo `File.path`; duong dan that phai lay qua webUtils. */
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
    onMediaKey: (handler: (action: string) => void): (() => void) =>
      subscribe<[string]>(IPC.mediaKey, handler)
  }
}

export type PlayerApi = typeof api

contextBridge.exposeInMainWorld('api', api)
