import type { JSX } from 'react'

/**
 * Dau hieu Lyra. Hinh hoc dong bo voi `resources/icon.svg` - sua ben do
 * thi sua ca ben nay (file kia la ban goc de xuat ra icon cua app).
 *
 * Id cua gradient co dinh: moi ban ve deu giong het nhau nen trung id
 * khong gay van de, ma con tranh sinh id moi moi lan render.
 */
export function Logo({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lyra-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
      </defs>

      <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#lyra-tile)" />

      <g fill="#fff" transform="translate(9 -6)">
        <path d="M207.4 125 h19 v179 h-19 z" />
        <path d="M357.4 97 h19 v179 h-19 z" />
        <path d="M207.4 125 L376.4 97 L376.4 137 L207.4 165 Z" />
        <ellipse cx="172" cy="300" rx="58" ry="33" transform="rotate(-25 172 300)" />
        <ellipse cx="322" cy="272" rx="58" ry="33" transform="rotate(-25 322 272)" />
      </g>

      <rect x="152" y="372" width="208" height="48" rx="24" fill="#fff" />
    </svg>
  )
}
