import type { JSX, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Icon dung chung: stroke theo currentColor, kich thuoc mac dinh 18px. */
function Icon({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconPlay = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M7 4.5 19 12 7 19.5z" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconPause = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="6.5" y="4.5" width="3.6" height="15" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.9" y="4.5" width="3.6" height="15" rx="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconPrev = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M18 5.5 8.5 12 18 18.5z" fill="currentColor" stroke="none" />
    <rect x="5" y="5" width="2.2" height="14" rx="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconNext = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M6 5.5 15.5 12 6 18.5z" fill="currentColor" stroke="none" />
    <rect x="16.8" y="5" width="2.2" height="14" rx="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconShuffle = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M16 3h5v5M21 3l-7.5 7.5M8 21H3M3 21l7-7M16 21h5v-5M21 21l-5.5-5.5M3 3h5l3 3" />
  </Icon>
)

export const IconRepeat = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </Icon>
)

export const IconRepeatOne = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    <path d="M11.5 10.5 13 9.6V15" strokeWidth={2} />
  </Icon>
)

export const IconVolume = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="currentColor" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" />
  </Icon>
)

export const IconVolumeMute = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="currentColor" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </Icon>
)

export const IconMusic = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Icon>
)

export const IconSearch = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Icon>
)

export const IconQueue = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M3 6h13M3 12h13M3 18h9" />
    <path d="M18 13v6M21 16h-6" />
  </Icon>
)

export const IconSettings = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
)

export const IconLyrics = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M7 9h7M7 13h10M7 17h5" />
  </Icon>
)

export const IconOverlay = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="2.5" y="4" width="19" height="14" rx="2" strokeDasharray="3 2.5" />
    <rect x="5.5" y="12" width="13" height="4.5" rx="1.5" fill="currentColor" opacity="0.35" />
  </Icon>
)

export const IconPlus = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconTrash = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6M6 6l1 14a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 20L18 6" />
  </Icon>
)

export const IconRefresh = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
    <path d="M20.5 4v5h-5" />
  </Icon>
)

export const IconFolder = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h8A1.5 1.5 0 0 1 20 10v8a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3 18z" />
  </Icon>
)

export const IconLink = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Icon>
)

export const IconMinimize = (p: IconProps): JSX.Element => (
  <Icon {...p} size={p.size ?? 14}>
    <path d="M4 12h16" />
  </Icon>
)

export const IconMaximize = (p: IconProps): JSX.Element => (
  <Icon {...p} size={p.size ?? 14}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />
  </Icon>
)

export const IconClose = (p: IconProps): JSX.Element => (
  <Icon {...p} size={p.size ?? 14}>
    <path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5" />
  </Icon>
)

export const IconPin = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 17v5" />
    <path d="M9 3h6l-1 6 3.5 3.5V15H6.5v-2.5L10 9z" />
  </Icon>
)

export const IconMouseOff = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="7" y="3" width="10" height="18" rx="5" />
    <path d="M12 7v3" />
    <path d="m3.5 3.5 17 17" />
  </Icon>
)

export const IconDownload = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 3v12" />
    <path d="m7 10.5 5 5 5-5" />
    <path d="M4 20h16" />
  </Icon>
)

export const IconSparkle = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.6 10.4 12.2 5 10.6 10.4 9z" />
    <path d="M18.5 16.5 19.2 18.8 21.5 19.5 19.2 20.2 18.5 22.5 17.8 20.2 15.5 19.5 17.8 18.8z" />
  </Icon>
)

export const IconTranslate = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M3.5 5.5h9M8 3.5v2M10.5 5.5c0 4-3 7.5-7 8.5M5.5 9c1 2.2 3 3.9 5.5 4.6" />
    <path d="m13 20.5 4-9 4 9M14.4 17.6h5.2" />
  </Icon>
)

export const IconEdit = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="M14.5 5.5 18.5 9.5" />
  </Icon>
)

export const IconInfo = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <path d="M12 7.6v.1" />
  </Icon>
)

export const IconAlert = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 3.8 21.2 19.5H2.8z" />
    <path d="M12 9.5v4.5" />
    <path d="M12 17.2v.1" />
  </Icon>
)

export const IconLog = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M6 3.5h8.5L19 8v12.5H6z" />
    <path d="M14 3.5V8h5" />
    <path d="M9 12.5h7M9 16h4.5" />
  </Icon>
)

export const IconCheck = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
)

export const IconSliders = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 7.5h9M17.5 7.5H20" />
    <path d="M4 16.5h3.5M12 16.5h8" />
    <circle cx="15" cy="7.5" r="2.5" />
    <circle cx="9.5" cy="16.5" r="2.5" />
  </Icon>
)

export const IconFullscreen = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </Icon>
)

export const IconFullscreenExit = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" />
  </Icon>
)

export const IconVideo = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="2" />
    <path d="M15.5 10.5 21.5 7.5v9l-6-3z" />
  </Icon>
)

export const IconCopy = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 6.5V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15h1" />
  </Icon>
)

export const IconShare = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M8 9h8M8 13h6" />
  </Icon>
)
