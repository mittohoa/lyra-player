// Goi that cac nguon online de xem cai nao con chay.
// Day KHONG phai test tu dong - ket qua phu thuoc mang va phia server cua ho.
// Chay duoi Electron vi nhanh YouTube can app.getPath() de do yt-dlp.
//
//   npm run probe            (tim mac dinh)
//   npm run probe -- "tu khoa"
import { app } from 'electron'
import type { MusicSource } from '../src/main/sources/types'

// userData duoc tinh tu ten app. Chay file nay truc tiep thi Electron lay ten mac dinh
// la "Electron", tro nham sang %APPDATA%\Electron - dat lai de soi dung thu muc that.
app.setName('Lyra')

const q = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'Noi nay co anh'

let failed = 0

const probe = async (name: string, fn: () => Promise<string>): Promise<void> => {
  const started = Date.now()
  try {
    console.log(`  ${name.padEnd(18)} OK   ${await fn()}  (${Date.now() - started}ms)`)
  } catch (err) {
    failed++
    console.log(`  ${name.padEnd(18)} LOI  ${err instanceof Error ? err.message : err}`)
  }
}

/** Mo ta ngan gon mot chuoi lyric: bao nhieu dong, co timestamp khong. */
const describeLyric = (lrc: string | null): string =>
  lrc
    ? `${lrc.split('\n').length} dong, ${/\[\d+:/.test(lrc) ? 'co timestamp' : 'van ban thuan'}`
    : 'bai nay khong co lyric'

async function main(): Promise<void> {
  // Nap dong: cac module nay doc settings/yt-dlp ngay luc nap, nen phai doi sau setName
  const [{ nctSource }, { youtubeSource }, { zingSource }, { fetchBest }] = await Promise.all([
    import('../src/main/sources/nct'),
    import('../src/main/sources/youtube'),
    import('../src/main/sources/zing'),
    import('../src/main/lyrics/lrclib')
  ])

  console.log(`Tu khoa thu: "${q}"\n`)

  await probe('LRCLIB', async () => {
    const r = await fetchBest({ trackId: 'x', title: 'Yesterday', artist: 'The Beatles' })
    if (!r) return 'khong tim thay'
    return `${r.synced ? 'co timestamp' : 'van ban thuan'}, ${r.content.split('\n').length} dong`
  })

  const sources: MusicSource[] = [zingSource, nctSource, youtubeSource]

  for (const source of sources) {
    await probe(source.label, async () => {
      const blocked = await source.unavailableReason()
      if (blocked) return `bi tat: ${blocked}`
      const tracks = await source.search!(q, 3)
      if (!tracks.length) return 'khong co ket qua'
      const stream = await source.resolve!(tracks[0])
      return `${tracks.length} ket qua; "${tracks[0].title}" -> ${new URL(stream.url).hostname}`
    })

    if (source.lyrics) {
      await probe(`${source.label} lyric`, async () => {
        const tracks = await source.search!(q, 1)
        if (!tracks.length) return 'khong co ket qua de thu'
        return describeLyric(await source.lyrics!(tracks[0]))
      })
    }
  }

  console.log(failed ? `\n${failed} nguon dang co van de.` : '\nMoi nguon deu chay.')
  app.exit(failed ? 1 : 0)
}

app.whenReady().then(main)
