/** Kieu du lieu dung chung giua main process va renderer. */

export type SourceId = 'local' | 'direct' | 'youtube' | 'zing' | 'nct' | 'spotify'

/** Mot bai hat, du la file local hay ket qua tu nguon online. */
export interface Track {
  /** Khoa duy nhat: `${source}:${sourceId}` */
  id: string
  source: SourceId
  /** Id trong pham vi nguon: duong dan file, videoId, encodeId... */
  sourceId: string
  title: string
  artist: string
  album: string
  /** Giay. 0 neu chua biet (vd. radio stream). */
  duration: number
  year?: number
  genre?: string
  trackNo?: number
  /** data: URI hoac http(s) URL. */
  artwork?: string
  /** Chi co voi file local. */
  filePath?: string
  /** Lyric nhung san trong tag (khong timestamp hoac dang .lrc). */
  embeddedLyrics?: string
  /** Stream lien tuc (radio) - khong seek duoc. */
  isLive?: boolean
  /** Epoch ms, dung de sap xep "moi them". */
  addedAt?: number
}

/** URL phat duoc + header can thiet, do main process phan giai. */
export interface ResolvedStream {
  url: string
  /** Header phai gui kem (vd. Referer cho Zing/NCT). */
  headers?: Record<string, string>
  mimeType?: string
  /** Epoch ms - sau moc nay phai phan giai lai. */
  expiresAt?: number
}

/** Mot dong lyric da parse. */
export interface LyricLine {
  /** Giay tinh tu dau bai. */
  time: number
  text: string
}

export type LyricsKind = 'synced' | 'plain' | 'none'

export interface Lyrics {
  kind: LyricsKind
  lines: LyricLine[]
  /** Toan van, dung khi kind === 'plain'. */
  plainText?: string
  /** Nguon lay duoc lyric, hien thi trong UI. */
  origin: 'embedded' | 'sidecar' | 'lrclib' | 'manual' | 'none'
  /** Lech thoi gian nguoi dung chinh tay (giay, co the am). */
  offset: number
}

export interface LyricsQuery {
  trackId: string
  title: string
  artist: string
  album?: string
  duration?: number
  filePath?: string
}

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayerSnapshot {
  track: Track | null
  isPlaying: boolean
  /** Vi tri phat hien tai, giay. */
  position: number
  duration: number
}

export interface OverlaySettings {
  enabled: boolean
  /** Bo qua chuot - click xuyen qua overlay. */
  clickThrough: boolean
  locked: boolean
  fontSize: number
  fontFamily: string
  color: string
  /** Mau vien chu, giup doc duoc tren nen sang. */
  strokeColor: string
  strokeWidth: number
  /** 0 = trong suot hoan toan. */
  backgroundOpacity: number
  backgroundColor: string
  /** So dong hien thi ngoai dong hien tai (truoc + sau). */
  contextLines: number
  align: 'left' | 'center' | 'right'
  showWhenPaused: boolean
  bounds: { x: number; y: number; width: number; height: number } | null
}

export interface SpotifyCredentials {
  clientId: string
  clientSecret: string
}

/** Phim tat toan cuc - dang chuoi accelerator cua Electron, rong = tat. */
export interface Hotkeys {
  toggleOverlay: string
  lyricsEarlier: string
  lyricsLater: string
}

export interface AppSettings {
  libraryFolders: string[]
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
  /** Noi luu nhac tai ve; rong = Music/Lyra. */
  downloadFolder: string
  /** Duong dan yt-dlp; rong = tu do trong PATH va thu muc userData. */
  ytDlpPath: string
  ffmpegPath: string
  spotify: SpotifyCredentials
  /**
   * Bo may dich loi.
   *
   * 'tot'  - NLLB-200: 875 MB cho moi ngon ngu, ~5,7 giay moi dong, dich ra
   *          cau doc duoc
   * 'nhanh' - opus-mt: 102 MB moi chieu, ~1 giay moi dong, tho hon va bo trong
   *          gan mot phan ba so dong
   */
  translateEngine: 'nhanh' | 'tot'
  /** Ma ngon ngu dich lyric sang. */
  translateTo: string
  /** Co nho cua model Whisper dung de can timestamp. */
  whisperModel: 'tiny' | 'base' | 'small'
  /** Ngon ngu bai hat khi phien am; 'auto' de Whisper tu doan. */
  whisperLanguage: string
  /** Tu tim lyric tren LRCLIB khi khong co lyric noi bo. */
  autoFetchLyrics: boolean
  /** Thu nho xuong khay he thong thay vi thoat han. */
  minimizeToTray: boolean
  globalMediaKeys: boolean
  /** Hien lyric cho nhac phat o app khac (Spotify, trinh duyet...) khi Lyra dang ranh. */
  followSystemMedia: boolean
  /** Lay ca phu de video, khong chi lyric bai hat. */
  externalSubtitles: boolean
  /** Ngon ngu phu de theo thu tu uu tien, cach nhau dau phay. */
  subtitleLangs: string
  hotkeys: Hotkeys
  /** Chay cung Windows. */
  launchAtStartup: boolean
  /** Mo len la thu ngay xuong khay, khong hien cua so. */
  startMinimized: boolean
  /** Khi sua lyric thi ghi luon file .lrc canh file nhac. */
  writeLrcSidecar: boolean
  theme: 'dark' | 'light'
  overlay: OverlaySettings
}

export interface ScanProgress {
  phase: 'scanning' | 'reading' | 'done'
  scanned: number
  total: number
  current: string
}

export interface SearchResult {
  source: SourceId
  tracks: Track[]
  /** Loi ngoai le tu nguon do, hien thi nhe nhang thay vi vang trang. */
  error?: string
}

export interface Playlist {
  id: string
  name: string
  /**
   * Luu ca doi tuong Track chu khong chi id: bai tu YouTube/Zing/NCT khong nam
   * trong thu vien local nen khong tra nguoc id ra duoc.
   */
  tracks: Track[]
  createdAt: number
  updatedAt: number
}
