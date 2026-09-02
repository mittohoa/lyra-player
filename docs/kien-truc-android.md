# AURA cho Android — kiến trúc

> Phạm vi: **công cụ lời cho cả máy, cộng một trình nghe nhạc đầy đủ.** Đọc bài
> đang phát ở app khác và hiện lời nổi; tự tìm, tự phát, tự tải nhạc; thư viện
> trong máy; danh sách phát; dịch lời ngay trên máy.
>
> Stack: Kotlin thuần · minSdk 26 (Android 8) · targetSdk 36 (Android 16) · coroutines +
> StateFlow · Compose cho màn hình, View thuần cho khung lời nổi · Media3 cho
> phần phát · ML Kit cho phần dịch.
>
> **Hai biến thể phát hành, một mã nguồn** — xem §11.

Tài liệu này thay thế bản phác thảo trước. Bản đó ghi *"chỉ sản phẩm A — không
phát nhạc, không thư viện, không tải nhạc"*, và điều đó **không còn đúng**: từ
đó tới nay app đã đi qua chín mốc và trở thành cả hai sản phẩm.

---

## 1. Hai vai của cùng một app

AURA làm hai việc, và ranh giới giữa chúng chạy xuyên qua gần như mọi phần:

**Vai đồng hành** — nhạc phát ở Spotify, YouTube, Zing MP3, NhacCuaTui. AURA chỉ
đọc xem đang phát gì rồi hiện lời nổi đè lên. Đây là vai không ai làm thay được.

**Vai trình phát** — AURA tự tìm, tự phát. Lúc đó nó **sở hữu đồng hồ phát**, và
đó không phải chi tiết nhỏ: toàn bộ chuyện lời chạy lệch chỉ tồn tại ở vai thứ
nhất.

Hai vai gặp nhau ở một chỗ duy nhất — `AURA.now` (§3). Mọi thứ phía sau đó
(tìm lời, dịch, khung nổi, thẻ màn hình khoá) không biết nhạc đang đến từ đâu.

### Vì sao vai đồng hành trên Android tốt hơn hẳn trên Windows

1. **Nguồn dữ liệu tốt hơn.** `MediaSessionManager` trả về nghệ sĩ, tên bài,
   album, ảnh bìa, vị trí, trạng thái và tên app nguồn — ở các trường **riêng
   biệt**. Trên Windows chỉ có một chuỗi thô, phải đoán.
2. **Đẩy thay vì hỏi.** Đăng ký `MediaController.Callback` là hệ thống tự gọi
   lại khi có gì đổi. Bản Windows phải nuôi một tiến trình PowerShell hỏi liên
   tục 2 lần/giây.
3. **Vào được ô media của hệ điều hành.** Đây là thứ bản Windows không có. Khi
   AURA tự phát, nó sở hữu thẻ trên màn hình khoá — và **câu đang hát được đưa
   thẳng vào đó** (§6).

---

## 2. Bản đồ luồng dữ liệu

```
  ┌─ VAI ĐỒNG HÀNH ────────────┐   ┌─ VAI TRÌNH PHÁT ──────────────┐
  │ Spotify / YouTube / Zing…  │   │ Catalog: Zing + NCT + MediaStore │
  │            │               │   │            │                  │
  │            ▼               │   │            ▼                  │
  │ NotificationListenerService│   │ Playback ──► AURAPlaybackService │
  │   (neo của cả app, §4)     │   │              ExoPlayer + MediaSession │
  │            ▼               │   │            │                  │
  │  MediaSessionWatcher       │   │  localNow  │                  │
  │  (BỎ QUA gói của chính ta) │   │            │                  │
  └────────────┬───────────────┘   └────────────┬──────────────────┘
               └──────────► AURA.now ◄──────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
      LyricsRepository  TranslationRepository  Artwork
       (§5)              (ML Kit, §7)          (màu nền)
              │               │
              └───────┬───────┘
                      ▼
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
  OverlayHost    Thẻ media        Trang "Lời"
  (khung nổi)    (màn hình khoá)  (Compose)
```

Điểm mấu chốt: **`AURA.now` là hợp lưu**. AURA đang phát thì AURA thắng; AURA
tạm dừng mà app khác đang phát thì nhường.

---

## 3. Vòng lặp phải cắt: AURA đọc chính mình

