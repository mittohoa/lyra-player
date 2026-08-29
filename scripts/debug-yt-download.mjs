// Goi thang downloadTrack() cho mot bai YouTube de xem loi that la gi.
import { app } from 'electron'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

app.setName('Lyra')

app.whenReady().then(async () => {
  const { youtubeSource } = await import('../src/main/sources/youtube')
  const { downloadTrack } = await import('../src/main/download')
  const { patchSettings } = await import('../src/main/store')
  const { findYtDlp } = await import('../src/main/sources/ytdlp')

  console.log('yt-dlp:', await findYtDlp(true))
  patchSettings({ downloadFolder: mkdtempSync(join(tmpdir(), 'ytdl-')) })

  const tracks = await youtubeSource.search('Noi nay co anh', 1)
  console.log('bai:', JSON.stringify({ id: tracks[0].id, title: tracks[0].title, source: tracks[0].source }))

  try {
    const path = await downloadTrack(tracks[0])
    console.log('THANH CONG:', path)
  } catch (err) {
    console.log('LOI THAT:', err?.message ?? err)
    console.log('--- stack ---')
    console.log(String(err?.stack ?? '').split('\n').slice(0, 6).join('\n'))
  }
  app.exit(0)
})
