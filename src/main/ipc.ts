import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, dialog, ipcMain, shell } from 'electron'
import {
  IPC,
  type OverlayCommand,
  type OverlayState,
  type OverlayTick,
  type RendererLog
} from '@shared/ipc'
import type {
  AppSettings,
  Lyrics,
  LyricsQuery,
  Playlist,
  SearchResult,
  SourceId,
  Track
} from '@shared/types'
import { addFiles, getLibrary, removeTracks, scanLibrary } from './library'
import {
  getManualLyrics,
  resolveLyrics,
  setManualLyrics,
  setManualOffset,
  toLyrics,
  writeLrcSidecar
} from './lyrics'
import {
  parseYouTubeId,
  resolveStream,
  searchAll,
  sourceLyrics,
  sourceStatus,
  trackFromUrl,
  trackFromYouTubeId
} from './sources'
import { findYtDlp } from './sources/ytdlp'
import { registerStreamHeaders } from './protocol'
import { registerGlobalShortcuts } from './shortcuts'
import { applyLaunchAtStartup } from './startup'
import { currentNowPlaying, isWatching, startSmtcWatch, stopSmtcWatch } from './smtc'
import { defaultDownloadFolder, downloadTrack } from './download'
import { dominantColor } from './artwork'
import { resolveExternalLyrics } from './lyrics/external'
import {
  aiStatus,
  alignTrackLyrics,
  getCachedTranslation,
  installAi,
  translateTrackLyrics
} from './ai'
import { clearLogs, log, logFolder, notify, recentLogs, reportError } from './logger'
import { setThumbarPlaying } from './thumbar'
import { getSettings, patchSettings, playlistStore } from './store'
import {
  applyClickThrough,
  broadcast,
  getMainWindow,
  getOverlayWindow,
  setOverlayVisible
} from './windows'

const AUDIO_FILTER = [
  { name: 'Nhac', extensions: ['mp3', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'wma', 'aiff'] }
]

/** Ban tin overlay gan nhat, dung lai khi cua so overlay vua mo. */
let lastOverlayState: OverlayState | null = null

/** showOpenDialog gan vao cua so chinh khi co, de hop thoai khong bi lac ra sau. */
async function openDialog(
  options: Electron.OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> {
  const win = getMainWindow()
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

/**
 * Lop boc quanh moi kenh IPC.
 *
 * Khong co no thi mot handler nem loi se den renderer duoi dang
 * "Error invoking remote method 'x': ..." - nguoi dung khong hieu, ma trong
 * file nhat ky cung khong con dau vet nao. Boc mot lan o day thi MOI kenh
 * deu duoc ghi lai va deu tra ve mot cau doc duoc, khong the quen kenh nao.
 */
const ipc = {
  handle(
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: never[]) => unknown
  ): void {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await listener(event, ...(args as never[]))
      } catch (err) {
        // `describe` cho cau tieng Viet; nem tiep de ben goi biet la that bai
        throw new Error(reportError(channel, err))
      }
    })
  },

  on(
    channel: string,
    listener: (event: Electron.IpcMainEvent, ...args: never[]) => void
  ): void {
    ipcMain.on(channel, (event, ...args) => {
      try {
        listener(event, ...(args as never[]))
      } catch (err) {
        // Kenh mot chieu: khong co duong tra ve, nen day thang len man hinh
        notify(channel, err)
      }
    })
  }
}