Đây là lỗi tốn một vòng gỡ nhất trong cả dự án, và nó chỉ xuất hiện sau khi
AURA vừa tự phát vừa ghi lời lên thẻ media.

AURA ghi **câu đang hát** vào phần mô tả phiên media của mình để nó hiện trên
màn hình khoá. `MediaSessionWatcher` đọc mọi phiên media trên máy — kể cả phiên
của chính AURA. Nên câu hát trở thành "tên bài mới", app đi tra lời cho một câu
hát, kết quả lại ghi đè lên, và vòng tiếp:

```
Tim loi: 'Nhà Tôi Có Treo Một Lá Cờ — DTAP, Hà Anh Tuấn' - 'Nơi đâu tôi cũng bên mình lá cờ'
```

Cách sửa gồm hai nửa, thiếu một nửa là vẫn hỏng:

- `MediaSessionWatcher` **bỏ qua gói của chính mình** (`ownPackage`).
- Bài AURA tự phát đi một dòng riêng, `AURA.localNow`, lấy thẳng từ
  `Playback.currentTrack` — tên bài, nghệ sĩ, độ dài đều là **bản gốc từ nguồn
  nhạc**, không đoán từ chuỗi thô. Đọc `player.mediaMetadata` là đọc lại chính
  kết quả của mình.

Hệ quả tốt: bài AURA tự phát **không cần `Identify` đoán** gì cả. Cùng một bài,
qua YouTube sinh 4 phương án và trượt; qua AURA sinh 2 phương án và trúng ngay
phương án đầu.

---

## 4. Neo của cả app: `NotificationListenerService`

Không dùng foreground service tự viết. `NotificationListenerService` tự nó là
một service do hệ thống dựng và giữ sống khi người dùng đã cấp quyền đọc thông
báo, và nó **sống dai hơn** foreground service của chính ta. Đổi lại được một
chỗ trú chạy nền mà không phải hiện thông báo thường trực.

Ta **không đọc nội dung thông báo**. Lớp này tồn tại chỉ để hệ thống cho gọi
`getActiveSessions`.

Hệ thống giết và dựng lại lớp này bất cứ lúc nào, nên **mọi trạng thái nằm ở
`AURA`** (singleton ngoài service), không nằm trong nó.

### Khung nổi phải tự sống lại

Tiến trình AURA chỉ được neo bởi service này. Android giết nó khi máy thiếu bộ
nhớ — mà thời điểm dễ bị giết nhất chính là lúc người dùng đang ở trong app nhạc,
tức đúng lúc khung lời nổi cần có mặt nhất.

Nên trạng thái "đang bật khung nổi" phải **lưu xuống đĩa**
(`OverlayPrefs.isEnabled`), và `onListenerConnected` gọi `AURA.restoreOverlay`.
Chỉ ghi cờ khi `show()` thành công thật — thiếu quyền vẽ đè thì `show()` lặng lẽ
không làm gì, và ghi bừa sẽ thành một lần thử dựng khung vô ích mỗi lần hệ thống
nối lại service.

---

## 5. Tìm lời

Thứ tự các chặng xếp theo **giá phải trả, rẻ trước đắt sau**:

1. Lời **tự nhập** — người dùng đã bỏ công gõ thì không một lần tra mạng nào
   được ghi đè lên.
2. Bộ nhớ đệm — trả về **ngay**, không qua trạng thái "đang tìm". Nháy một khung
   trống rồi mới hiện chữ là cảm giác chậm nhất, dù thật ra chỉ tốn vài mili-giây.
3. Gọi mạng: `candidatesFrom` sinh tối đa 4 phương án, mỗi phương án hỏi **cả ba
   nguồn cùng lúc**. Hỏi lần lượt thì thời gian chờ là tổng của ba lần gọi.

### Ghi lời ra tệp `.lrc` — và bốn thư mục Android cho phép

Đọc lời thì đọc thẳng bằng `File` được ở gần như mọi nơi. **Ghi thì không.**
Android chặn tạo tệp `.lrc` ở phần lớn thư mục phương tiện, kể cả khi app có đủ
quyền đọc. Đo bằng chính app trên Pixel 6 Pro / Android 17:

| | Tạo `.lrc` |
|---|---|
| `Music` · `Movies` · `Download` · `Documents` (kể cả thư mục con) | được |
| `DCIM` · `Pictures` · `Recordings` · `Audiobooks` · `Podcasts` · `Notifications` · `Alarms` | `EPERM` |

