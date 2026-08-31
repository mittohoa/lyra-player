/** Ten kenh IPC dung chung, tranh go nham chuoi o hai dau. */
export const IPC = {
  settingsGet: 'settings:get',
  settingsPatch: 'settings:patch',

  libraryGet: 'library:get',
  libraryScan: 'library:scan',
  libraryAddFolder: 'library:add-folder',
  libraryRemoveFolder: 'library:remove-folder',
  libraryAddFiles: 'library:add-files',
  libraryRemove: 'library:remove',
  libraryProgress: 'library:progress',

  lyricsResolve: 'lyrics:resolve',
  lyricsRefetch: 'lyrics:refetch',
  lyricsSetManual: 'lyrics:set-manual',
  lyricsGetManual: 'lyrics:get-manual',
  lyricsSetOffset: 'lyrics:set-offset',

  sourcesStatus: 'sources:status',
  sourcesSearch: 'sources:search',
  sourcesResolve: 'sources:resolve',
  sourcesFromUrl: 'sources:from-url',

  playlistsGet: 'playlists:get',
  playlistsSave: 'playlists:save',

  overlaySetVisible: 'overlay:set-visible',
  overlaySetClickThrough: 'overlay:set-click-through',
  overlayPatchSettings: 'overlay:patch-settings',
  overlaySettings: 'overlay:settings',
  overlayState: 'overlay:state',
  overlayTick: 'overlay:tick',
  overlayPushTick: 'overlay:push-tick',
  overlayPushState: 'overlay:push-state',
  overlayCommand: 'overlay:command',
  overlaySendCommand: 'overlay:send-command',

  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',

  ytdlpStatus: 'ytdlp:status',
  ytdlpInstall: 'ytdlp:install',
  ytdlpPick: 'ytdlp:pick',

  downloadTrack: 'download:track',
  downloadProgress: 'download:progress',
  downloadPickFolder: 'download:pick-folder',
  downloadOpenFolder: 'download:open-folder',

  artworkColor: 'artwork:color',

  aiStatus: 'ai:status',
  aiInstall: 'ai:install',
  aiInstallProgress: 'ai:install-progress',
  aiAlign: 'ai:align',
  aiAlignProgress: 'ai:align-progress',
  aiTranslate: 'ai:translate',
  aiTranslateProgress: 'ai:translate-progress',
  aiGetTranslation: 'ai:get-translation',

  lyricsForExternal: 'lyrics:for-external',

  smtcNow: 'smtc:now',
  smtcSetWatch: 'smtc:set-watch',

  logRecent: 'log:recent',
  logClear: 'log:clear',
  logOpenFolder: 'log:open-folder',
  logFromRenderer: 'log:from-renderer',
  logEntry: 'log:entry',
  notice: 'app:notice',

  mediaKey: 'app:media-key',
  openExternal: 'app:open-external',
  revealInFolder: 'app:reveal-in-folder'
} as const

/** Trang thai day du - chi gui khi doi bai hoac doi lyric. */
export interface OverlayState {
  title: string
  artist: string
  artwork?: string
  isPlaying: boolean
  position: number
  duration: number
  lines: { time: number; text: string }[]
  /** Ban dich, cung do dai va cung thu tu voi `lines`; rong = khong hien. */
  translations?: string[]
  /** 'synced' | 'plain' | 'none' */
  kind: string
  offset: number
}

/**
 * Bai dang phat o mot app KHAC, doc tu System Media Transport Controls cua Windows.
 * `position` da duoc bu phan thoi gian troi qua ke tu luc Windows chup.
 */
export interface SmtcNowPlaying {
  /** Dinh danh app dang phat, vd. "Spotify.exe", "MSEdge". */
  app: string
  status: 'Playing' | 'Paused' | 'Stopped' | string
  title: string
  artist: string
  album: string
  position: number
  duration: number
  /** Epoch ms cua anh chup vi tri goc. */
  lastUpdated: number
}

/** Ket qua tim lyric cho bai dang phat o app khac. */
export interface ExternalLyricsResult {
  lines: { time: number; text: string }[]
  kind: string
  offset: number
  /** Loi bai hat hay phu de video. */
  type: 'lyrics' | 'subtitles'
  /** Noi tim ra: 'lrclib' | 'zing' | 'nct' | 'youtube' | 'youtube-auto'. */
  from: string
  /** Ten bai / video ma app nhan dien duoc tu chuoi tho. */
  title: string
  artist: string
  /** Chi co voi phu de. */
  language?: string
}

/** Trang thai san sang cua phan AI chay tren may. */
export interface AiStatus {
  whisperInstalled: boolean
  /** Co nho model -> da tai ve chua. */
  models: Record<string, boolean>
  /** Bo may dich dang chon: 'nhanh' hoac 'tot'. */
  boMayDich: 'nhanh' | 'tot'
}

/** Tien do tai whisper.cpp hoac model ve may. */
export interface AiInstallProgress {
  step: 'whisper' | 'model'
  received: number
  total: number
}

/** Tien do can timestamp cho mot bai. */
export interface AiAlignProgress {
  trackId: string
  phase: 'transcribing' | 'aligning' | 'done' | 'error'
  /** Phan tram hoan thanh cua buoc phien am (0-100). */
  percent?: number
  error?: string
}

/** Tien do tai mot bai ve may. */
export interface DownloadProgress {
  trackId: string
  title: string
  artist: string
  phase: 'resolving' | 'downloading' | 'tagging' | 'lyrics' | 'done' | 'error'
  /** Byte da nhan / tong so byte; 0 khi chua biet (vd. tai qua yt-dlp). */
  received: number
  total: number
  quality?: string
  filePath?: string
  error?: string
}

/** Nhip cap nhat nhe, gui ~4 lan/giay trong luc phat. */
export interface OverlayTick {
  position: number
  isPlaying: boolean
}

/** Lenh overlay gui nguoc ve cua so chinh. */
export type OverlayCommand =
  | { type: 'play-pause' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; position: number }
  | { type: 'nudge-offset'; delta: number }

/** Muc do nghiem trong cua mot ban ghi nhat ky. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Mot dong trong nhat ky. */
export interface LogEntry {
  id: number
  /** Epoch ms. */
  at: number
  level: LogLevel
  /** Phan nao cua app sinh ra, vd. 'tai ve', 'lyric', 'SMTC'. */
  scope: string
  /** Cau tieng Viet cho nguoi doc. */
  message: string
  /** Chi tiet ky thuat kem theo (stack, than loi) - chi hien khi mo rong. */
  detail?: string
}

/**
 * Loi nhan day tu tien trinh chinh len man hinh.
 * Dung cho viec xay ra ngoai luong nguoi dung bam nut, vi luc do khong co cho
 * nao khac de bao ket qua.
 */
export interface Notice {
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  /** Phan nao cua app, de nguoi dung biet duong lan. */
  scope?: string
}

/**
 * Loi tu tien trinh giao dien gui ve de ghi chung mot cho.
 * Loi o renderer ma khong gui ve thi khi nguoi dung bao "app hong" ta khong con
 * dau vet nao trong file nhat ky.
 */
export interface RendererLog {
  level: LogLevel
  scope: string
  message: string
  detail?: string
}
