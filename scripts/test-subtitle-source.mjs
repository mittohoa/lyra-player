// Kiem chung: bat duoc phu de cho VIDEO, va van uu tien lyric cho BAI HAT.
//
//   npm run test:subs
import { app } from 'electron'
app.setName('Lyra')

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else { failed++; console.error(`  FAIL ${name}  ${detail}`) }
}

const CASES = [
  {
    label: 'bai hat 4 phut -> phai ra LYRIC',
    raw: { title: 'NƠI NÀY CÓ ANH | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP', duration: 260 },
    expectType: 'lyrics'
  },
  {
    label: 'video 10 phut co phu de that -> phai ra PHU DE',
    raw: { title: 'How to Speak So That People Want to Listen Julian Treasure TED', duration: 598 },
    expectType: 'subtitles',
    minLines: 50
  },
  {
    // Kenh nay CO tai phu de tieng Viet len, nhung chi von ven MOT dong quang
    // cao; va vi da co ban nguoi dang tai len nen YouTube khong cho ta ban may
    // tu nghe. Hien mot dong do suot 16 phut con te hon la khong hien gi.
    label: 'kenh chi tai len 1 dong quang cao -> phai TU CHOI',
    raw: {
      title: 'CTBBT#1: Hướng dẫn sử dụng Gimbal cho điện thoại từ A-Z: Zhiyun Smooth 4 | How tu use',
      duration: 963
    },
    expectNothing: true
  }
]

app.whenReady().then(async () => {
  const { resolveExternalLyrics } = await import('../src/main/lyrics/external')
  const { patchSettings } = await import('../src/main/store')
  const { findYtDlp } = await import('../src/main/sources/ytdlp')

  patchSettings({ externalSubtitles: true, subtitleLangs: 'vi,en' })
  const bin = await findYtDlp(true)
  check('co yt-dlp de lay phu de', !!bin, bin ?? 'khong tim thay')
  if (!bin) { app.exit(1); return }

  for (const { label, raw, expectType, minLines = 1, expectNothing } of CASES) {
    const t0 = Date.now()
    let m = null
    try {
      m = await resolveExternalLyrics(raw)
    } catch (err) {
      check(label, false, 'nem loi: ' + err.message)
      continue
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1)

    if (expectNothing) {
      check(label, !m, m ? `nhan nham ${m.lines.length} dong tu ${m.from}` : `khong nhan nham (${secs}s)`)
      continue
    }
    if (!m) { check(label, false, `khong tim duoc gi (${secs}s)`); continue }

    check(
      label,
      m.type === expectType && m.lines.length >= minLines,
      `-> ${m.type} tu ${m.from}${m.language ? ' (' + m.language + ')' : ''} | ` +
        `${m.lines.length} dong | "${m.title.slice(0, 40)}" | ${secs}s`
    )
    if (m.lines.length) {
      console.log(`        dong dau: [${m.lines[0].time.toFixed(1)}s] ${m.lines[0].text.slice(0, 60)}`)
    }
  }

  console.log(failed ? `\n${failed} truong hop that bai.` : '\nPhu de va lyric cho app khac: dat het.')
  app.exit(failed ? 1 : 0)
}).catch((e) => { console.error('LOI:', e?.stack ?? e); app.exit(1) })