**Chỉ bốn thư mục** nhận tệp `.lrc`. Và đây **không** phải chuyện "thư mục ảnh
chỉ nhận ảnh": `Recordings`, `Podcasts`, `Alarms` đều là thư mục âm thanh mà
vẫn chặn.

Bị chặn thì **không có quyền nào xin thêm được** — đây là luật hệ thống. Nên
màn hình không dừng ở câu báo lỗi mà mời người dùng **chọn chỗ khác để lưu**,
qua bộ chọn tệp của hệ thống. Đường đó không cần quyền gì và luôn đi được.

Ba chỗ đã sai và cách sửa, ghi lại vì cả ba đều dễ lặp:

- **Đoán nguyên nhân thay vì đo.** Câu báo từng đổ cho thẻ nhớ ngoài — trên một
  máy không có khe thẻ. Sửa lần hai thì đổ cho "thư mục ảnh như DCIM", trong khi
  `Recordings` cũng chặn. Câu báo bây giờ **kể ra chỗ được phép**, thứ đã đo
  được, chứ không đoán chỗ đang hỏng là loại gì.
- **`dich.exists()` nói dối khi bị chặn.** Nó trả về `false` dù tệp có thật, nên
  đừng dùng nó để phân biệt "đã có tệp" với "không được ghi".
- **Khai `text/plain` cho bộ chọn tệp thì nó tự thêm `.txt`**, ra
  `bài hát.lrc.txt` mà không trình phát nào nhận là lời. Dùng
  `application/octet-stream` thì tên giữ nguyên.

Bài đo nằm ở `DuongGhiLrcTest` (chạy trên máy thật). **Đừng rút ngắn danh sách
thư mục trong đó** — hai lần kết luận sai ở trên đều bắt đầu từ việc chỉ đo mấy
thư mục "chắc là được".

### `titleSimilarity` — chỗ từng sai và hậu quả

Bản đầu chia cho tập nhỏ hơn. Nghĩa là tên bài ngắn nằm gọn trong một tên video
dài sẽ đạt điểm tuyệt đối — và app hiện lời của **tên concert** thay vì tên bài.
Nay dùng trung bình điều hoà của cả hai chiều phủ (F1), nên cả hai phía đều phải
giống mới đạt điểm cao.

### Mốc thời gian đáng ngờ

Tìm đúng **tên** bài không có nghĩa là đúng **bản thu**. Lời của bản thu phòng
đắp lên một bản hát live thì lệch từ đầu tới cuối. Độ dài bài là manh mối rẻ nhất
và đáng tin nhất: lệch quá 15 giây thì bật `timingSuspect`, và giao diện chuyển
sang hiện lời dạng chữ trơn — không tô sáng, không tự cuộn, và nói rõ mốc có thể
lệch. **Hiện sai một cách tự tin còn tệ hơn hiện thật thà là không chắc.**

### Chạm để căn lại

Chạm vào câu đang nghe — **trên trang Lời hoặc ngay trên khung nổi** — là căn lại
cả bài. Một cú chạm thay cho hàng chục lần bấm ±0,5 giây.

Chạm ngay trên khung nổi là đường sửa **tại chỗ phát hiện ra lỗi**: đang xem
YouTube, thấy lời lệch, chạm vào câu mình đang nghe là xong — không phải thoát
app nhạc, mở AURA, rồi tìm tới trang Lời.

---

## 6. Khung lời nổi và thẻ màn hình khoá

### Cửa sổ

`TYPE_APPLICATION_OVERLAY` (API 26+; các kiểu cũ hơn đều đã bị Android chặn), với
`FLAG_NOT_FOCUSABLE | FLAG_NOT_TOUCH_MODAL | FLAG_LAYOUT_NO_LIMITS`.

View thuần chứ không Compose: `ComposeView` đặt trong cửa sổ của `WindowManager`
không có sẵn `ViewTreeLifecycleOwner` và `SavedStateRegistryOwner`, phải tự gắn
tay — thêm một tầng dễ hỏng mà chỗ này chỉ vẽ vài dòng chữ.

### Vẽ

Viền trước, thân chữ sau — vẽ ngược lại thì viền ăn lem vào nét chữ. Và vì nửa
trong của nét viền bị thân chữ đè, phải **nhân đôi** độ dày thì nhìn mới đúng như
đã đặt.

