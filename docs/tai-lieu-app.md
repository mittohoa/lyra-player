# AURA — tài liệu toàn app

> Trạng thái: đang chạy được, 133 phép kiểm tra tự động đều đạt.
> Quy mô: 12.765 dòng mã nguồn + 2.947 dòng kịch bản kiểm tra.
> Nền: Electron 38 · React 19 · TypeScript 5.9 · Windows 11.

---

## 1. AURA là gì

**Lời bài hát hiện trên màn hình, cho bất cứ thứ gì đang phát trên máy.**

Đó là câu duy nhất đáng nhớ về app này. Mọi thứ khác trong AURA hoặc là để phục
vụ câu đó, hoặc là một sản phẩm thứ hai đi kèm — phần 3 nói thẳng chỗ nào là chỗ
nào.

Điểm khác biệt so với Zing, NhacCuaTui hay Spotify: các app đó chỉ hiện lời cho
nhạc **của chính chúng**. AURA đọc được nhạc đang phát ở **app khác** — Spotify,
Chrome, Edge, Windows Media Player — rồi tự đi dò lời cho bài đó và hiện lên một
khung nổi luôn nằm trên cùng màn hình.

---

## 2. Một vòng đời điển hình

Đây là đường đi đầy đủ, từ lúc bạn bấm play ở Spotify đến lúc chữ hiện ra:

```
Spotify phát nhạc
   │
   ▼
Windows SMTC ──────────► resources/smtc-watch.ps1 ──► src/main/smtc.ts
(hệ điều hành ghi nhận   (cầu PowerShell + WinRT,     (đọc từng dòng JSON,
 app nào đang phát gì)    mỗi nhịp một dòng JSON)      bù thời gian trôi)
   │
   │  { app: "Spotify", title: "NƠI NÀY CÓ ANH | OFFICIAL MV | SƠN TÙNG M-TP", ... }
   ▼
src/main/lyrics/identify.ts
   │  Bóc rác khỏi tên: ngoặc quảng cáo, "- YouTube", "Official", "【MV】"
   │  Sinh nhiều phương án (nghệ sĩ, tên bài) vì không thể biết chắc vế nào là vế nào
   │  → [ ("Sơn Tùng M-TP", "NƠI NÀY CÓ ANH"), ("NƠI NÀY CÓ ANH", "Sơn Tùng M-TP"), ... ]
   ▼
src/main/lyrics/external.ts
   │  Bài ngắn  → thử lời trước:  LRCLIB → Zing MP3 → NhacCuaTui
   │  Video dài → thử phụ đề trước: YouTube (bản người đăng, rồi bản máy tự nghe)
   │  Chỉ nhận khi tên trả về đủ giống (≥ 0,6) — hiện nhầm lời bài khác còn tệ hơn không hiện
   ▼
Cửa sổ overlay (src/renderer/src/OverlayView.tsx)
   Khung trong suốt, không viền, luôn trên cùng, chuột đi xuyên qua được
```

Vị trí phát là chỗ dễ sai nhất: Windows chỉ đưa một **ảnh chụp** vị trí kèm mốc
`lastUpdated`, không phải vị trí lúc này. Không bù phần thời gian đã trôi thì lời
luôn chạy chậm hơn nhạc vài giây. AURA bù hai lần — một lần ở tiến trình chính
lúc gửi, một lần ở giao diện theo từng khung hình — nên đồng hồ chạy mượt.

---

## 3. Bản đồ tính năng — và chỗ đang phình ra

Đây là phần trả lời trực tiếp cho câu "app đang phình to tính năng".

AURA hiện đang là **hai sản phẩm nằm chung một cửa sổ**:

### Sản phẩm A — công cụ lời cho cả máy  ← *đây là AURA*

