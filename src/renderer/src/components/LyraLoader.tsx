import type { JSX } from 'react'

/**
 * Dau hieu AURA o trang thai dang lam viec.
 *
 * Thay cho vong xoay chung chung: cung mot hinh voi \`Logo\`, chi khac la no
 * cu dong. Nguoi dung thay ngay day la AURA dang ban chu khong phai mot thanh
 * phan web bat ky.
 *
 * Hinh dong theo dung nghia cua chinh no, khong phai hieu ung dan vao:
 *   - Cap not lac nhe quanh dau xa, nhu dang bat nhip
 *   - Thanh loi ben duoi chay tu trai sang phai, nhu mot dong lyric dang hien ra
 *
 * Hai chuyen dong cung chu ky nen chung nhip voi nhau. Hinh hoc dong bo voi
 * \`Logo\` va \`resources/icon.svg\` - sua mot cho thi sua ca ba.
 */

export interface LyraLoaderProps {
  size?: number
  /**
   * `inline` (mac dinh) cho trong nut va canh chu: bo bot chi tiet nho de o
   * co 14-16px van nhin ro.
   * `block` cho man hinh cho: co them vong sang chay quanh.
   */
  variant?: 'inline' | 'block'
  /** Doc cho trinh doc man hinh; de rong neu canh do da co chu "Dang..." roi. */
  label?: string
}

export function LyraLoader({
  size = 16,
  variant = 'inline',
  label
}: LyraLoaderProps): JSX.Element {
  return (
    <svg
      className={`lyra-loader lyra-loader--${variant}`}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id="lyra-loader-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
        {/* Cat thanh loi de no chay ra tu trai chu khong phong to tu giua */}
        <clipPath id="lyra-loader-bar">
          <rect x="152" y="372" width="208" height="48" rx="24" />
        </clipPath>
      </defs>

      <rect
        className="lyra-loader__tile"
        x="16"
        y="16"
        width="480"
        height="480"
        rx="116"
        fill="url(#lyra-loader-tile)"
      />

      {variant === 'block' && (
        <circle
          className="lyra-loader__ring"
          cx="256"
          cy="256"
          r="212"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.5"
          strokeWidth="10"
          strokeLinecap="round"
          // Net dut dai roi hut: chay vong thi thanh mot vet sang duoi theo
          strokeDasharray="150 1180"
        />
      )}

      {/* Lac quanh diem giua hai not, ngay duoi dau xa */}
      <g className="lyra-loader__note" fill="#fff" transform="translate(9 -6)">
        <path d="M207.4 125 h19 v179 h-19 z" />
        <path d="M357.4 97 h19 v179 h-19 z" />
        <path d="M207.4 125 L376.4 97 L376.4 137 L207.4 165 Z" />
        <ellipse cx="172" cy="300" rx="58" ry="33" transform="rotate(-25 172 300)" />
        <ellipse cx="322" cy="272" rx="58" ry="33" transform="rotate(-25 322 272)" />
      </g>

      <g clipPath="url(#lyra-loader-bar)">
        {/* Nen mo cua thanh loi: van thay day thanh o dau, chi la chua "hien chu" */}
        <rect x="152" y="372" width="208" height="48" rx="24" fill="#fff" opacity="0.28" />
        <rect
          className="lyra-loader__bar"
          x="152"
          y="372"
          width="208"
          height="48"
          rx="24"
          fill="#fff"
        />
      </g>
    </svg>
  )
}
