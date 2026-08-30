# Lyra cho Android — kiến trúc

> Phạm vi: **chỉ sản phẩm A** — công cụ lời cho cả máy. Không phát nhạc, không
> thư viện, không tải nhạc. Xem `docs/tai-lieu-app.md` phần 3 để biết vì sao.
>
> Stack: Kotlin thuần · minSdk 26 (Android 8) · coroutines + StateFlow ·
> Compose cho màn hình cài đặt, View thuần cho khung nổi.

---

## 1. Vì sao Android hợp hơn Windows

Ba điều, và điều thứ ba mới là điều đáng nói:

1. **Nguồn dữ liệu tốt hơn.** `MediaSessionManager` trả về nghệ sĩ, tên bài,
   album, ảnh bìa, vị trí, trạng thái và cả tên app nguồn — ở các trường
   **riêng biệt**. Trên Windows ta chỉ có một chuỗi thô, phải đoán.
2. **Đẩy thay vì hỏi.** Đăng ký `MediaController.Callback` là hệ thống tự gọi
   lại khi có gì đổi. Bản Windows phải nuôi một tiến trình PowerShell hỏi liên
   tục 2 lần/giây.
3. **Cái giới hạn khó chịu nhất biến mất.** Trên Windows, Lyra không vào được ô
   media của hệ điều hành — nhưng vì Lyra ở đó cũng tự phát nhạc nên nó thành
   một thiếu sót thấy rõ. Trên Android ta **không phát gì cả**, nên chuyện đó
   không còn là vấn đề nữa.

---

## 2. Bản đồ luồng dữ liệu

```
Spotify / YouTube Music / Zing / NCT đang phát
   │
   ▼
NotificationListenerService  ← hệ thống tự dựng và giữ sống
   │  (đây là cái neo của cả app, xem §4)
   ▼
MediaSessionWatcher
   │  msm.getActiveSessions(component)
   │  + MediaController.Callback cho từng phiên
   │  → NowPlaying(app, title, artist, album, art, position, isPlaying)
   ▼
NowPlayingRepository ── StateFlow<NowPlaying?>
   │
   ▼
LyricsRepository
   │  1. Identify.candidatesFrom(now)      ← chuyển thẳng từ bản Windows
   │  2. LRCLIB → Zing → NCT               ← chuyển ý tưởng, viết lại
   │  3. Chỉ nhận khi tên đủ giống
   │  → StateFlow<Lyrics>
   ▼
OverlayHost ── WindowManager.addView(overlayView, params)
   │
   ▼
OverlayView (View thuần, tự vẽ)
```

Vị trí phát là chỗ dễ sai nhất, **y hệt bản Windows**: `PlaybackState` chỉ đưa
một ảnh chụp kèm mốc thời gian, không phải vị trí lúc này.

```kotlin
/**
 * Vị trí phát ở thời điểm hiện tại.
 *
 * `position` là ảnh chụp tại `lastPositionUpdateTime`, không phải bây giờ.
 * Không bù phần đã trôi thì lời luôn chạy chậm hơn nhạc vài giây — đúng cái
 * bẫy đã gặp ở bản Windows.
 *
 * `lastPositionUpdateTime` dùng đồng hồ `elapsedRealtime`, không phải
 * `currentTimeMillis` — so nhầm hai thang này ra sai lệch hàng chục năm.
 */
fun PlaybackState.currentPosition(): Long {
    if (state != PlaybackState.STATE_PLAYING) return position
    val drift = SystemClock.elapsedRealtime() - lastPositionUpdateTime
    return position + (drift * playbackSpeed).toLong()
}
```

---

## 3. Cấu trúc gói