| Phần | File chính | Vì sao nó thuộc lõi |
|---|---|---|
| Đọc nhạc app khác (SMTC) | `main/smtc.ts` + `resources/smtc-watch.ps1` | Không có nó thì không còn app này |
| Nhận diện bài từ chuỗi thô | `main/lyrics/identify.ts` | Tên Windows đưa ra là tên video, đem tra thẳng thì trượt |
| Dò lời nhiều nguồn | `main/lyrics/external.ts`, `lrclib.ts`, `sources/zing.ts`, `sources/nct.ts` | Chính là việc phải làm |
| Phụ đề cho video dài | `main/subtitles/` | Cùng một lời hứa, chỉ khác loại nội dung |
| Khung lời nổi | `renderer/src/OverlayView.tsx`, `main/windows.ts` | Chỗ chữ hiện ra |
| Sửa lời, chỉnh lệch, ghi `.lrc` | `components/LyricsEditor.tsx`, `main/lyrics/index.ts` | Khi máy dò sai thì phải sửa được bằng tay |
| Căn mốc thời gian bằng AI | `main/ai/align.ts`, `whisper.ts` | Lời không mốc thì không chạy theo nhạc được |
| Dịch lời | `main/ai/translate.ts` | Mở rộng hợp lý, nhưng đã là vòng ngoài |

### Sản phẩm B — một trình nghe nhạc đầy đủ

| Phần | File chính | Đánh giá |
|---|---|---|
| Thư viện nhạc trong máy | `main/library.ts`, `components/LibraryView.tsx` | Ít dùng nhất khi người nghe chủ yếu nghe online |
| Danh sách phát | `store/playlists.ts`, `components/PlaylistView.tsx` | Đi kèm thư viện, cùng mức ít dùng |
| Hàng đợi, trộn bài, lặp | `store/player.ts`, `components/QueuePanel.tsx` | Cần, một khi đã tự phát nhạc |
| Tìm và phát online (4 nguồn) | `main/sources/` | Nhiều mã nhất, dễ hỏng nhất — API nội bộ của Zing/NCT có thể đổi bất cứ lúc nào |
| Tải nhạc về máy | `main/download.ts` | Sản phẩm thứ ba nếu xét cho kỹ |

**Nhận định thẳng:** sản phẩm B nặng hơn sản phẩm A về khối lượng mã, nhưng nhẹ
hơn hẳn về lý do tồn tại. Zing và YouTube đã làm tốt việc nghe nhạc; cái không
ai làm thay được là sản phẩm A.

Ba hướng, chưa chọn hướng nào:

1. **Giữ nguyên.** Mọi thứ đang chạy và có kiểm tra tự động. Cái giá là mỗi lần
   Zing hay NCT đổi API thì phải đi sửa.
2. **Thu về lõi.** Bỏ thư viện + danh sách phát + tải nhạc, giữ phát online và
   toàn bộ sản phẩm A. Ước chừng bớt được ~2.500 dòng và ba mặt dễ hỏng.
3. **Tách đôi.** AURA = công cụ lời; phần nghe nhạc thành một chế độ tắt được
   trong Cài đặt. Không mất mã, nhưng mặc định gọn.

**Về đề nghị thêm luồng TV (FPT và nguồn khác):** đó sẽ là sản phẩm thứ ba, và
nó kéo theo cả một nhánh mới — AURA hiện chỉ có thẻ `<audio>`, muốn xem TV thì
phải có `<video>`, thư viện HLS (`hls.js`), và cửa sổ video nổi. Việc này khả
thi, nhưng nên quyết sau khi đã chốt ba hướng ở trên. Tôi đã dừng lại chưa làm.

---

## 4. Kiến trúc

Ba tiến trình, ranh giới rõ ràng:

