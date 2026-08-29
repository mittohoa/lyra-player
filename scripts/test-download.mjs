// Test tinh nang tai nhac: tai that mot bai tu NhacCuaTui va Zing,
// kiem tra file nhac, tag ID3, anh bia, va file .lrc di kem.
//
// Can mang. Neu nguon hong thi test bao ro chu khong im lang.
//
//   npm run test:download
//
// Phai bundle truoc khi chay: download.ts dung alias @shared/* ma Electron
// chay truc tiep khong resolve duoc.
import { app } from 'electron'
import { join } from 'node:path'
import { mkdtempSync, rmSync, statSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

app.setName('Lyra')

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

const QUERY = 'Noi nay co anh'

async function main() {
  const { downloadTrack } = await import('../src/main/download')
  const { nctSource } = await import('../src/main/sources/nct')
  const { zingSource } = await import('../src/main/sources/zing')
  const { patchSettings } = await import('../src/main/store')
  const NodeID3 = (await import('node-id3')).default

  const folder = mkdtempSync(join(tmpdir(), 'lyra-dl-'))
  patchSettings({ downloadFolder: folder })

  for (const source of [nctSource, zingSource]) {
    console.log(`\n--- ${source.label} ---`)
    try {
      const tracks = await source.search(QUERY, 1)
      if (!tracks.length) {
        check(`${source.label}: tim thay bai de tai`, false, 'khong co ket qua')
        continue
      }

      const track = tracks[0]
      const filePath = await downloadTrack(track)

      check(`${source.label}: tao ra file nhac`, existsSync(filePath), filePath.split(/[\\/]/).pop())

      const size = statSync(filePath).size
      check(`${source.label}: file co kich thuoc that`, size > 500_000, `${(size / 1048576).toFixed(1)} MB`)

      // Ten file phai giu duoc dau cach va gach ngang
      const name = filePath.split(/[\\/]/).pop()
      check(`${source.label}: ten file giu dau cach va gach ngang`, / - /.test(name), name)

      const tags = NodeID3.read(filePath)
      check(`${source.label}: ghi duoc tag ten bai`, !!tags.title, `"${tags.title}"`)
      check(`${source.label}: ghi duoc tag nghe si`, !!tags.artist, `"${tags.artist}"`)
      check(`${source.label}: nhung duoc anh bia`, !!tags.image, tags.image ? 'co' : 'khong co')

      const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')
      const hasLrc = existsSync(lrcPath)
      check(`${source.label}: dat file .lrc canh file nhac`, hasLrc, hasLrc ? lrcPath.split(/[\\/]/).pop() : 'khong co')
      if (hasLrc) {
        const lrc = readFileSync(lrcPath, 'utf8')
        check(`${source.label}: lyric co timestamp`, /\[\d+:\d+/.test(lrc), `${lrc.split('\n').length} dong`)
      }
    } catch (err) {
      check(`${source.label}: tai duoc bai`, false, err.message)
    }
  }

  try {
    rmSync(folder, { recursive: true, force: true })
  } catch {
    // Windows con giu file - de he thong tu don
  }

  console.log(failed ? `\n${failed} kiem tra that bai.` : '\nTat ca kiem tra tai nhac deu dat.')
  app.exit(failed ? 1 : 0)
}

app.whenReady().then(main).catch((err) => {
  console.error('  FAIL  loi khong bat duoc:', err?.message ?? err)
  app.exit(1)
})
