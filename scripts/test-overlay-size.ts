// Kiem tra co khung loi noi do tu man hinh: mot con so chot cung khong the vua
// cho ca laptop 1366 lan man hinh 4K.
//
//   node scripts/test-overlay-size.ts
import assert from 'node:assert/strict'
import {
  suggestOverlay,
  suggestOverlayFontSize,
  suggestOverlayHeight
} from '../src/shared/overlay-size.ts'

let passed = 0
const check = (name: string, fn: () => void): void => {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

/** Cac be ngang that hay gap, tinh bang diem anh doc lap. */
const SCREENS = [1280, 1366, 1536, 1920, 2560, 3440, 3840]

check('man hinh cang rong thi chu cang to', () => {
  for (let i = 1; i < SCREENS.length; i++) {
    const nho = suggestOverlayFontSize(SCREENS[i - 1])
    const to = suggestOverlayFontSize(SCREENS[i])
    assert.ok(to >= nho, `${SCREENS[i]} ra ${to}, nho hon ${SCREENS[i - 1]} ra ${nho}`)
  }
})

check('co nao cung con doc duoc', () => {
  // Ke ca voi nhung be ngang vo ly - man hinh doc ke, cua so bi thu con mot vet
  for (const width of [0, 200, 640, ...SCREENS, 10_000]) {
    const size = suggestOverlayFontSize(width)
    assert.ok(size >= 24 && size <= 72, `${width} ra co chu ${size}`)
    assert.ok(Number.isInteger(size), `${width} ra co chu le: ${size}`)
  }
})

check('laptop pho thong ra co dung tam', () => {
  // Chan tren duoi cho hai cai may hay gap nhat. Khong phai con so thieng, chi
  // la de lan sau ai chinh ti le thi biet minh vua lam gi voi hai cai may nay.
  const laptop = suggestOverlayFontSize(1366)
  assert.ok(laptop >= 26 && laptop <= 34, `laptop 1366 ra ${laptop}`)

  const fullHd = suggestOverlayFontSize(1920)
  assert.ok(fullHd >= 36 && fullHd <= 46, `man hinh 1080p ra ${fullHd}`)
})

check('man hinh 4K khong con ra chu ti hon', () => {
  // Day chinh la loi da co: 34px chot cung tren man hinh 3840 la mot vet mo
  assert.ok(suggestOverlayFontSize(3840) > suggestOverlayFontSize(1920) * 1.5)
})

check('khung du cao cho so dong dang hien', () => {
  for (const width of SCREENS) {
    for (const context of [0, 1, 2, 3]) {
      const { fontSize, height } = suggestOverlay(width, context)
      const lines = 2 * context + 1
      assert.ok(
        height >= fontSize * lines,
        `${width} voi ${context} dong phu: cao ${height} khong du cho ${lines} dong chu ${fontSize}`
      )
    }
  }
})

check('giu nguyen kich thuoc cu tren man hinh 1080p', () => {
  // Khung cu la 920x190 voi chu 34. Cong thuc moi phai ra dung co ay cho chu
  // 34 - nguoi dung da quen khung nay, doi ti le thi doi ca cam giac.
  assert.equal(suggestOverlayHeight(34, 1), 190)
})

check('khung khong bao gio rong hon man hinh', () => {
  for (const width of [640, 800, ...SCREENS]) {
    assert.ok(suggestOverlay(width).width <= width, `man hinh ${width} ma khung rong hon`)
  }
})

console.log(`\n${passed} phep thu deu dat.`)
