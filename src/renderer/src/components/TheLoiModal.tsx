import { useEffect, useRef, useState, type JSX } from 'react'
import { CAO, MAU_THE, RONG, veTheLoi, type MaMau } from '@/lib/theLoi'
import { useTheme } from '@/store/theme'
import { useApp } from '@/store/app'
import { IconClose, IconDownload, IconCopy } from '@/lib/icons'

interface Props {
  cauHat: string
  tenBai: string
  caSi: string
  artwork?: string
  onClose: () => void
}

/**
 * Chọn mẫu và xem trước tấm thẻ, rồi lưu ra ảnh hoặc chép vào bảng nháp.
 *
 * Tấm xem trước KHÔNG phải một bản dựng riêng: nó chính là canvas 1080x1350 sẽ
 * được xuất ra, chỉ thu nhỏ lại bằng CSS. Nên không có chuyện xem một đằng lưu
 * ra một nẻo.
 */
export function TheLoiModal({ cauHat, tenBai, caSi, artwork, onClose }: Props): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [mau, datMau] = useState<MaMau>('giay')
  const [bia, datBia] = useState<HTMLImageElement | null>(null)
  const [bao, datBao] = useState<string | null>(null)
  const accent = useTheme((s) => s.accent)
  const laGiay = useApp((s) => s.settings?.theme !== 'dark')

  // Nạp ảnh bìa một lần. Hai mẫu cần nó; chưa có thì hai mẫu đó bị làm mờ đi
  // chứ không biến mất — người dùng thấy được là app có mẫu đó, chỉ là bài này
  // không có bìa.
  useEffect(() => {
    if (!artwork) {
      datBia(null)
      return
    }
    const anh = new Image()
    anh.onload = () => datBia(anh)
    anh.onerror = () => datBia(null)
    anh.src = artwork
  }, [artwork])

  useEffect(() => {
    const c = canvas.current?.getContext('2d')
    if (!c) return
    veTheLoi(c, { cauHat, tenBai, caSi, mauNhan: accent, laGiay, mau, bia })
  }, [cauHat, tenBai, caSi, accent, laGiay, mau, bia])

  const layPng = (): Promise<Blob | null> =>
    new Promise((res) => canvas.current?.toBlob((b) => res(b), 'image/png') ?? res(null))

  const luu = async (): Promise<void> => {
    const blob = await layPng()
    if (!blob) return
    const byte = new Uint8Array(await blob.arrayBuffer())
    const ten = `${tenBai.replace(/[\\/:*?"<>|]/g, '')} — the loi.png`
    const duong = await window.api.share.saveCard(byte, ten)
    datBao(duong ? 'Đã lưu ảnh.' : null)
  }

  const chep = async (): Promise<void> => {
    const blob = await layPng()
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      datBao('Đã chép vào bảng nháp — dán thẳng vào chỗ cần.')
    } catch {
      datBao('Không chép được vào bảng nháp. Thử nút Lưu ảnh.')
    }
  }

  useEffect(() => {
    const phim = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', phim)
    return () => window.removeEventListener('keydown', phim)
  }, [onClose])

  return (
    <div className="the-loi__nen" onClick={onClose}>
      <div className="the-loi" onClick={(e) => e.stopPropagation()}>
        <div className="the-loi__dau">
          <h3>Thẻ lời</h3>
          <button className="icon-btn" onClick={onClose} title="Đóng">
            <IconClose size={18} />
          </button>
        </div>

        <div className="the-loi__than">
          <canvas
            ref={canvas}
            width={RONG}
            height={CAO}
            className="the-loi__xem"
            aria-label="Xem trước thẻ lời"
          />

          <div className="the-loi__ben">
            <div className="the-loi__mau">
              {MAU_THE.map((m) => {
                const thieuBia = m.canBia && !bia
                return (
                  <button
                    key={m.ma}
                    className={
                      'the-loi__chip' +
                      (mau === m.ma ? ' the-loi__chip--chon' : '') +
                      (thieuBia ? ' the-loi__chip--mo' : '')
                    }
                    onClick={() => !thieuBia && datMau(m.ma)}
                    disabled={thieuBia}
                    title={thieuBia ? 'Bài này không có ảnh bìa' : m.moTa}
                  >
                    {m.nhan}
                  </button>
                )
              })}
            </div>

            <p className="the-loi__mota">
              {MAU_THE.find((m) => m.ma === mau)?.moTa}
            </p>

            <div className="the-loi__nut">
              <button className="btn btn--primary" onClick={luu}>
                <IconDownload size={16} /> Lưu ảnh
              </button>
              <button className="btn" onClick={chep}>
                <IconCopy size={16} /> Chép
              </button>
            </div>

            {bao && <p className="the-loi__bao">{bao}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
