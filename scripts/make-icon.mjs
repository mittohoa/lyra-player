// Xuat resources/icon.svg thanh PNG 512px.
// Dung Electron lam bo raster de khoi them thu vien chi de doi mot file anh.
// electron-builder tu dung .ico da co tu file PNG nay.
//
//   npm run icon
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 512

const svg = readFileSync(join(root, 'resources', 'icon.svg'), 'utf8')
const html = `<!doctype html><meta charset="utf-8">
  <style>html,body{margin:0;background:transparent}svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>
  ${svg}`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  // Cho font/layout on dinh truoc khi chup
  await new Promise((r) => setTimeout(r, 500))

  const image = await win.webContents.capturePage()
  const out = join(root, 'resources', 'icon.png')
  writeFileSync(out, image.toPNG())

  const { width, height } = image.getSize()
  console.log(`Da xuat ${out} (${width}x${height})`)
  app.exit(0)
})