Chỉ vẽ lại khi **đổi dòng**, dù nhịp cập nhật là 10 lần/giây. Vẽ lại vô ích mỗi
100 ms là một đồng hồ đánh thức GPU suốt cả bài hát.

Câu dài hơn khung thì **thu chữ lại cho vừa**, không xuống dòng. Xuống dòng làm
số hàng đổi theo từng câu, khung sẽ phồng lên xẹp xuống suốt bài, và phép đổi
chạm-thành-số-dòng cũng không còn đúng.

### Ba đường tắt nhanh, xếp theo mức nhanh

1. **Giữ tay ngay trên khung** — ngón tay đang ở sẵn trên đúng thứ cần tắt. Máy
   rung một cái báo đã nhận. Ngưỡng dài hơn ngưỡng giữ thông thường 250 ms: tắt
   nhầm giữa bài khó chịu hơn phải giữ thêm một phần tư giây.
2. **Ô Quick Settings** — với Android 13+ có nút xin thêm ô bằng một chạm
   (`requestAddTileService`). Bản cũ hơn thì Android không cho app tự thêm ô, và
   đúng ra là vậy: bảng đó là chỗ của người dùng.
3. Nút trong app.

### Thẻ trên màn hình khoá

**Khung nổi không lên được màn hình khoá.** Keyguard nằm ở lớp cửa sổ cao hơn
`TYPE_APPLICATION_OVERLAY`; không có cờ nào lách được. Đã kiểm chứng bằng ảnh
chụp lúc khoá máy.

Đường đi được là thẻ media — và nó chỉ mở ra khi **AURA tự phát**, vì thẻ thuộc
về app đang phát. Lúc đó câu đang hát được đặt vào **dòng tiêu đề** của thẻ (chỗ
chữ to nhất), tên bài và nghệ sĩ dồn xuống dòng dưới.

Ba chi tiết phải đúng, thiếu một là hỏng:

- Dùng `replaceMediaItem`, **không** `setMediaItem`. Cùng một đường dẫn thì
  ExoPlayer chỉ đổi phần mô tả, không nạp lại. `setMediaItem` là ngắt nhạc một
  nhịp **mỗi câu hát**.
- **Tắt đọc thẻ ID3** (`Mp3Extractor.FLAG_DISABLE_ID3_METADATA`). ExoPlayer đọc
  thẻ ID3 trong file rồi ghi đè lên phần mô tả ta vừa đặt, kể cả khi ta đặt sau —
  nên cứ vài giây câu hát lại bị kéo ngược về tên bài.
- **Dòng trống trong .lrc thì giữ nguyên câu vừa hát.** File .lrc nào cũng có
  dòng trống giữa các đoạn; trả thẻ về tên bài ở đó biến màn hình khoá thành một
  chỗ nhấp nháy.

---

## 7. Dịch lời — ML Kit trên máy

Không nguồn nào (LRCLIB, Zing, NCT) có sẵn bản dịch — đã dò tận nơi. Nên dịch máy
là đường duy nhất.

Chạy **ngay trên máy**: không khoá API, không quota, không trả tiền, không gửi
lời bài hát ra ngoài, và chạy được khi mất mạng. Đổi lại bản dịch thô hơn bản
trên máy chủ — với lời bài hát vốn nhiều ẩn dụ thì càng thô. Nhưng mục tiêu
không phải một bản dịch đẹp, mà là để người nghe **hiểu nghĩa** câu đang hát.

Thứ tự chặng, cũng rẻ trước đắt sau:

1. Tắt, hoặc không có lời → không làm gì
2. Đoán ngôn ngữ (trên máy, vài mili-giây, không tải gì)
3. **Lời đã đúng thứ tiếng người dùng đọc → không làm gì.** Đây là trường hợp
   thường gặp nhất với người Việt nghe nhạc Việt, và nó không tốn một byte nào
4. Đã dịch lần trước → lấy trong bộ nhớ đệm
5. Gói ngôn ngữ có sẵn trên máy → dịch ngay
6. Chưa có gói → **hỏi người dùng rồi mới tải**

Dịch **từng dòng** chứ không gộp cả bài: gộp thì mô hình tự quyết định xuống dòng
ở đâu và số dòng trả về không còn khớp — mà khớp dòng mới là thứ ta cần.

Khoá bộ nhớ đệm là **băm của chính nội dung lời** cộng mã ngôn ngữ, không phải
tên bài. Nhờ vậy không thể có cảnh lời đã đổi nguồn (chia dòng khác) mà bản dịch
cũ vẫn còn nằm đó và ghép lệch từng dòng.

