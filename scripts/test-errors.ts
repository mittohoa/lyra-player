// Kiem tra bang dien giai loi: moi loi hay gap phai ra mot cau tieng Viet noi
// duoc chuyen gi va nen lam gi.
//
//   node scripts/test-errors.ts
import assert from 'node:assert/strict'
import { describe } from '../src/shared/errors.ts'

let passed = 0
const check = (name: string, fn: () => void): void => {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

/** Loi that su tu thu vien mang / he dieu hanh, giu nguyen van. */
const REAL: [string, string, string][] = [
  ['mat mang', 'getaddrinfo ENOTFOUND lrclib.net', 'Internet'],
  ['may chu cat ngang', 'read ECONNRESET', 'ngắt kết nối'],
  ['cho qua lau', 'connect ETIMEDOUT 142.250.66.14:443', 'chậm'],
  ['bi chan vi hoi nhieu', 'yt-dlp that bai: ERROR: HTTP Error 429: Too Many Requests', 'Chờ vài phút'],
  ['bi tu choi', 'LRCLIB 403 Forbidden', 'từ chối'],
  ['khong co', 'Zing 404 Not Found', 'Không tìm thấy'],
  ['may chu hong', 'NhacCuaTui 502 Bad Gateway', 'sự cố'],
  ['mat file', "ENOENT: no such file or directory, open 'D:\\\\Music\\\\a.mp3'", 'Không tìm thấy file'],
  ['khong co quyen', "EACCES: permission denied, open 'C:\\\\Windows\\\\x'", 'quyền'],
  ['file dang bi giu', "EBUSY: resource busy or locked, unlink 'a.mp3'", 'chương trình khác'],
  ['het o dia', 'ENOSPC: no space left on device', 'đầy'],
  ['thieu yt-dlp', 'Chua tim thay yt-dlp. Vao Cai dat > YouTube de cai dat.', 'yt-dlp'],
  ['du lieu la', 'Unexpected token < in JSON at position 0', 'dữ liệu lạ'],
  ['sai chu ky', 'Zing tu choi: Incorect signature', 'xác thực']
]

for (const [name, raw, expect] of REAL) {
  check(`${name}: noi ro chuyen gi`, () => {
    const said = describe(new Error(raw))
    assert.ok(
      said.includes(expect),
      `"${raw}"\n     ra: "${said}"\n     can chua: "${expect}"`
    )
    // Khong duoc de chuoi ky thuat lot ra man hinh
    assert.ok(!/ENOENT|ECONN|EACCES|ENOSPC|EBUSY|\bERROR:/.test(said), `con lo chuoi ky thuat: ${said}`)
  })
}

check('loi da co san cau tieng Viet thi giu nguyen', () => {
  const mine = new Error('Bài này chỉ nghe được ở Việt Nam.')
  assert.equal(describe(mine), 'Bài này chỉ nghe được ở Việt Nam.')
})

check('khong nhan ra thi dung cau du phong', () => {
  assert.equal(describe(new Error('kwyjibo'), 'Tải thất bại.'), 'Tải thất bại.')
  assert.equal(describe(new Error('kwyjibo')), 'Có lỗi xảy ra.')
})

check('thu khong phai Error cung khong lam no', () => {
  assert.equal(typeof describe(null), 'string')
  assert.equal(typeof describe(undefined), 'string')
  assert.equal(typeof describe('ENOTFOUND'), 'string')
  assert.equal(typeof describe({ code: 'ENOENT' }), 'string')
  assert.ok(describe('ENOTFOUND').includes('Internet'), 'chuoi tran van phai nhan ra')
})

check('cau tra ve luon la mot cau hoan chinh', () => {
  for (const [, raw] of REAL.map((r) => [r[0], r[1]])) {
    const said = describe(new Error(raw))
    assert.ok(said.length > 10, `qua ngan: ${said}`)
    assert.ok(/[.!]$/.test(said), `thieu dau cham: ${said}`)
    assert.equal(said[0], said[0].toUpperCase(), `khong viet hoa dau cau: ${said}`)
  }
})

console.log(`\n${passed} kiem tra dien giai loi deu dat.`)