```
app/src/main/java/com/mittohoa/lyra/
│
├── service/
│   ├── LyraNotificationListener.kt   Neo của cả app — §4
│   ├── OverlayHost.kt                Dựng, gỡ, cập nhật khung nổi
│   └── LyraTileService.kt            Ô Quick Settings bật/tắt nhanh
│
├── media/
│   ├── MediaSessionWatcher.kt        Bám các phiên media đang chạy
│   ├── NowPlaying.kt                 Kiểu dữ liệu + bù vị trí
│   └── AppLabels.kt                  packageName → tên app đọc được
│
├── lyrics/
│   ├── Identify.kt        ← CHUYỂN THẲNG từ identify.ts (265 dòng)
│   ├── LrcParser.kt       ← CHUYỂN THẲNG từ lrc.ts (122 dòng)
│   ├── LyricsRepository.kt           Điều phối nguồn, chấm điểm khớp
│   └── LyricLine.kt
│
├── sources/
│   ├── LrclibClient.kt
│   ├── ZingClient.kt                 HMAC-SHA512, xem §6
│   ├── NctClient.kt                  RC4, xem §6
│   └── Http.kt                       OkHttp + kotlinx.serialization
│
├── overlay/
│   ├── OverlayView.kt                Tự vẽ, có viền chữ — §5
│   ├── OverlayParams.kt              LayoutParams theo cài đặt
│   ├── DragHandler.kt                Kéo thả, khoá vị trí
│   └── TuneSheet.kt                  Bảng tinh chỉnh font/cỡ/nền
│
├── data/
│   ├── SettingsStore.kt              DataStore Preferences
│   └── LyricCache.kt                 Room, hoặc file .lrc trong thư mục app
│
└── ui/
    ├── MainActivity.kt               Compose
    ├── OnboardingScreen.kt           Dẫn qua hai quyền — §7
    ├── SettingsScreen.kt
    └── LyricEditorScreen.kt          Sửa lời tay, chỉnh lệch
```

---

## 4. Neo của cả app: `NotificationListenerService`

Đây là quyết định kiến trúc quan trọng nhất, và nó ngược với trực giác.

Phản xạ thường là dựng một foreground service để chạy nền. **Không cần.**
`NotificationListenerService` tự nó đã là một service do hệ thống dựng và giữ
sống khi người dùng đã cấp quyền đọc thông báo. Nó sống dai hơn foreground
service của chính ta, và **không phải hiện thông báo thường trực** — không phải
cắm một dòng "Lyra đang chạy" vào thanh thông báo của người dùng suốt ngày.

```kotlin
/**
 * Neo của cả app.
 *
 * Ta không quan tâm tới thông báo — chỉ cần lớp này tồn tại thì hệ thống mới
 * cho gọi `getActiveSessions`. Đổi lại được luôn một chỗ trú chạy nền mà không
 * phải hiện thông báo thường trực.
 *
 * Hệ thống có thể giết và dựng lại lớp này bất cứ lúc nào, nên mọi trạng thái
 * phải nằm ở singleton bên ngoài, không nằm trong chính nó.
 */
class LyraNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        watcher.start(this)
        overlayHost.attach(this)
    }

    override fun onListenerDisconnected() {
        watcher.stop()
        overlayHost.detach()
    }

    // Không cần onNotificationPosted — ta đọc phiên media, không đọc thông báo
}
```

Manifest:

```xml
<service
    android:name=".service.LyraNotificationListener"
    android:exported="false"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
```

**Chỉ dựng thêm foreground service khi** cần chắc chắn sống trên máy Xiaomi /
Oppo / Vivo — hãng nào cũng có bộ diệt nền riêng, hung hơn Android gốc nhiều.
Để đó làm bước sau, đo trên máy thật rồi hẵng quyết.

---

## 5. Khung lời nổi

### 5.1 Cửa sổ

```kotlin
val params = WindowManager.LayoutParams(
    WindowManager.LayoutParams.MATCH_PARENT,
    WindowManager.LayoutParams.WRAP_CONTENT,
    // API 26+; TYPE_PHONE cũ đã bị chặn
    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
    // NOT_FOCUSABLE: không cướp bàn phím của app đang dùng
    // NOT_TOUCH_MODAL: chạm ra ngoài khung thì rơi xuống app bên dưới
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
    PixelFormat.TRANSLUCENT
).apply {
    gravity = Gravity.TOP or Gravity.START
    x = settings.x
    y = settings.y
}
```

"Chạm xuyên qua" = thêm `FLAG_NOT_TOUCHABLE`; bỏ cờ đó đi thì kéo thả được lại.
Đúng vai trò `setIgnoreMouseEvents` bên Windows.

### 5.2 Vẽ chữ