ML Kit đi **vòng qua tiếng Anh** cho mọi cặp ngôn ngữ, nên dịch Hàn sang Việt cần
cả hai gói. Đổi lại n ngôn ngữ chỉ tốn n gói chứ không phải n².

---

## 8. Phần trình phát

### Bộ máy

`MediaSessionService` của Media3, không phải foreground service tự viết. Hệ thống
tự lo thông báo, thẻ màn hình khoá, nút trên tai nghe, ô điều khiển âm thanh.

Giao diện nối vào bằng `MediaController` chứ không giữ thẳng `ExoPlayer`, dù cả
hai cùng một tiến trình: hệ thống có thể giết và dựng lại service bất cứ lúc nào,
và `MediaController` tự nối lại được.

Vuốt app khỏi danh sách gần đây mà **đang phát thì giữ nguyên** — vuốt app đi
không có nghĩa là "dừng nhạc".

### Đường phát lấy muộn

Hàng đợi chứa địa chỉ giả `lyra://<nguồn>/<mã>`; đường phát thật được hỏi **ngay
trước khi mở byte đầu tiên**, qua `ResolvingDataSource`. Hai lý do:

- Đường phát của cả Zing lẫn NCT **đều có hạn**. Xếp hai chục bài rồi nghe tới
  bài cuối sau một tiếng thì đường ấy đã chết.
- Zing phải gọi mạng một lần cho **mỗi** bài. Gọi hai chục lần chỉ để xếp hàng
  đợi là bắt người dùng trả giá cho những bài chưa chắc nghe tới.

Nhạc trong máy không đi qua đường này — địa chỉ `content://` dùng được ngay.

### Tìm

Zing và NCT được hỏi **cùng lúc** rồi trộn kiểu cài răng lược, không nối đuôi:
một nguồn trả nhiều kết quả kém mà xếp trước sẽ đẩy hết kết quả tốt của nguồn kia
xuống dưới màn hình. Nhạc trong máy xếp **trước** cả hai và không tính vào hạn
mức trộn — không tốn mạng, phát được khi mất sóng, và người dùng đã có nó rồi.

### Thư viện trong máy

Đọc qua `MediaStore`, không tự quét thư mục — Android từ 10 không cho app đi lang
thang trong bộ nhớ ngoài, và `MediaStore` chỉ cần quyền đọc **nhạc**.

Bộ lọc phải là **bỏ thứ chắc chắn không phải nhạc**, không phải đòi thứ chắc chắn
là nhạc. `is_music != 0` sai theo một kiểu rất khó thấy: cột đó có thể là `NULL`
khi máy chưa phân loại xong, mà trong SQL `NULL != 0` không phải "đúng" — nó là
`NULL`. File vừa chép vào máy sẽ biến mất khỏi thư viện không dấu vết.

### Giao diện

**Sân khấu là một chỗ cắm, không phải khung ảnh.** Hôm nay dựng ảnh bìa vuông;
có video thì cùng chỗ ấy đổi sang 16:9 và nhận một bề mặt vẽ. Thanh tua, nút bấm,
hàng đợi quanh nó không biết bên trong là gì. `MediaKind { AUDIO, VIDEO }` đã cắm
sẵn vào `Track` và `Playable` — ranh giới nhạc/video đi xuyên qua cả app, và sửa
một ranh giới đã chạy khắp nơi thì đắt hơn nhiều so với khai nó ra từ đầu.

**Thanh tua là cạnh dưới của sân khấu**, không phải một thanh trượt đặt ở đâu đó.
Kéo thì hiện vị trí *đang kéo* chứ không phải vị trí đang phát.

Màu chủ đạo lấy từ ảnh bìa nhuộm cả màn hình — tính trên **luồng nền**, vì đọc
điểm ảnh là việc của CPU và làm trong thân composable nghĩa là làm trên luồng
chính đúng lúc người dùng đang nhìn nhất.

### Hàng đợi và danh sách phát

Hàng đợi là **chỗ làm việc**; danh sách phát là thứ **giữ lại**. Một nút nối hai
cái đó.

Danh sách phát **không lưu đường phát** (`@Transient`): một danh sách mở lại sau
một tuần mà mang theo hai chục đường đã chết thì tệ hơn hẳn mang theo không gì
cả. Khoá là mã riêng chứ không phải tên — được phép trùng tên và đổi tên.