```
┌─ Tiến trình chính (Node) ──────────────────────────────────┐
│  Mọi thứ chạm ra ngoài: mạng, ổ đĩa, hệ điều hành,          │
│  tiến trình con (PowerShell, yt-dlp, whisper)               │
│                                                             │
│  src/main/  ─ sources/    4 nguồn nhạc online              │
│               lyrics/     dò lời, nhận diện bài            │
│               subtitles/  đọc và tải phụ đề                │
│               ai/         whisper.cpp + Claude API         │
│               logger.ts   nhật ký + diễn giải lỗi          │
└────────────────────┬────────────────────────────────────────┘
                     │  IPC (mọi kênh đều được bọc bắt lỗi)
┌────────────────────┴────────────────────────────────────────┐
│  src/preload/  Cầu duy nhất; `contextBridge`, không lộ Node │
└────────────────────┬────────────────────────────────────────┘
                     │  window.api.*
┌────────────────────┴────────────────────────────────────────┐
│  Giao diện (Chromium)          │  Cửa sổ overlay            │
│  src/renderer/src/App.tsx      │  src/renderer/src/         │
│  + 5 kho zustand               │    OverlayView.tsx         │
└─────────────────────────────────────────────────────────────┘

src/shared/  Kiểu dùng chung + bảng diễn giải lỗi (cả hai bên đều nhập)
```

Vài quyết định đáng ghi lại, kèm lý do:

- **Giao thức `media://` tự viết** (`main/protocol.ts`) — file nhạc trong máy
  không đọc thẳng bằng `file://` được, và thẻ `<audio>` cần hỗ trợ HTTP Range để
  tua. Tự xử lý 206/416/404.
- **Chèn `Referer`** (`webRequest.onBeforeSendHeaders`) — CDN của Zing và NCT từ
  chối yêu cầu không có Referer, mà thẻ `<audio>` thì không tự gửi được.
- **Lấy màu chủ đạo của ảnh bìa ở tiến trình chính** (`main/artwork.ts`) — làm ở
  giao diện thì vướng CORS với CDN ảnh. Dùng `nativeImage`.
- **Cầu PowerShell cho SMTC** — WinRT không gọi thẳng từ Node được. Một tiến
  trình chạy dài, mỗi nhịp in một dòng JSON.

---

## 5. Từng phần, và giới hạn đã đo được

### 5.1 Nguồn nhạc online

| Nguồn | Tìm | Phát | Lời | Ghi chú |
|---|:-:|:-:|:-:|---|
| Zing MP3 | ✔ | ✔ | ✔ | API nội bộ. Chữ ký HMAC-SHA512 trên `path + sha256(tham số đã sắp)` — và **chỉ ký một số tham số nhất định**, ký hết là hỏng |
| NhacCuaTui | ✔ | ✔ | ✔ | API nội bộ tại `graph.nhaccuatui.com`. Lời **mã hoá RC4**, khoá nằm trong `keyDecryptLyric` |
| YouTube | ✔ | ✔ | ✔ | Qua `yt-dlp`; app tự tải được bản chính thức từ GitHub |
| Spotify | ✔ | ✘ | ✘ | Chỉ tra cứu thông tin — Spotify không cho phát ngoài SDK của họ |
| URL / radio | — | ✔ | — | mp3, HLS audio, luồng radio |

Cả Zing và NhacCuaTui đều là API **nội bộ**, không có cam kết nào. Hôm nay chạy,
mai họ đổi là hỏng. Đây là mặt dễ vỡ nhất của app.

### 5.2 Khung lời nổi

Trong suốt, không viền, `alwaysOnTop('screen-saver')` nên nằm trên cả taskbar.
Chỉnh được: cỡ chữ, font, màu chữ, màu viền và độ dày viền (để đọc được trên nền
sáng), độ mờ nền, số dòng phụ trước/sau, canh lề, hiện hay ẩn khi tạm dừng.

Bật "click xuyên qua" thì chuột đi thẳng xuống cửa sổ bên dưới
(`setIgnoreMouseEvents(true, { forward: true })`) — khung chỉ còn để nhìn.

### 5.3 Căn mốc thời gian bằng AI (chạy trên máy)

Lời không có mốc thời gian thì không chạy theo nhạc được. AURA dùng
**whisper.cpp** nghe lại bài hát rồi khớp bản nghe được với lời có sẵn (LCS +
nội suy tuyến tính + khớp từ gần đúng).

Đã đo trên bài có đáp án chuẩn:

| Cách khớp từ | Sai số trung vị |
|---|---|
| Chỉ khớp từ giống hệt | 4,2 giây |
| Cho lệch 1 ký tự, từ ≥ 3 chữ | **2,0 giây** ← đang dùng |
| Cho lệch 1 ký tự, từ ≥ 2 chữ | 5,6 giây (tệ hơn) |

Model: `tiny` 74 MB · `base` 141 MB (mặc định) · `small` 465 MB.
Một bài 4 phút mất khoảng 110 giây với `base`.

Hai cái bẫy đã gặp và đã xử lý: `whisper-cli` thoát mã 2 khi đường dẫn có dấu
tiếng Việt (phải chép sang tên ASCII trước); và `-ml 1 -sow` chậm đến mức không
dùng được (hơn 12 phút cho một bài) nên dùng cách chia đoạn mặc định rồi nội suy
thời điểm từng từ trong đoạn.

### 5.4 Phụ đề cho video

Video dài hơn 8 phút thì AURA hiểu đó không phải bài hát và đi tìm phụ đề trước.
Đọc được `.srt`, `.vtt`, `.ass`.

Ba cái bẫy của YouTube, đều đã kiểm chứng trên video thật:

1. Khi một ngôn ngữ **đã có bản người đăng tải lên**, YouTube trả lại chính bản
   đó ở ô `automatic_captions` — nghĩa là với video kiểu ấy **không có đường nào
   tới bản máy tự nghe**.
2. Có kênh tải lên "phụ đề" chỉ gồm đúng một dòng quảng cáo. Cộng với (1) thì bí
   thật — nên AURA **từ chối hẳn**: dưới 3 dòng, hoặc dưới một dòng mỗi 3 phút,
   thì coi như không có. Hiện một dòng "nhớ like và đăng ký" suốt 16 phút còn tệ
   hơn không hiện gì.
3. URL `vtt` của bản máy tự nghe trả về một **playlist HLS**, không phải phụ đề.

Vì thế AURA **đọc metadata để quyết định** nhưng **giao cho yt-dlp tải** — gọi
thẳng URL bằng `fetch` thì Google trả 429 rất nhanh.

### 5.5 Tải nhạc

Tải chất lượng cao nhất nguồn cho, ghi tag (tên bài, nghệ sĩ, album, ảnh bìa) và
ghi kèm file `.lrc` cạnh file nhạc. Mặc định vào `Music/AURA`.

> ⚠️ Tải nội dung từ Zing, NhacCuaTui hay YouTube vi phạm điều khoản dịch vụ của
> họ, và sao chép cho mục đích cá nhân ở Việt Nam là vùng xám về pháp lý. Vì vậy
> tính năng này **chỉ có ở bản cài tay**, không có ở bản phát hành qua cửa hàng
> ứng dụng — chính sách của các cửa hàng cấm thẳng.

### 5.6 Hệ thống ghi nhận lỗi

Ba lớp, không lớp nào để lọt:

1. **Bọc toàn bộ IPC.** Cả 51 kênh đều đi qua một lớp bọc chung
   (`main/ipc.ts`), nên không thể quên kênh nào. Lỗi được ghi nhật ký, đổi thành
   câu tiếng Việt, rồi mới trả về giao diện. Preload bóc luôn tiền tố
   `Error invoking remote method '...'` mà Electron tự dán vào.
2. **Lưới cấp tiến trình.** `uncaughtException` và `unhandledRejection` ở tiến
   trình chính; `error` và `unhandledrejection` ở cả hai cửa sổ giao diện;
   `render-process-gone` tự tải lại cửa sổ. Mặc định của Electron là sập không
   một lời giải thích.
3. **Bảng diễn giải** (`shared/errors.ts`). `ENOENT` không giúp được ai. Bảng
   này đổi mọi lỗi hay gặp — mất mạng, 429, hết ổ đĩa, thiếu quyền, thiếu
   yt-dlp, sai khoá API — thành một câu nói rõ chuyện gì **và nên làm gì**. Có
   18 phép kiểm tra riêng cho bảng này, trong đó có một phép bảo đảm không chuỗi
   kỹ thuật nào lọt ra màn hình.

