import { useEffect, useRef, useState, type JSX } from 'react'
import { audio } from '@/store/player'
import { IconFullscreen, IconFullscreenExit } from '@/lib/icons'

/**
 * Cho hien hinh cua bai dang phat, khi bai do la phim.
 *
 * KHONG tao the <video> rieng. Ca app chi co MOT the phat (xem `store/player`),
 * va thanh phan nay chi muon no ve day. Tao the thu hai la co hai mach phat
 * chay song song: tieng mot dang, hinh mot neo, va moi nut tua phai chinh ca
 * hai cho khop nhau.
 *
 * Go xuong thi tra the ve trang thai roi. The roi khoi trang van phat tiep nhu
 * mot the <audio> - nen chuyen tu phim sang nhac khong lam dut nhac.
 */
export function VideoStage(): JSX.Element {
  const boc = useRef<HTMLDivElement>(null)
  const [toanManHinh, datToanManHinh] = useState(false)

  useEffect(() => {
    const cho = boc.current
    if (!cho) return
    cho.appendChild(audio)
    return () => {
      // Chi go khi the van con nam trong day. Neu mot khung hinh khac da nhan
      // no roi thi giat ve la lam den man hinh ben kia.
      if (audio.parentElement === cho) cho.removeChild(audio)
    }
  }, [])

  // Trang thai toan man hinh do trinh duyet giu, khong phai ta. Nguoi dung bam
  // Esc thi ta phai biet ma doi nut lai - khong theo doi thi nut noi sai.
  useEffect(() => {
    const doi = (): void => datToanManHinh(document.fullscreenElement === boc.current)
    document.addEventListener('fullscreenchange', doi)
    return () => document.removeEventListener('fullscreenchange', doi)
  }, [])

  const doiToanManHinh = async (): Promise<void> => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await boc.current?.requestFullscreen()
  }

  return (
    <div className="video-stage" ref={boc}>
      <button
        className="video-stage__nut"
        onClick={doiToanManHinh}
        title={toanManHinh ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
      >
        {toanManHinh ? <IconFullscreenExit size={18} /> : <IconFullscreen size={18} />}
      </button>
    </div>
  )
}