Lưu vào `filesDir` chứ không `cacheDir`: đây là dữ liệu người dùng tự tạo, khác
hẳn bộ nhớ đệm lời hay bản dịch vốn lúc nào cũng lấy lại được từ mạng.

---

## 9. Tải nhạc — chỉ có ở bản sideload

File đi vào `Music/AURA/` của bộ nhớ chung, không phải thư mục riêng của app. Tải
về là để **sở hữu**: gỡ AURA ra thì nhạc vẫn còn, và mọi trình phát khác đều thấy.
Không cần quyền ghi — từ Android 10, app được phép chèn file media của chính nó
vào bộ sưu tập chung. Cờ `is_pending` bật suốt lúc ghi, nên máy sập nguồn giữa
chừng thì bản ghi treo bị hệ thống dọn.

**Lời nằm trong chính file nhạc**, dạng thẻ ID3v2.3 khung `USLT`. File `.lrc` để
cạnh sẽ bị bộ nhớ giới hạn từ chối — thư mục `Music/` không nhận file chữ. Nhúng
vào lại là cách đúng hơn: lời đi theo bài sang mọi trình phát, không riêng AURA.

Ba lựa chọn trong đó:

- **v2.3 chứ không v2.4** — bản được đọc rộng rãi nhất, kể cả đầu phát cũ và dàn
  xe hơi.
- **`USLT` mang cả mốc thời gian**, dù theo chuẩn USLT là lời không mốc. Khung
  `SYLT` đúng chuẩn cho lời có mốc thì gần như không nơi nào hỗ trợ — đúng chuẩn
  mà không ai đọc được thì không giúp gì ai.
- **UTF-16 chứ không Latin-1**, nếu không "Nàng Thơ" thành một chuỗi dấu hỏi.

Thẻ cũ của nguồn bị **bỏ đi**: hai thẻ chồng lên nhau thì trình phát đọc cái đầu
tiên rồi bỏ cái sau — mà cái sau mới là của ta. Phải đọc 10 byte để biết có thẻ
hay không, và nếu **không** có thì 10 byte ấy là nhạc thật, phải ghi lại chứ
không được nuốt.

---

## 10. Quyền

| Quyền | Vì sao | Bắt buộc? |
|---|---|---|
| Đọc thông báo | Điều kiện để gọi `getActiveSessions`. Không đọc nội dung thông báo | Có — thiếu là mất vai đồng hành |
| Vẽ đè lên app khác | Khung lời nổi | Chỉ khi dùng khung nổi |
| `READ_MEDIA_AUDIO` (33+) | Thư viện trong máy. Xin đúng quyền **nhạc**, không đụng ảnh/video/tài liệu | Chỉ khi dùng thư viện |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Phát khi màn hình tắt. Bắt buộc khai từ Android 14 | Có, nếu tự phát |
| `POST_NOTIFICATIONS` (33+) | Thẻ điều khiển nhạc. Từ chối thì nhạc vẫn phát, chỉ mất thẻ | Không |
| `INTERNET` | Tra lời, tìm và phát nhạc | Có |

Cả ba quyền đầu đều **hỏi đúng lúc cần**, kèm một câu giải thích tại chỗ — không
dồn vào một màn hình dẫn nhập lúc mở app lần đầu, khi người dùng chưa hiểu vì sao.

---

## 11. Hai biến thể phát hành

| | `sideload` | `play` |
|---|---|---|
| Tải nhạc | Có | **Không có** |
| Mọi thứ khác | Đầy đủ | Đầy đủ |
| `applicationId` | `com.mittohoa.lyra_player` | như nhau |

Chính sách Google Play cấm app cho tải nội dung từ dịch vụ phát trực tuyến. Nên
bản lên Play không mang phần đó.

**Tách bằng bộ mã nguồn, không bằng cờ bật/tắt.** Toàn bộ phần tải nằm trong
`app/src/sideload/`; bản Play không *tắt* tính năng mà **không mang** tính năng.
Một cái cờ chạy lúc chạy vẫn để lại toàn bộ mã trong file cài đặt, và người duyệt
Play mở file ra xem thì thấy. Khác biệt giữa "không dùng" và "không có" là khác
biệt thật — đã kiểm chứng bằng cách tìm tên lớp trong mã dex:

| Lớp | sideload | play |
|---|---|---|
| `download/Id3` | 2 | **0** |
| `download/Downloader` | 5 | **0** |
| `download/Downloads` (vỏ) | 3 | 3 |
| `player/Playback` | 6 | 6 |

Cùng `applicationId`: đây là **một app, hai đường phát hành**. Không cài được cả
hai cùng lúc, và đúng ra là vậy.

```
./gradlew assembleSideloadDebug     # cài tay, có tải nhạc
./gradlew assemblePlayRelease       # lên Play
./gradlew bundlePlayRelease         # bản gộp, Play giao đúng một kiến trúc CPU
```

### Nhắm Android 16

`targetSdk 36`. Google Play đòi targetSdk không được cũ hơn một năm so với bản
Android mới nhất, nên con số này phải theo kịp hằng năm.

Nâng nó kéo theo cả chuỗi: AGP 8.5.2 chỉ hỗ trợ tới API 35, nên phải lên **AGP
8.13.2** và **Gradle 8.13**. Chọn bản 8.x cuối chứ không nhảy lên AGP 9 — 9.x đã
ra nhưng mang nhiều thay đổi phá vỡ mà ở đây không cần gì của nó.

AGP 8.13 bắt được một mâu thuẫn có sẵn từ trước: **không được tách gói theo kiến
trúc CPU khi dựng bản gộp `.aab`**. Nó đúng — bản gộp tự làm việc tách đó, và
làm cả hai là hai cơ chế giẫm lên nhau. Nay phần tách chỉ bật khi lệnh đang chạy
không phải dựng bản gộp, nên bản cài tay vẫn có gói riêng cho từng kiến trúc.

### Khoá ký

Khoá nằm **ngoài kho mã nguồn** (`~/.lyra-keys/`), và `keystore.properties` trỏ
tới nó thì nằm trong `.gitignore`. Không có file đó thì bản phát hành vẫn dựng
được, chỉ là không được ký — để người khác clone về vẫn build được, và họ phải
tự tạo khoá của mình. Khoá ký là danh tính của người phát hành, không phải của
mã nguồn.

Đây là **khoá tải lên**, không phải khoá ký cuối cùng: khi bật Play App Signing
thì Google giữ khoá ký thật, còn khoá này chỉ dùng để tải bản dựng lên — mất thì
xin cấp lại được. Dù vậy vẫn nên sao lưu.

### Cỡ app

`libtranslate_jni.so` của ML Kit nặng **15,6 MB cho mỗi kiến trúc CPU**. Đã bật
tách gói theo kiến trúc, nên bản phát hành arm64 là **19,8 MB**; Play chỉ giao
đúng gói máy người dùng cần. Bản gộp cả bốn kiến trúc (69 MB) chỉ là hiện vật
đóng gói cho ai cài tay.

---

## 12. Cỡ chữ đo từ màn hình

Một con số chốt cứng không thể vừa cho mọi máy. Khung lời nổi là thứ để **liếc
mắt đọc** trong lúc đang làm việc khác, nên chữ nhỏ quá thì nó vô dụng — mà người
dùng thường không nghĩ tới việc vào chỉnh, họ chỉ thấy tính năng này dở.

`sp` không lo được việc này: `sp` chỉ lo mật độ điểm ảnh và cỡ chữ hệ thống, tức
26sp trên máy nào cũng to bằng nhau tính theo xen-ti-met. Nhưng khung nổi chiếm
trọn bề ngang, nên trên máy gập mở ra cùng cỡ chữ ấy lại hoá bé so với khung.

Nên đo **bề ngang nhỏ nhất** của màn hình (không đổi khi xoay máy) rồi suy ra cỡ
chữ: 320dp → 25sp, 411dp → 32sp, tối đa 44sp. Cùng một phép đo, cùng một cách
nghĩ với bản Windows (`@shared/overlay-size.ts`).

Cài đặt đã lưu thì mặc định mới không đụng tới — thay vào đó, khi giá trị đang
lệch với cỡ đo được, chính con số ấy mọc thêm mũi tên và bấm được: `14 → 32`.

---

## 13. Cấu trúc gói