Dùng **View thuần, tự vẽ** chứ không dùng Compose. Lý do cụ thể: `ComposeView`
đặt trong cửa sổ của `WindowManager` không có sẵn `ViewTreeLifecycleOwner` và
`SavedStateRegistryOwner`, phải tự gắn tay — thêm một tầng dễ hỏng mà đổi lại
chẳng được gì, vì khung nổi chỉ vẽ vài dòng chữ.

Viền chữ làm đúng như bản Windows (`paint-order: stroke fill`): vẽ hai lượt,
**viền trước, thân chữ sau**. Vẽ ngược lại thì viền ăn lẹm vào nét chữ.

```kotlin
override fun onDraw(canvas: Canvas) {
    lines.forEachIndexed { i, line ->
        val y = baselineOf(i)

        if (strokeWidth > 0f) {
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = strokeWidth * 2f  // nửa nét bị thân chữ đè lên
            paint.color = strokeColor
            canvas.drawText(line.text, x, y, paint)
        }

        paint.style = Paint.Style.FILL
        paint.color = if (line.isActive) activeColor else dimColor
        canvas.drawText(line.text, x, y, paint)
    }
}
```

### 5.3 Bảng tinh chỉnh

Font, cỡ chữ, độ trong suốt nền, màu chữ — mặc định đóng, chạm nút mới mở, y
như bản Windows. Nhưng ở đây là một `BottomSheetDialog` của một Activity trong
suốt, không nhét vào chính khung nổi: khung nổi phải mỏng và không được cướp
focus, mà bảng tinh chỉnh thì cần cả hai thứ ngược lại.

---

## 6. Phần chuyển từ bản Windows

| Chuyển sang | Từ | Dòng | Việc phải làm |
|---|---|---:|---|
| `Identify.kt` | `identify.ts` | 265 | Dịch thẳng. Regex tương đương, `Normalizer.normalize(NFD)` thay cho `normalize('NFD')` |
| `LrcParser.kt` | `lrc.ts` | 122 | Dịch thẳng |
| Bù vị trí | `smtc.ts` | ~20 | Đổi sang `elapsedRealtime` |
| `LrclibClient.kt` | `lrclib.ts` | 110 | OkHttp thay `fetch` |
| `ZingClient.kt` | `zing.ts` | 188 | HMAC: `Mac.getInstance("HmacSHA512")`. **Nhớ: chỉ ký một số tham số nhất định**, ký hết là hỏng |
| `NctClient.kt` | `nct.ts` | 192 | RC4 tự viết ~20 dòng — đừng dựa vào `Cipher.getInstance("ARCFOUR")`, có máy không có |
| `LyricsRepository.kt` | `external.ts` | 202 | Bỏ hết nhánh phụ đề |
| Bảng diễn giải lỗi | `errors.ts` | 77 | Dịch thẳng, đổi mẫu khớp sang lỗi của Android |

**Bỏ hẳn:** whisper (không lấy được âm thanh của app khác), yt-dlp và mọi thứ
dựa vào nó (phụ đề, phát và tải YouTube), giao thức `media://`, thanh taskbar.

`Identify.kt` là phần đáng giá nhất chuyển sang. Trên Android metadata sạch hơn
nhiều, nhưng **app YouTube vẫn đưa nguyên tên video** — đúng loại rác mà nó
sinh ra để bóc.

---

## 7. Quyền và luồng dẫn nhập

Hai quyền, cả hai đều phải người dùng tự bật tay trong Cài đặt Android. Không
có `requestPermissions()` cho loại này — chỉ mở được đúng trang cài đặt rồi chờ.

```kotlin
// 1. Đọc thông báo — không có thì không đọc được nhạc app khác
val enabled = NotificationManagerCompat
    .getEnabledListenerPackages(context)
    .contains(context.packageName)
startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))

// 2. Vẽ đè lên app khác — không có thì không hiện được lời
Settings.canDrawOverlays(context)
startActivity(
    Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}")
    )
)
```

Màn hình dẫn nhập nên nói **vì sao** cần từng quyền bằng đúng một câu, rồi tự
kiểm lại khi quay về app. Xin hai quyền nhạy cảm mà không giải thích thì người
ta thoát ngay — đây là hai quyền đáng ngờ nhất trên Android.

> Google Play soi rất kỹ cả hai quyền này, phải khai báo và biện minh. Cài
> riêng cho mình thì không vướng gì.

---