export function registerIpc(): void {
  // ---- Cai dat ---------------------------------------------------------
  ipc.handle(IPC.settingsGet, (): AppSettings => getSettings())

  ipc.handle(IPC.settingsPatch, (_e, patch: Partial<AppSettings>): AppSettings => {
    const next = patchSettings(patch)
    if (patch.overlay) {
      applyClickThrough(next.overlay.clickThrough)
      broadcast(IPC.overlaySettings, next.overlay)
    }
    if (patch.globalMediaKeys !== undefined || patch.hotkeys) registerGlobalShortcuts()
    if (patch.launchAtStartup !== undefined) applyLaunchAtStartup(next)
    if (patch.followSystemMedia !== undefined) {
      if (next.followSystemMedia) startSmtcWatch()
      else stopSmtcWatch()
    }
    return next
  })

  // ---- Thu vien local --------------------------------------------------
  ipc.handle(IPC.libraryGet, (): Track[] => getLibrary())

  ipc.handle(IPC.libraryScan, (): Promise<Track[]> =>
    scanLibrary(getSettings().libraryFolders, (progress) =>
      broadcast(IPC.libraryProgress, progress)
    )
  )

  ipc.handle(IPC.libraryAddFolder, async (): Promise<string[]> => {
    const result = await openDialog({ properties: ['openDirectory', 'multiSelections'] })
    if (result.canceled) return getSettings().libraryFolders
    const merged = [...new Set([...getSettings().libraryFolders, ...result.filePaths])]
    return patchSettings({ libraryFolders: merged }).libraryFolders
  })

  ipc.handle(IPC.libraryRemoveFolder, (_e, folder: string): string[] => {
    const next = getSettings().libraryFolders.filter((f) => f !== folder)
    return patchSettings({ libraryFolders: next }).libraryFolders
  })

  ipc.handle(IPC.libraryAddFiles, async (_e, paths?: string[]): Promise<Track[]> => {
    let files = paths
    if (!files?.length) {
      const result = await openDialog({
        properties: ['openFile', 'multiSelections'],
        filters: AUDIO_FILTER
      })
      if (result.canceled) return []
      files = result.filePaths
    }
    return addFiles(files)
  })

  ipc.handle(IPC.libraryRemove, (_e, ids: string[]): Track[] => removeTracks(ids))

  // ---- Lyric -----------------------------------------------------------
  ipc.handle(
    IPC.lyricsResolve,
    async (_e, query: LyricsQuery, embedded?: string, track?: Track): Promise<Lyrics> => {
      // Zing/NCT co san .lrc chuan cua ho - uu tien hon LRCLIB, tru khi nguoi dung da tu dan lyric
      if (track && (track.source === 'zing' || track.source === 'nct')) {
        if (!getManualLyrics(query.trackId)) {
          const own = await sourceLyrics(track)
          if (own) return toLyrics(own, 'lrclib', 0)
        }
      }
      return resolveLyrics(query, embedded)
    }
  )

  ipc.handle(IPC.lyricsRefetch, (_e, query: LyricsQuery): Promise<Lyrics> =>
    resolveLyrics(query, undefined, { forceRefetch: true })
  )

  ipc.handle(IPC.lyricsGetManual, (_e, trackId: string): string | null =>
    getManualLyrics(trackId)
  )

  ipc.handle(
    IPC.lyricsSetManual,
    async (_e, trackId: string, content: string, filePath?: string): Promise<void> => {
      setManualLyrics(trackId, content)
      // Ghi luon ra .lrc canh file nhac de may khac / app khac doc duoc
      if (filePath && getSettings().writeLrcSidecar) await writeLrcSidecar(filePath, content)
    }
  )

  ipc.handle(IPC.lyricsSetOffset, (_e, trackId: string, offset: number): void => {
    setManualOffset(trackId, offset)
  })

  // ---- Nguon online ----------------------------------------------------
  ipc.handle(IPC.sourcesStatus, () => sourceStatus())

  ipc.handle(
    IPC.sourcesSearch,
    (_e, query: string, ids: SourceId[], limit?: number): Promise<SearchResult[]> =>
      searchAll(query, ids, limit)
  )

  ipc.handle(IPC.sourcesResolve, async (_e, track: Track, force?: boolean) => {
    const resolved = await resolveStream(track, force)
    // The <audio> khong tu gui duoc Referer, nen cai san vao bo chen header
    registerStreamHeaders(resolved.url, resolved.headers)
    return resolved
  })

  ipc.handle(IPC.sourcesFromUrl, async (_e, input: string): Promise<Track> => {
    const url = input.trim()
    const videoId = parseYouTubeId(url)
    if (videoId) return trackFromYouTubeId(videoId)
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Duong dan phai bat dau bang http:// hoac https://')
    }
    return trackFromUrl(url)
  })

  // ---- Playlist --------------------------------------------------------
  ipc.handle(IPC.playlistsGet, (): Playlist[] => playlistStore.get())

  ipc.handle(IPC.playlistsSave, (_e, playlists: Playlist[]): Playlist[] => {
    playlistStore.set(playlists)
    return playlists
  })

  // ---- Overlay ---------------------------------------------------------
  ipc.handle(IPC.overlaySetVisible, (_e, visible: boolean) => {
    patchSettings({ overlay: { ...getSettings().overlay, enabled: visible } })
    setOverlayVisible(visible)
  })

  ipc.handle(IPC.overlaySetClickThrough, (_e, enabled: boolean) => {
    patchSettings({ overlay: { ...getSettings().overlay, clickThrough: enabled } })
    applyClickThrough(enabled)
    broadcast(IPC.overlaySettings, getSettings().overlay)
  })

  ipc.handle(IPC.overlayPatchSettings, (_e, patch: Partial<AppSettings['overlay']>) => {
    const next = patchSettings({ overlay: { ...getSettings().overlay, ...patch } })
    applyClickThrough(next.overlay.clickThrough)
    broadcast(IPC.overlaySettings, next.overlay)
    return next.overlay
  })

  // Cua so chinh day trang thai day du (doi bai / doi lyric) -> overlay
  ipc.on(IPC.overlayPushState, (_e, state: OverlayState) => {
    lastOverlayState = state
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send(IPC.overlayState, state)
  })

  // Nhip vi tri phat - gui lien tuc nen khong kem theo mang lyric
  ipc.on(IPC.overlayPushTick, (_e, tick: OverlayTick) => {
    // Nhip nay den 4 lan/giay; `setThumbarPlaying` tu bo qua khi khong doi gi
    setThumbarPlaying(tick.isPlaying)
    if (lastOverlayState) {
      lastOverlayState.position = tick.position
      lastOverlayState.isPlaying = tick.isPlaying
    }
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send(IPC.overlayTick, tick)
  })

  // Overlay gui lenh nguoc -> chuyen tiep ve cua so chinh
  ipc.on(IPC.overlaySendCommand, (_e, command: OverlayCommand) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.overlayCommand, command)
  })

  // Overlay vua san sang -> keo lai trang thai gan nhat thay vi cho nhip cap nhat sau
  ipc.handle(IPC.overlayState, (): OverlayState | null => lastOverlayState)

  // ---- Khung cua so ----------------------------------------------------
  ipc.on(IPC.windowMinimize, () => getMainWindow()?.minimize())

  ipc.on(IPC.windowMaximize, () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipc.on(IPC.windowClose, () => {
    const win = getMainWindow()
    if (!win) return
    if (getSettings().minimizeToTray) win.hide()
    else win.close()
  })

  // ---- yt-dlp ----------------------------------------------------------
  ipc.handle(IPC.ytdlpStatus, async () => ({ path: await findYtDlp(true) }))

  ipc.handle(IPC.ytdlpInstall, async (): Promise<string> => {
    const dir = join(app.getPath('userData'), 'bin')
    await fs.mkdir(dir, { recursive: true })
    const target = join(dir, 'yt-dlp.exe')

    const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe')
    if (!res.ok || !res.body) throw new Error(`Tải thất bại (HTTP ${res.status})`)
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target))

    patchSettings({ ytDlpPath: target })
    if (!(await findYtDlp(true))) {
      throw new Error('Đã tải xong nhưng không chạy được — kiểm tra phần mềm diệt virus')
    }
    return target
  })

  ipc.handle(IPC.ytdlpPick, async (): Promise<string | null> => {
    const result = await openDialog({
      properties: ['openFile'],
      filters: [{ name: 'yt-dlp', extensions: ['exe'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    patchSettings({ ytDlpPath: result.filePaths[0] })
    await findYtDlp(true)
    return result.filePaths[0]
  })

  // ---- AI chay tren may / dich lyric -----------------------------------
  ipc.handle(IPC.aiStatus, () => aiStatus())

  ipc.handle(IPC.aiInstall, (_e, size: 'tiny' | 'base' | 'small') => installAi(size))

  ipc.handle(IPC.aiAlign, (_e, track: Track, plainLines: string[]) =>
    alignTrackLyrics(track, plainLines)
  )

  ipc.handle(IPC.aiTranslate, (_e, trackId: string, lines: string[], lang?: string) =>
    translateTrackLyrics(trackId, lines, lang ?? getSettings().translateTo)
  )

  ipc.handle(IPC.aiGetTranslation, (_e, trackId: string, lang?: string) =>
    getCachedTranslation(trackId, lang ?? getSettings().translateTo)
  )

  ipc.handle(IPC.aiCheckKey, async () => {
    // Nap muon: chi keo SDK vao khi nguoi dung bam kiem tra khoa
    const { checkApiKey } = await import('./ai/translate')
    return checkApiKey()
  })

  // ---- Lyric cho bai dang phat o app khac -------------------------------
  ipc.handle(
    IPC.lyricsForExternal,
    async (_e, raw: { title: string; artist?: string; album?: string; duration?: number }) => {
      return resolveExternalLyrics(raw)
    }
  )

  // ---- Mau chu dao cua anh bia (de nen doi mau theo bai) ----------------
  ipc.handle(IPC.artworkColor, (_e, url: string) => dominantColor(url))

  // ---- Tai nhac ve may -------------------------------------------------
  ipc.handle(IPC.downloadTrack, (_e, track: Track): Promise<string> => downloadTrack(track))

  ipc.handle(IPC.downloadPickFolder, async (): Promise<string> => {
    const result = await openDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return getSettings().downloadFolder
    return patchSettings({ downloadFolder: result.filePaths[0] }).downloadFolder
  })

  ipc.handle(IPC.downloadOpenFolder, async (): Promise<void> => {
    const folder = getSettings().downloadFolder.trim() || defaultDownloadFolder()
    await fs.mkdir(folder, { recursive: true })
    await shell.openPath(folder)
  })

  // ---- Nhac phat o app khac (SMTC) -------------------------------------
  ipc.handle(IPC.smtcNow, () => currentNowPlaying())

  ipc.handle(IPC.smtcSetWatch, (_e, enabled: boolean) => {
    patchSettings({ followSystemMedia: enabled })
    if (enabled) startSmtcWatch()
    else stopSmtcWatch()
    return isWatching()
  })

  // ---- Nhat ky ---------------------------------------------------------
  ipc.handle(IPC.logRecent, (_e, limit?: number) => recentLogs(limit))
  ipc.handle(IPC.logClear, () => clearLogs())

  ipc.handle(IPC.logOpenFolder, async (): Promise<void> => {
    const folder = logFolder()
    await fs.mkdir(folder, { recursive: true })
    await shell.openPath(folder)
  })

  // Loi ben giao dien gui ve day de ghi chung mot file voi loi ben nay
  ipc.on(IPC.logFromRenderer, (_e, entry: RendererLog) => {
    const level = entry?.level ?? 'error'
    log[level](entry?.scope || 'giao dien', entry?.message || 'Lỗi không rõ', entry?.detail)
  })

  // ---- Tien ich --------------------------------------------------------
  ipc.handle(IPC.openExternal, (_e, url: string) => shell.openExternal(url))
  ipc.handle(IPC.revealInFolder, (_e, path: string) => shell.showItemInFolder(path))
}
