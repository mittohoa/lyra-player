// Xuat cac icon 16px cho thanh dieu khien duoi o xem truoc o taskbar.
//
// Windows ve cac nut nay tren nen toi cua khung xem truoc, va KHONG to lai mau
// - nen phai la anh trang, nen trong suot. Kich thuoc chuan la 16x16 o mac 100%;
// xuat o 32x32 de man hinh 200% khong bi ram.
//
// Dung Electron lam bo raster, giong `make-icon.mjs` - khoi them thu vien chi
// de doi vai file anh nho.
//
//   npm run icon:thumbar
import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'resources', 'thumbar')
const SIZE = 32

/** Ve trong khung 24x24 cho khop voi bo icon con lai cua app. */
const ICONS = {
  prev: '<path d="M18.5 5.5v13L9 12z" fill="#fff"/><rect x="5" y="5.5" width="2.6" height="13" rx="1.3" fill="#fff"/>',
  play: '<path d="M7.5 4.6 19 12 7.5 19.4z" fill="#fff"/>',
  pause:
    '<rect x="6.4" y="5" width="4" height="14" rx="1.4" fill="#fff"/><rect x="13.6" y="5" width="4" height="14" rx="1.4" fill="#fff"/>',
  next: '<path d="M5.5 5.5v13L15 12z" fill="#fff"/><rect x="16.4" y="5.5" width="2.6" height="13" rx="1.3" fill="#fff"/>',
  // Dau hieu khung loi noi: mot khung chu nhat va hai dong chu ben trong
  lyrics:
    '<rect x="3.2" y="5.6" width="17.6" height="12.8" rx="2.6" fill="none" stroke="#fff" stroke-width="1.9"/>' +
    '<rect x="6.4" y="9.6" width="11.2" height="1.9" rx="0.95" fill="#fff"/>' +
    '<rect x="6.4" y="13.2" width="6.8" height="1.9" rx="0.95" fill="#fff"/>'
}

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true })

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true }
  })

  for (const [name, body] of Object.entries(ICONS)) {
    const html =
      `<!doctype html><meta charset="utf-8">` +
      `<style>html,body{margin:0;background:transparent}svg{display:block}</style>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24">${body}</svg>`

    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    // Cho mot nhip cho layout on dinh truoc khi chup
    await new Promise((r) => setTimeout(r, 120))

    const image = await win.webContents.capturePage()
    const file = join(OUT, `${name}.png`)
    writeFileSync(file, image.toPNG())
    console.log(`  ${name}.png  ${image.getSize().width}x${image.getSize().height}`)
  }

  console.log(`Da xuat ${Object.keys(ICONS).length} icon vao ${OUT}`)
  app.exit(0)
})