```
com.mittohoa.lyra
├── service/       AURA (trạng thái chung), AURANotificationListener, AURATileService
├── media/         MediaSessionWatcher, NowPlaying
├── lyrics/        Identify, LrcParser, Lyrics, LyricsRepository
├── sources/       Catalog, ZingClient, NctClient, LrclibClient, LocalLibrary, Http, Crypto
├── player/        AURAPlaybackService, Playback, StreamResolver, Artwork
├── translate/     OnDeviceTranslator, TranslationRepository, Languages
├── data/          LyricCache, OffsetStore, ManualLyricStore, OverlayPrefs,
│                  TranslatePrefs, TranslationCache, PlaylistStore
├── overlay/       OverlayHost, OverlayView
├── download/      DownloadResult · Downloads (mỗi biến thể một bản)
└── ui/            MainActivity, HomeScreen, PlayerPane, SearchPane, Playlists,
                   LyricEditor, AURAMark
```

| Gói | File | Dòng |
|---|---:|---:|
| `ui` | 8 | 2.849 |
| `sources` | 9 | 1.119 |
| `lyrics` | 6 | 977 |
| `service` | 3 | 721 |
| `player` | 5 | 625 |
| `data` | 8 | 596 |
| `overlay` | 2 | 580 |
| `download` | 5 | 409 |
| `translate` | 3 | 390 |
| `media` | 2 | 227 |
| **Tổng** | **51** | **~8.500** |

Phần chuyển thẳng từ bản Windows: `Identify` và `LrcParser` (dịch cú pháp, giữ
nguyên thuật toán và cả bộ kiểm tra), ý tưởng ba nguồn lời, bảng diễn giải lỗi.

---

## 14. Chỗ có thể vỡ

- **Bộ diệt nền của hãng.** Xiaomi, Oppo, Vivo, Samsung — mỗi hãng một kiểu, và
  hung hơn Android gốc nhiều. Người dùng phải tự cho AURA vào danh sách miễn trừ.
  Không có cách nào lách, chỉ có cách hướng dẫn. Bản vá khung nổi tự sống lại
  (§4) đỡ được phần Android gốc, không đỡ được phần này.
- **Zing/NCT đổi API.** Hỏng **cả hai** bản Windows và Android. Đây là mặt dễ vỡ
  nhất, và giờ nó gánh cả phần phát lẫn phần tải chứ không chỉ phần lời.
- **App không khai báo metadata tử tế.** `Identify` đỡ được phần nào, không phải
  tất cả — chỉ ở vai đồng hành, vì vai trình phát có tên bài gốc.
- **Vài chỗ chặn overlay.** Nội dung có DRM, một số game toàn màn hình, và **màn
  hình khoá** (§6).
- **Duyệt Play.** Ngay cả bản `play`, việc phát nhạc qua API nội bộ của Zing/NCT
  vẫn là rủi ro khi duyệt. Đây là rủi ro đã được nêu và đã được chấp nhận có ý
  thức, không phải điều bị bỏ sót.

---

## 15. Đã nghiệm thu tới đâu

Tất cả đều chạy thật trên Pixel 6 Pro (Android 14, `sw411dp`), không phải máy ảo:

| | |
|---|---|
| Đọc bài từ app khác | Zing MP3, YouTube |
| Ba nguồn lời | trúng từ lrclib, zing, nct |
| Khung nổi | nổi trên Play Store, tự sống lại sau khi tiến trình bị giết |
| Chạm căn lời | trên trang Lời và trên chính khung nổi |
| Giữ tay để tắt khung | 900 ms → cờ ghi `false`, cửa sổ biến mất |
| Cỡ chữ theo màn hình | `14 → 32`, một chạm là về đúng cỡ |
| Dịch lời | giao diện đúng; lời tiếng Việt **không bị đụng tới** |
| Tự phát | Zing MP3 tự nhường tiếng, lời khớp từng câu |
| Lời trên thẻ khoá màn hình | chạy đúng từng dòng |
| Tìm + hàng đợi | 20 kết quả hai nguồn xen kẽ, chuyển bài lấy đường phát đúng lúc |
| Thư viện trong máy | đọc, phát qua `content://`, tự sang bài kế |
| Danh sách phát | lưu 20 bài, **còn nguyên sau khi cài đè** |
| Tải nhạc | file 4,08 MB, `USLT` 42 dòng lời có mốc, `fffb` ngay sau thẻ |
| Hai biến thể | bản Play không có `Id3`/`Downloader` trong mã dex |

**Chưa nghiệm thu:** đường tải gói ngôn ngữ rồi dịch thật — cần một bài tiếng
nước ngoài đang phát.
