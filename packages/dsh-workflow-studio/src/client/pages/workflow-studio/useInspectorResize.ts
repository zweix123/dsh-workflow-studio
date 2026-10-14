import { useEffect, useRef, useState } from 'react'

function visibleWidth(preference: number, available: number): number {
  if (!available) return preference
  if (available < 300) return available
  return Math.min(Math.max(300, preference), Math.max(300, Math.floor(available * 0.7)))
}

export function useInspectorResize(preference = 320, onWidthChange?: (width: number) => void, mounted = true) {
  const runArea = useRef<HTMLDivElement>(null)
  const dragCleanup = useRef<() => void>(() => {})
  const [areaWidth, setAreaWidth] = useState(0)
  const [dragWidth, setDragWidth] = useState<number>()
  const [localWidth, setLocalWidth] = useState(preference)
  const width = visibleWidth(dragWidth ?? (onWidthChange ? preference : localWidth), areaWidth)

  useEffect(() => {
    const element = runArea.current
    if (!element) return
    const observer = new ResizeObserver(() => setAreaWidth(element.clientWidth))
    observer.observe(element)
    setAreaWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [mounted])
  useEffect(() => () => dragCleanup.current(), [])

  function commitWidth(nextWidth: number) {
    if (onWidthChange) {
      setDragWidth(nextWidth)
      onWidthChange(nextWidth)
    } else {
      setLocalWidth(nextWidth)
      setDragWidth(undefined)
    }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    dragCleanup.current()
    const startX = event.clientX
    const startWidth = width
    const next = (x: number) => visibleWidth(startWidth + startX - x, areaWidth)
    const move = (pointer: PointerEvent) => setDragWidth(next(pointer.clientX))
    const up = (pointer: PointerEvent) => {
      dragCleanup.current()
      const width = next(pointer.clientX)
      if (width === startWidth) setDragWidth(undefined)
      else commitWidth(width)
    }
    const cancel = () => {
      dragCleanup.current()
      setDragWidth(undefined)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    dragCleanup.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      dragCleanup.current = () => {}
    }
  }

  function resizeByKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const nextWidth = visibleWidth(width + (event.key === 'ArrowLeft' ? 10 : -10), areaWidth)
    if (nextWidth === width) return
    commitWidth(nextWidth)
  }

  return {
    runArea, width, clearWidth: () => setDragWidth(undefined),
    resizeHandle: {
      role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical' as const,
      'aria-valuemin': areaWidth ? Math.min(300, areaWidth) : undefined,
      'aria-valuemax': areaWidth ? Math.max(Math.min(300, areaWidth), Math.floor(areaWidth * 0.7)) : undefined,
      'aria-valuenow': width, onPointerDown: startResize, onKeyDown: resizeByKeyboard,
    },
  }
}
