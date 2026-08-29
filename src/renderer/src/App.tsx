import { useEffect, useRef, type JSX } from 'react'
import { useApp } from '@/store/app'
import { usePlayer } from '@/store/player'
import { useLyrics } from '@/store/lyrics'
import { usePlaylists } from '@/store/playlists'
import { externalPosition, useExternal } from '@/store/external'
import { useDownloads } from '@/store/downloads'
import { useTheme } from '@/store/theme'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { LibraryView } from '@/components/LibraryView'
import { SearchView } from '@/components/SearchView'
import { NowPlayingView } from '@/components/NowPlayingView'
import { PlaylistView } from '@/components/PlaylistView'
import { SettingsView } from '@/components/SettingsView'
import { PlayerBar } from '@/components/PlayerBar'
import { QueuePanel } from '@/components/QueuePanel'
import { Toasts } from '@/components/Toasts'
import { LyricsEditor } from '@/components/LyricsEditor'
import { LyraLoader } from '@/components/LyraLoader'
import { ErrorBoundary } from './components/ErrorBoundary'

/** Nhip day vi tri phat sang overlay - 4 lan/giay du muot ma khong ton CPU. */
const TICK_MS = 250

export default function App(): JSX.Element {
  const ready = useApp((s) => s.ready)
  const view = useApp((s) => s.view)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const init = useApp((s) => s.init)

  const track = usePlayer((s) => s.current())
  const isPlaying = usePlayer((s) => s.isPlaying)
  const playerError = usePlayer((s) => s.error)

  const externalNow = useExternal((s) => s.now)
  const externalLyrics = useExternal((s) => s.lyrics)

  const lyrics = useLyrics((s) => s.lyrics)
  const translation = useLyrics((s) => s.translation)
  const loadFor = useLyrics((s) => s.loadFor)
  const nudgeOffset = useLyrics((s) => s.nudgeOffset)
  const editorOpen = useLyrics((s) => s.editorOpen)

  // ---- Khoi dong ------------------------------------------------------
  useEffect(() => {
    void init()
    void usePlaylists.getState().load()
    const offExternal = useExternal.getState().subscribe()
    const offDownloads = useDownloads.getState().subscribe()
    return () => {
      offExternal()
      offDownloads()
    }
  }, [init])

  // Nap am luong / che do lap da luu vao player
  const hydrated = useRef(false)
  useEffect(() => {
    if (!settings || hydrated.current) return
    hydrated.current = true
    usePlayer.getState().hydrate({
      volume: settings.volume,
      muted: settings.muted,
      repeat: settings.repeat,
      shuffle: settings.shuffle
    })
  }, [settings])

  // ---- Lyric theo bài dang phat ---------------------------------------
  useEffect(() => {
    void loadFor(track)
    void useTheme.getState().applyFor(track)
  }, [track, loadFor])

  // ---- Lỗi phat nhac -> toast -----------------------------------------
  useEffect(() => {
    if (playerError) toast(playerError, 'error')
  }, [playerError, toast])

  /**
   * Overlay lay lyric tu dau: Lyra dang phat thi Lyra thang; Lyra dang ranh
   * ma app khac (Spotify, trinh duyet...) dang phat thi theo app do.
   */
  const followExternal =
    (settings?.followSystemMedia ?? false) &&
    externalNow?.status === 'Playing' &&
    !isPlaying

  // ---- Day trang thai day du sang overlay khi doi bài / doi lyric -----
  useEffect(() => {
    if (followExternal && externalNow) {
      window.api.overlay.pushState({
        title: externalNow.title,
        artist: externalNow.artist,
        isPlaying: true,
        position: externalNow.position,
        duration: externalNow.duration,
        lines: externalLyrics.lines,
        kind: externalLyrics.kind,
        offset: externalLyrics.offset
      })
      return
    }

    if (!track) return
    window.api.overlay.pushState({
      title: track.title,
      artist: track.artist,
      artwork: track.artwork,
      isPlaying: usePlayer.getState().isPlaying,
      position: usePlayer.getState().position,
      duration: usePlayer.getState().duration,
      lines: lyrics.lines,
      translations: translation ?? undefined,
      kind: lyrics.kind,
      offset: lyrics.offset
    })
    // externalNow doi moi 500ms nhung chi ten bài moi dang quan tam o day
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, lyrics, translation, followExternal, externalLyrics, externalNow?.title, externalNow?.artist])

  // ---- Nhip vi tri phat sang overlay ----------------------------------
  useEffect(() => {
    if (!settings?.overlay.enabled) return

    const timer = setInterval(() => {
      if (followExternal) {
        const { now, receivedAt } = useExternal.getState()
        window.api.overlay.pushTick({
          position: externalPosition(now, receivedAt),
          isPlaying: true
        })
        return
      }
      const { position, isPlaying: playing } = usePlayer.getState()
      window.api.overlay.pushTick({ position, isPlaying: playing })
    }, TICK_MS)

    return () => clearInterval(timer)
  }, [settings?.overlay.enabled, followExternal])

  // ---- Lenh tu overlay va phim media ----------------------------------
  useEffect(() => {
    const player = usePlayer.getState

    const offCommand = window.api.overlay.onCommand((command) => {
      switch (command.type) {
        case 'play-pause':
          void player().toggle()
          break
        case 'next':
          void player().next()
          break
        case 'prev':
          void player().prev()
          break
        case 'seek':
          player().seek(command.position)
          break
        case 'nudge-offset':
          nudgeOffset(command.delta)
          break
      }
    })

    const offMediaKey = window.api.system.onMediaKey((action) => {
      if (action === 'play-pause') void player().toggle()
      else if (action === 'next') void player().next()
      else if (action === 'prev') void player().prev()
      else if (action === 'stop') player().stop()
    })

    const offAlign = window.api.ai.onAlignProgress((p) => {
      if (p.percent !== undefined) useLyrics.getState().setAlignPercent(p.percent)
    })

    const offSettings = window.api.overlay.onSettings((overlay) => {
      const current = useApp.getState().settings
      if (current) useApp.setState({ settings: { ...current, overlay } })
    })

    return () => {
      offCommand()
      offMediaKey()
      offAlign()
      offSettings()
    }
  }, [nudgeOffset])

  // ---- Phim tat trong cua so chinh ------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      // Dang go trong o nhap thi de yen cho nguoi dung
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (editorOpen) return

      const player = usePlayer.getState()
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          void player.toggle()
          break
        case 'ArrowRight':
          if (e.ctrlKey) void player.next()
          else player.seek(player.position + 5)
          break
        case 'ArrowLeft':
          if (e.ctrlKey) void player.prev()
          else player.seek(player.position - 5)
          break
        case 'ArrowUp':
          e.preventDefault()
          player.setVolume(player.volume + 0.05)
          break
        case 'ArrowDown':
          e.preventDefault()
          player.setVolume(player.volume - 0.05)
          break
        case 'KeyM':
          player.toggleMute()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editorOpen])

  // ---- Keo tha file nhac vao cua so -----------------------------------
  useEffect(() => {
    const onDragOver = (e: DragEvent): void => e.preventDefault()

    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      const paths = [...(e.dataTransfer?.files ?? [])]
        .map((file) => window.api.system.pathForFile(file))
        .filter(Boolean)
      if (!paths.length) return

      void (async () => {
        const added = await window.api.library.addFiles(paths)
        if (!added.length) return
        useApp.setState({ tracks: await window.api.library.get() })
        toast(`Đã thêm ${added.length} bài hát.`, 'success')
      })()
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [toast])

  // Tieu de cua so theo bài dang phat
  useEffect(() => {
    document.title = track ? `${track.artist} — ${track.title}` : 'Lyra'
  }, [track, isPlaying])

  if (!ready) {
    return (
      <div className="empty" style={{ height: '100vh' }}>
        <LyraLoader size={72} variant="block" />
        <p>Đang khởi động…</p>
      </div>
    )
  }

  return (
    <>
      {/* Nen lay mau tu anh bia, nam duoi toan bo noi dung */}
      <div className="aurora" aria-hidden="true" />

      <div className="app">
        <TitleBar />

        <div className="body">
          <Sidebar />
          {/* Boc rieng tung khu: mot man hinh hong thi cac khu con lai va
              thanh phat nhac ben duoi van dung duoc. `key` doi theo view nen
              chuyen sang man hinh khac la lop bat loi tu dat lai. */}
          <main className="content" key={view}>
            <ErrorBoundary scope={`man hinh ${view}`}>
              {view === 'library' && <LibraryView />}
              {view === 'search' && <SearchView />}
              {view === 'now-playing' && <NowPlayingView />}
              {view === 'playlist' && <PlaylistView />}
              {view === 'settings' && <SettingsView />}
            </ErrorBoundary>
          </main>
          <QueuePanel />
        </div>

        <ErrorBoundary scope="thanh phat nhac" compact>
          <PlayerBar />
        </ErrorBoundary>
        <Toasts />
        <LyricsEditor />
      </div>
    </>
  )
}
