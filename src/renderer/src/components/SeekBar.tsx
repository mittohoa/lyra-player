import { useCallback, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react'

interface Props {
  value: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}

/**
 * Thanh keo dung chung cho tien do va am luong.
 * Trong luc keo, hien thi gia tri nhap (khong doi theo `value` tu ngoai)
 * de con tro khong bi giat khi timeupdate ban ve.
 */
export function SeekBar({ value, max, onChange, disabled, className }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [dragValue, setDragValue] = useState<number | null>(null)

  const valueAt = useCallback(
    (clientX: number): number => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return 0
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return ratio * max
    },
    [max]
  )

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (disabled || max <= 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragValue(valueAt(e.clientX))
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragValue === null) return
    setDragValue(valueAt(e.clientX))
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragValue === null) return
    const final = valueAt(e.clientX)
    setDragValue(null)
    onChange(final)
  }

  const shown = dragValue ?? value
  const percent = max > 0 ? Math.max(0, Math.min(100, (shown / max) * 100)) : 0

  return (
    <div
      ref={ref}
      className={`bar ${disabled || max <= 0 ? 'bar--disabled' : ''} ${className ?? ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDragValue(null)}
      role="slider"
      aria-valuenow={Math.round(shown)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      tabIndex={disabled ? -1 : 0}
    >
      <div className="bar__fill" style={{ width: `${percent}%` }} />
      <div className="bar__knob" style={{ left: `${percent}%` }} />
    </div>
  )
}
