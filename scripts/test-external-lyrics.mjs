// Kiem chung viec DO va NHAN DIEN lyric cho nhac phat o app khac.
// Dung dung nhung chuoi tho ma Windows dua ra khi phat o trinh duyet.
//
//   npm run test:external
import { app } from 'electron'
app.setName('Lyra')

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else { failed++; console.error(`  FAIL ${name}  ${detail}`) }
}

// Chuoi tho <- tu Windows;  mong doi -> ten bai nhan dien duoc
const CASES = [
  {
    raw: { title: 'NƠI NÀY CÓ ANH | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP', duration: 260 },
    expect: 'Nơi Này Có Anh'
  },
  {
    raw: {
      title: 'Nhà Tôi Có Treo Một Lá Cờ (Official Lyric Video) - YouTube',
      artist: 'Hà Anh Tuấn'
    },
    expect: 'Nhà Tôi Có Treo Một Lá Cờ'
  },
  {
    raw: { title: 'Chúng Ta Của Hiện Tại', artist: 'Sơn Tùng M-TP - Topic' },
    expect: 'Chúng Ta Của Hiện Tại'
  },
  {
    raw: { title: 'Yesterday', artist: 'The Beatles' },
    expect: 'Yesterday'
  }
]

app.whenReady().then(async () => {
  const { resolveExternalLyrics } = await import('../src/main/lyrics/external')
  const { titleSimilarity } = await import('../src/main/lyrics/identify')

  for (const { raw, expect } of CASES) {
    const label = raw.title.slice(0, 46)
    const t0 = Date.now()
    let match = null
    try {
      match = await resolveExternalLyrics(raw)
    } catch (err) {
      check(label, false, 'nem loi: ' + err.message)
      continue
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1)

    if (!match) {
      check(label, false, `khong tim ra lyric (${secs}s)`)
      continue
    }

    const right = titleSimilarity(match.title, expect) >= 0.6
    check(
      label,
      right && match.lyrics.lines.length > 0,
      `-> "${match.artist} — ${match.title}" | ${match.from} | ` +
        `${match.lyrics.lines.length} dong ${match.lyrics.kind === 'synced' ? 'CO moc' : 'khong moc'} | ${secs}s`
    )
  }

  console.log(failed ? `\n${failed} truong hop that bai.` : '\nDo va nhan dien lyric cho app khac: dat het.')
  app.exit(failed ? 1 : 0)
}).catch((e) => { console.error('LOI:', e?.stack ?? e); app.exit(1) })