Nơi lỗi hiện ra: toast bốn mức (thông tin / xong việc / cảnh báo / lỗi) ở góc
trên phải; và **Cài đặt → Nhật ký**, xem được ngay trong app, bấm vào từng dòng
để mở chi tiết kỹ thuật, chép được cả nhật ký, mở được thư mục file. File nhật
ký nằm ở `%APPDATA%/AURA/logs/`, một file mỗi ngày, giữ 7 ngày, tối đa 5 MB.

Việc chạy nền có cơ chế riêng vì không có ai đang đứng đợi: cầu SMTC chết thì tự
dựng lại 3 lần rồi mới chịu thua và báo; bị YouTube chặn 429 thì nói rõ là tạm
thời và sẽ tự hết.

### 5.7 Logo động

Cùng một hình với logo AURA, chỉ khác là nó cử động — dùng ở mọi trạng thái chờ
thay cho vòng xoay chung chung. Hai chuyển động cùng chu kỳ 1,5 giây nên ăn nhịp
nhau: **cặp nốt lắc quanh dấu xà** như đang bắt nhịp, **thanh lời chạy từ trái
sang** như một dòng lyric đang hiện dần. Bản `block` (dùng ở màn hình khởi động)
có thêm một vệt sáng chạy vòng quanh.

Máy đặt giảm chuyển động (`prefers-reduced-motion`) thì bỏ hết phần lắc và xoay,
chỉ giữ một nhịp thở rất chậm — im hoàn toàn thì người dùng tưởng app treo.

---

## 6. Kiểm chứng

133 phép kiểm tra, chạy bằng `npm test`, đều đạt.

| Bộ | Số phép | Kiểm cái gì |
|---|---:|---|
| `test-lrc` | 11 | Đọc và ghi `.lrc` |
| `test-align` | 14 | Thuật toán căn mốc |
| `test-identify` | 14 | Bóc tên bài khỏi chuỗi thô Windows đưa ra |
| `test-subtitles` | 13 | Đọc `.srt` / `.vtt` / `.ass` |
| `test-errors` | 18 | Bảng diễn giải lỗi |
| `test-protocol` | 6 | Giao thức `media://` và HTTP Range |
| `test-playback` | 15 | Phát nhạc, hàng đợi, danh sách phát — chạy app thật |
| `test-smtc` | 10 | Đọc nhạc app khác — chạy app thật |
| `test-error-ui` | 14 | Toàn hệ thống báo lỗi và logo động — chạy app thật |
| `test-translate` | 17 | Đường dịch lời |

Các bộ "chạy app thật" mở AURA lên và điều khiển qua Chrome DevTools Protocol,
không giả lập gì cả.

Ngoài ra còn vài kịch bản cần mạng nên không nằm trong `npm test`:
`test:subs` (phụ đề thật từ YouTube), `test:download`, `test:external`,
`test:whisper`, và `test-subs-live.mjs` — bộ này mở Edge phát một video YouTube
thật rồi xem AURA có nhận ra và dò được lời không.

---

## 7. Giới hạn đã biết

- **AURA không hiện trong khay media của Windows.** Nhạc do chính AURA phát
  không xuất hiện ở ô điều khiển media của hệ điều hành. Đây là giới hạn của
  Electron; đã thử ba cờ Chromium khác nhau, không cờ nào ăn, đã gỡ hết.
- **Zing và NhacCuaTui là API nội bộ.** Không có cam kết. Họ đổi là hỏng.
- **Spotify chỉ tra cứu được thông tin**, không phát được.
- **Căn mốc bằng AI sai trung vị 2 giây.** Đủ để lời chạy đúng đoạn, không đủ để
  hát karaoke theo từng chữ.
- **Máy dịch nhanh sai chừng ba dòng trên mười.** Đo trên 35 dòng lời thật:
  `opus-mt` dùng được 71%, `NLLB` dùng được 100% nhưng chậm gấp sáu lần.
  Cả hai chạy tại chỗ, không khoá API, không tiền.
