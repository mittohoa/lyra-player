// Kiem chung bo dich CHAY TREN MAY: chon dung duong di, giu dung so dong, va
// co that su dich ra tieng Viet doc duoc khong.
//
// Lan chay dau se TAI ~100MB mo hinh ve. Cac lan sau lay tu dia.
//
//   npm run test:dich
import { app } from 'electron'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  duongDi,
  uocLuongMB,
  dichCacDong,
  datThuMucMoHinh,
  NGON_NGU_DOC
} from '../src/main/ai/local-translate'

app.setName('Lyra')

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok  ${name}${detail ? `  (${detail})` : ''}`)
  else {
    failed++
    console.error(`  FAIL ${name}  ${detail}`)
  }
}

// Dung chung thu muc mo hinh giua cac lan chay, khong thi lan nao cung tai lai
const CACHE = process.env.LYRA_MODEL_DIR || join(tmpdir(), 'lyra-mo-hinh-dich')

async function chay() {
  await app.whenReady()
  datThuMucMoHinh(CACHE)

  try {
    // ---- 1. Chon duong di ----
    check('Anh -> Viet di thang mot chang', duongDi('en', 'vi').length === 1)
    check(
      'Han -> Viet phai vong qua tieng Anh',
      duongDi('ko', 'vi').length === 2,
      duongDi('ko', 'vi')
        .map((m) => m.replace('Xenova/opus-mt-', ''))
        .join(' → ')
    )
    check('cung mot thu tieng thi khong co duong nao', duongDi('vi', 'vi').length === 0)
    check(
      'Anh -> Han: chua co mo hinh, tra ve rong chu khong bia',
      duongDi('en', 'ko').length === 0
    )
    check(
      'uoc luong dung luong theo so chang',
      uocLuongMB(duongDi('ko', 'vi')) === 204,
      uocLuongMB(duongDi('ko', 'vi')) + ' MB'
    )
    check('bon ngon ngu doc', NGON_NGU_DOC.length === 4, NGON_NGU_DOC.join(', '))

    // ---- 2. Dich that ----
    const dong = [
      "The club isn't the best place to find a lover",
      '',
      'I know you want me and you know I want you',
      '♪',
      'Every night we dance until the morning light'
    ]

    console.log('\n  … nap mo hinh (lan dau se tai ve, cho mot chut)\n')
    const t0 = Date.now()
    const ra = await dichCacDong(dong, 'vi')
    const giay = ((Date.now() - t0) / 1000).toFixed(1)

    check('co tra ve ket qua', !!ra)
    if (ra) {
      check('doan dung la tieng Anh', ra.tu === 'en', ra.tu)
      check(
        'so dong tra ve dung bang so dong dau vao',
        ra.ket.length === dong.length,
        `${ra.ket.length}/${dong.length}`
      )
      check('dong trong giu nguyen', ra.ket[1] === '', JSON.stringify(ra.ket[1]))
      check('dong chi co ky hieu nhac giu nguyen', ra.ket[3] === '♪', JSON.stringify(ra.ket[3]))
      check(
        'khong con ky hieu nhac mo hinh tu them vao',
        !ra.ket[0].includes('♪') && !ra.ket[2].includes('♪'),
        JSON.stringify(ra.ket[0])
      )
      check('cau dau da thanh tieng Viet', /[àáảãạăâêôơưđ]/i.test(ra.ket[0]))

      console.log('\n  Ban dich:')
      dong.forEach((d, i) => {
        if (d.trim() && d !== '♪') console.log(`    ${d}\n      → ${ra.ket[i]}`)
      })
      const soDong = dong.filter((d) => d.trim() && d !== '♪').length
      console.log(`\n  (${giay}s cho ${soDong} dong, ke ca luc nap mo hinh)`)
    }

    // ---- 3. Loi da dung thu tieng thi khong dich ----
    const viet = await dichCacDong(
      ['Nhà tôi có treo một lá cờ', 'Đỏ thắm những câu chuyện xưa'],
      'vi'
    )
    check('loi tieng Viet, doc tieng Viet -> khong dich gi ca', viet === null)
  } catch (err) {
    failed++
    console.error('  FAIL ngoai le:', err?.stack ?? err)
  }

  console.log(failed ? `\n${failed} kiem tra that bai.` : '\nBo dich tren may: dat.')
  app.exit(failed ? 1 : 0)
}

chay()
