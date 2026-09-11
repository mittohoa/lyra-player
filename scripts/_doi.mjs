// Cho toi khi mot dieu kien dung, thay vi cho mot so giay roi khang dinh.
//
// VI SAO CAN. May bai kiem dung giao dien that deu viet kieu "bam nut, ngu
// bon giay, roi kiem tra". Con so bon giay ay la mot lan doan: du tren may
// ranh, thieu khi may vua giet xong mot tien trinh Edge, khi o dia ban, khi
// thiet bi am thanh chua nha ra. Thieu mot lan la bai kiem bao hong - ma cai
// hong ay khong co that.
//
// Hong gia con te hon khong kiem: lan sau co loi THAT thi nguoi doc cung cho
// la "no chap chon day thoi" roi chay lai. Do la duong ma mot bo kiem tra mat
// het gia tri, va no bat dau tu dung mot cau `sleep` nhu the nay.
//
// Doi theo dieu kien thi nhanh hon o duong binh thuong (dung ngay khi xong,
// khong cho het bon giay) va chiu duoc may cham o duong xau.

export const nghi = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Goi `lay()` moi `nhip` mili-giay cho toi khi `dat(giaTri)` tra ve that.
 *
 * Tra ve gia tri cuoi cung doc duoc - ke ca khi het han. Ben goi tu quyet dinh
 * do la dat hay hong, va van co gia tri that de in ra thay vi chi biet "het
 * gio": cau bao "dong ho hien 0:00" noi duoc nhieu hon "qua han".
 *
 * `han` la TRAN chu khong phai thoi gian cho: duong binh thuong thoat ngay o
 * vong dau.
 */
export async function doiCho(lay, dat, { han = 20000, nhip = 400 } = {}) {
  const het = Date.now() + han
  let cuoi = await lay()
  while (!dat(cuoi)) {
    if (Date.now() >= het) return cuoi
    await nghi(nhip)
    cuoi = await lay()
  }
  return cuoi
}
