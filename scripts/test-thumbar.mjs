// Kiem chung thanh dieu khien duoi o xem truoc o taskbar.
//
// Windows khong cho doc lai thanh nay tu ben ngoai, nen bai kiem tra chay
// TRONG tien trinh chinh cua Electron: goi that `setThumbarButtons`, va chan
// lai loi goi de xem app dua len dung nhung nut nao.
//
//   npm run test:thumbar
import { app, nativeImage } from 'electron'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

app.setName('Lyra')

// Bai nay co ghi cai dat (bat/tat khung loi noi) - phai ghi vao thu muc tam,
// khong duoc dung vao cai dat that cua nguoi dung
const sandbox = mkdtempSync(join(tmpdir(), 'lyra-thumbar-'))
app.setPath('userData', sandbox)

function cleanup() {
  try {
    rmSync(sandbox, { recursive: true, force: true })
  } catch {
    // Thu muc tam se duoc he thong don sau
  }
}

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

app
  .whenReady()
  .then(async () => {
    // Chay tu thu muc goc du an (qua `npm run`)
    const root = process.cwd()

    // ---- 1. Icon phai co that, va phai la net trang tren nen trong suot ----
    for (const name of ['prev', 'play', 'pause', 'next', 'lyrics']) {
      const path = join(root, 'resources', 'thumbar', `${name}.png`)
      if (!existsSync(path)) {
        check(`co icon ${name}.png`, false, 'thieu file - chay `npm run icon:thumbar`')
        continue
      }
      const image = nativeImage.createFromPath(path)
      const { width, height } = image.getSize()
      check(`icon ${name}.png dung co va khong rong`, !image.isEmpty() && width === height, `${width}x${height}`)

      // Windows KHONG to lai mau, nen net phai trang san; va nen phai trong
      // suot, khong thi nut hien ra mot o vuong den
      const bmp = image.toBitmap() // BGRA
      let opaqueWhite = 0
      let transparent = 0
      for (let i = 0; i < bmp.length; i += 4) {
        const [b, g, r, a] = [bmp[i], bmp[i + 1], bmp[i + 2], bmp[i + 3]]
        if (a < 16) transparent++
        else if (r > 200 && g > 200 && b > 200) opaqueWhite++
      }
      const total = bmp.length / 4
      check(
        `icon ${name}.png net trang tren nen trong suot`,
        opaqueWhite > total * 0.02 && transparent > total * 0.4,
        `${Math.round((opaqueWhite / total) * 100)}% trang, ${Math.round((transparent / total) * 100)}% trong`
      )
    }

    // ---- 2. App dua len dung bon nut, va nut giua doi theo trang thai ----
    const { getSettings, patchSettings } = await import('../src/main/store')
    patchSettings({ overlay: { ...getSettings().overlay, enabled: false } })

    // Dung cua so chinh THAT, de `thumbar` di dung duong no van di
    const { createMainWindow } = await import('../src/main/windows')
    const win = createMainWindow({ show: false })

    // Chan lai loi goi ngay tren chinh doi tuong cua so - vao duoc ben trong
    // ma van de Windows dung thanh nut that
    const calls = []
    const real = win.setThumbarButtons.bind(win)
    win.setThumbarButtons = (buttons) => {
      calls.push(buttons)
      return real(buttons)
    }

    const { applyThumbar, setThumbarPlaying, resetThumbar } = await import('../src/main/thumbar')

    resetThumbar()
    check('dung duoc thanh nut', calls.length === 1, `${calls.length} lan goi`)
    if (!calls.length) {
      console.log('\n(bo qua cac phep sau vi chua dung duoc thanh nut)')
      win.destroy()
      cleanup()
      console.log(`\n${failed} kiem tra that bai.`)
      app.exit(1)
      return
    }

    const first = calls.at(-1) ?? []
    check('co dung bon nut', first.length === 4, `${first.length} nut`)
    check(
      'moi nut deu co icon that',
      first.every((b) => b.icon && !b.icon.isEmpty()),
      first.map((b) => (b.icon?.isEmpty() ? 'rong' : 'co')).join(', ')
    )
    check(
      'chu thich cua nut doc duoc bang tieng Viet',
      first.map((b) => b.tooltip).join(' | ').includes('Bài trước'),
      first.map((b) => b.tooltip).join(' | ')
    )
    check('dang dung thi nut giua la Phat', first[1]?.tooltip === 'Phát', first[1]?.tooltip)

    // ---- 3. Dang phat thi nut giua doi thanh Tam dung ----
    setThumbarPlaying(true)
    check('bat dau phat thi ve lai', calls.length === 2, `${calls.length} lan goi`)
    check('nut giua doi thanh Tam dung', calls.at(-1)[1]?.tooltip === 'Tạm dừng', calls.at(-1)[1]?.tooltip)

    // ---- 4. Nhip lap lai khong duoc ve lai (4 lan/giay) ----
    const before = calls.length
    for (let i = 0; i < 20; i++) setThumbarPlaying(true)
    check('nhip lap lai khong ve lai vo ich', calls.length === before, `them ${calls.length - before} lan goi`)

    // ---- 5. Bat khung loi noi thi chu thich nut cuoi doi theo ----
    patchSettings({ overlay: { ...getSettings().overlay, enabled: true } })
    applyThumbar()
    check(
      'bat loi noi thi nut cuoi doi chu thich',
      calls.at(-1)[3]?.tooltip === 'Tắt lời nổi',
      calls.at(-1)[3]?.tooltip
    )

    win.destroy()
    cleanup()

    console.log(failed ? `\n${failed} kiem tra that bai.` : '\nThanh nut o taskbar: dat.')
    app.exit(failed ? 1 : 0)
  })
  .catch((err) => {
    console.error('LOI:', err?.stack ?? err)
    cleanup()
    app.exit(1)
  })