## 8. Ô Quick Settings

Vuốt xuống, chạm một cái để bật/tắt lời nổi. Gọn hơn hẳn phím tắt của bản
Windows, và không thể bị app khác chiếm mất — đúng cái vừa xảy ra với
`Ctrl+Alt+←/→`.

```kotlin
class LyraTileService : TileService() {
    override fun onClick() {
        val on = overlayHost.toggle()
        qsTile.state = if (on) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        qsTile.updateTile()
    }
}
```

---

## 9. Kiểm chứng

Bản Windows mạnh là nhờ 171 phép kiểm tra chạy trên app thật. Giữ đúng tinh
thần đó:

| Tầng | Cách | Kiểm gì |
|---|---|---|
| Logic thuần | Unit test JVM, không cần máy ảo | `Identify`, `LrcParser`, bù vị trí, chấm điểm khớp tên — chạy trong mili-giây |
| Nguồn mạng | Unit test + MockWebServer | Chữ ký Zing, giải mã RC4 của NCT, đọc phản hồi |
| Bám phiên media | Instrumented + `MediaSession` giả | Dựng một phiên giả rồi đổi trạng thái, xem repository có theo kịp |
| Khung nổi | Instrumented, chụp màn hình | Vẽ đúng dòng đang hát, viền chữ, chạm xuyên qua |

Phần logic thuần chuyển sang cũng nên chuyển **luôn cả bộ kiểm tra** của nó —
14 phép cho `Identify` và 11 phép cho `LrcParser` đã có sẵn, chỉ dịch cú pháp.

---

## 10. Làm theo thứ tự nào

Mỗi mốc tự nó kiểm chứng được, và mốc đầu tiên là mốc rủi ro nhất — làm trước
để biết sớm nếu có gì chặn.

1. **Đọc được nhạc app khác.** Chỉ một Activity hiện chữ thô. Đi qua trọn vẹn
   đường quyền khó nhất. *Nếu bước này không xong thì cả dự án không có nghĩa.*
2. **Khung nổi hiện chữ tĩnh.** Quyền vẽ đè, kéo thả, chạm xuyên qua.
3. **Nối LRCLIB.** Lần đầu thấy lời chạy theo nhạc thật.
4. **`Identify` + Zing + NCT.** Chỗ này quyết định tỉ lệ tìm ra lời.
5. **Bảng tinh chỉnh + ô Quick Settings.** Phần dùng hằng ngày.
6. **Sửa lời tay, chỉnh lệch, nhớ lại.** Đường cứu khi máy dò sai.
7. **Dịch lời.** Nếu vẫn muốn.

---

## 11. Chỗ có thể vỡ

- **Bộ diệt nền của hãng.** Xiaomi, Oppo, Vivo, Samsung — mỗi hãng một kiểu, và
  hung hơn Android gốc nhiều. Người dùng phải tự cho Lyra vào danh sách miễn
  trừ. Không có cách nào lách, chỉ có cách hướng dẫn.
- **App không khai báo metadata tử tế.** Có app chỉ đưa tên bài, không đưa nghệ
  sĩ. `Identify` đỡ được phần nào nhưng không phải tất cả.
- **Vài chỗ chặn overlay.** Nội dung có DRM, một số game toàn màn hình.
- **Zing/NCT có thể kiểm khác trên di động.** User-Agent, khu vực, hoặc bắt
  buộc dùng app của họ. Phải thử thật rồi mới biết.
- **Đây là nền tảng thứ hai phải chăm.** Zing hay NCT đổi API là hỏng **cả
  hai** bản. Nếu làm, nên tách hẳn thành repo riêng và chốt luôn hướng thu về
  lõi cho bản Windows, để hai bên cùng một hình dạng.

---

## 12. Quy mô thật

| | |
|---|---|
| Kotlin viết mới | ~1.500–2.000 dòng |
| Chuyển từ TypeScript | ~1.000 dòng logic thuần |
| Bỏ hẳn không mang sang | ~1.200 dòng dính Windows |
| Rủi ro lớn nhất | Bộ diệt nền của hãng, và Zing/NCT trên di động |

Đây không phải "port". Đây là **app thứ hai dùng chung bộ não** — và bộ não đó
là phần đã được kiểm chứng kỹ nhất của bản Windows.