- **Model `small` chưa đo được độ chính xác** — mỗi lần chạy quá lâu.
- **Chỉ chạy trên Windows.** Phần đọc nhạc app khác dựa vào SMTC, là thứ riêng
  của Windows.

---

## 7b. Đổi tên Lyra → AURA, và cái bẫy thư mục dữ liệu

App đổi tên ở Android 0.3.8 và Windows 0.1.6. Chuyện tưởng chỉ là sửa chữ, thực
tế có hai chỗ làm hỏng dữ liệu hoặc làm chết app.

**Windows: `productName` trong `package.json` phải giữ nguyên là `Lyra`.**
Electron lấy `app.getPath('userData')` từ đúng trường đó. Đổi nó thành `AURA` là
thư mục dữ liệu nhảy từ `%APPDATA%/Lyra` sang `%APPDATA%/AURA`, và mọi thứ người
dùng đã có — cài đặt, thư viện, danh sách phát, lời tự nhập, độ lệch giờ từng
bài, bộ nhớ đệm lời, và mô hình AI căn giờ đã tải (thư mục `ai`, đo được 675 MB
trên một máy đang dùng) — nằm lại chỗ cũ mà app không còn nhìn thấy. Đã thử
thật một lần và thấy `settings.json` rơi sang thư mục mới.

Tên hiển thị đặt ở `electron-builder.yml`: `productName: AURA` lo tên exe, thư
mục cài, lối tắt; `artifactName` ghi cứng tiền tố `AURA-`. Không cần dòng mã nào.

**Cách chữa bằng mã đã thử rồi bỏ:** gọi `app.setPath('userData', ...)` lúc khởi
động. Vừa thừa vừa hỏng — nó đè lên cả `--user-data-dir` mà người dùng tự chỉ,
tức là lặng lẽ phớt lờ lựa chọn của họ. Bộ kiểm bắt được ngay: `test-error-ui`
chạy app với thư mục riêng rồi không thấy tệp nhật ký nào ở đó.

**Giữ nguyên có chủ ý, đừng "dọn cho nhất quán":**

| Thứ | Vì sao giữ |
|---|---|
| `appId: com.mittohoa.lyra_player` | Google Play nhận diện app bằng nó, và không đổi được sau khi đã đăng ký |
| Gói mã nguồn Android `com.mittohoa.lyra.*` | Đổi là tên thành phần dịch vụ đọc thông báo đổi theo, người đang thử **bị thu hồi quyền** đó |
| Scheme `lyra://` | Đã đăng ký với hệ điều hành |
| Kho `mittohoa/lyra-player` | Địa chỉ trang phát hành và trang web |
| Thư mục tải nhạc `Music/Lyra` | Đổi là nhạc người dùng đã tải nằm ngoài tầm nhìn của app |
| Tên nội bộ `LyraLoader` | Chỉ là tên biến, đổi chỉ tạo nhiễu trong lịch sử |

**Android: chỗ đổi tên từng làm app chết.** Manifest gọi thành phần bằng tên
tương đối (`.service.LyraNotificationListener`), nên một lượt đổi tên tràn lan
đã đổi luôn ba tên đó trong khi lớp Kotlin giữ nguyên → `ClassNotFoundException`,
mất cả đọc thông báo, phát nhạc và ô cài đặt nhanh. Giờ có
`ThanhPhanManifestTest` nạp thử từng lớp manifest khai — và nó đã được chứng
minh là **bắt được lỗi** bằng cách cố tình tái tạo lỗi đó.

---

## 8. Cập nhật

AURA không nằm trong cửa hàng nào, nên phải tự lo việc báo có bản mới. Không lo
thì một người cài tay bản 0.1.0 sẽ dùng nó mãi mãi, kể cả sau khi lỗi họ gặp đã
được sửa từ lâu — và họ không có cách nào biết.

Một **bản phát hành GitHub mang cả hai nền tảng**: APK Android và exe Windows
nằm chung một thẻ, kèm `SHA256SUMS.txt` và `latest.yml`. Số hiệu hai bên đi
riêng — `v0.3.11` mang Android 0.3.11 và Windows 0.1.6 — nên bộ dò bản mới phải
đọc **tên tệp**, không đọc tên thẻ.

**Windows** dùng `electron-updater` đọc trang phát hành GitHub: tải ngầm, cài
lúc thoát app. Nhờ `.blockmap`, lần cập nhật sau thường chỉ tải vài MB chứ
không tải lại cả bộ cài 104 MB. Bản **portable** thì tắt — nó là một file người
dùng tự để đâu tuỳ ý, ghi đè lên nó là việc không nên tự tiện làm.

**Android** hỏi GitHub một lần mỗi lần mở app, rồi hiện một dải báo ở đầu màn
hình. Bản `sideload` tự tải APK và mở thẳng hộp cài đặt của hệ thống; bản `play`
chỉ mở trang phát hành, vì Play tự lo việc cập nhật và quyền
`REQUEST_INSTALL_PACKAGES` bị soi rất kỹ ở đó.

Ba chỗ dễ sai, đều đã tránh:

- **Đọc tên file APK, không đọc tên thẻ.** Một bản phát hành mang cả file
  Windows lẫn Android, và hai phía không đổi số cùng lúc — đọc tên thẻ là báo có
  bản mới trong khi phía Android chẳng đổi gì.
- **So phiên bản theo từng số, không so chuỗi.** So chuỗi thì `0.1.10` đứng
  trước `0.1.9`, và tới bản thứ mười app lặng lẽ ngừng báo — một lỗi chỉ lộ ra
  sau nhiều tháng.
- **Dải báo nằm ở tầng app, không nằm trong trang phát.** Trang phát thoát sớm
  khi chưa có quyền đọc thông báo hoặc chưa có gì đang phát, mà đó đúng là trạng
  thái của một máy vừa cài xong — người cần biết tin này nhất lại là người không
  thấy nó.

### Hai lớp chặn, không phải một

Người dùng gặp cả hai cùng lúc nên dễ tưởng là một, mà cách xử lại khác nhau.

| | Chặn gì | Cơ chế tự cập nhật có né được? |
|---|---|---|
| **Auto Blocker** (Samsung) | Không cho **cài** APK ngoài cửa hàng | Không |
| **Restricted settings** (Android 13+, mọi máy) | Cài được nhưng không **bật được** quyền đọc thông báo | Có |

Lớp thứ hai chỉ áp lên app cài bằng đường **không phải phiên** — trình duyệt hay
trình quản lý file mở thẳng file APK. Cài bằng phiên `PackageInstaller`, đúng
thứ cơ chế tự cập nhật dùng, thì không bị. Nên nó không vô dụng với máy Samsung
như thoạt nhìn: nó không mở được cửa, nhưng qua được cửa rồi thì không vướng
lớp thứ hai nữa.

Cái kích hoạt lớp thứ hai **không phải một quyền** mà là khai báo dịch vụ
`BIND_NOTIFICATION_LISTENER_SERVICE` — nên soi danh sách quyền sẽ không thấy gì,
và cắt bớt quyền cũng không làm nó im. Bỏ dịch vụ đó thì app không còn lý do tồn
tại. Xem README bản Android để biết chi tiết.

Cách dứt điểm cho cả hai lớp là phát hành qua Play — bản `play` không mang quyền
cài đặt và không cần cơ chế này.

---

## 9. Chạy thử

```bash
npm install
npm run dev        # chạy chế độ phát triển
npm test           # 133 phép kiểm tra
npm run typecheck
npm run dist       # đóng gói bản cài Windows
```

Đường dẫn dữ liệu: `%APPDATA%/AURA/` — cài đặt, danh sách phát, bộ nhớ đệm lời,
nhật ký, và `bin/` chứa yt-dlp cùng model Whisper tải về.
