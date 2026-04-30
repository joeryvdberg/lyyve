import { useMemo, useRef, useState } from 'react'
import { compressImageDataUrl } from '../../lib/image'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export default function ImageCropModal({ source, onCancel, onConfirm }) {
  const [zoom, setZoom] = useState(1.1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [dragStart, setDragStart] = useState(null)
  const pinchStartRef = useRef(null)

  const transform = useMemo(
    () => `translate(${offsetX}%, ${offsetY}%) scale(${zoom})`,
    [offsetX, offsetY, zoom]
  )

  async function handleConfirm() {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('image-load-failed'))
      img.src = source
    })

    const canvas = document.createElement('canvas')
    const size = 1200
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const srcWidth = image.naturalWidth || image.width
    const srcHeight = image.naturalHeight || image.height
    const minSide = Math.min(srcWidth, srcHeight)
    const cropSide = minSide / zoom
    const maxOffsetX = (srcWidth - cropSide) / 2
    const maxOffsetY = (srcHeight - cropSide) / 2
    const srcX = clamp((srcWidth - cropSide) / 2 + (offsetX / 100) * maxOffsetX, 0, srcWidth - cropSide)
    const srcY = clamp((srcHeight - cropSide) / 2 + (offsetY / 100) * maxOffsetY, 0, srcHeight - cropSide)

    ctx.drawImage(image, srcX, srcY, cropSide, cropSide, 0, 0, size, size)
    const compressed = await compressImageDataUrl(canvas.toDataURL('image/jpeg', 0.84), { size: 1024, quality: 0.8 })
    onConfirm(compressed)
  }

  function handlePointerDown(event) {
    setDragStart({
      x: event.clientX,
      y: event.clientY,
      baseX: offsetX,
      baseY: offsetY,
    })
  }

  function handlePointerMove(event) {
    if (!dragStart) return
    const dx = event.clientX - dragStart.x
    const dy = event.clientY - dragStart.y
    const scale = 0.18
    setOffsetX(clamp(dragStart.baseX + dx * scale, -100, 100))
    setOffsetY(clamp(dragStart.baseY + dy * scale, -100, 100))
  }

  function handlePointerUp() {
    setDragStart(null)
  }

  function distanceBetweenTouches(touches) {
    if (touches.length < 2) return 0
    const [first, second] = touches
    const dx = second.clientX - first.clientX
    const dy = second.clientY - first.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  function handleTouchStart(event) {
    if (event.touches.length === 2) {
      pinchStartRef.current = {
        distance: distanceBetweenTouches(event.touches),
        zoom,
      }
    }
  }

  function handleTouchMove(event) {
    if (event.touches.length !== 2 || !pinchStartRef.current) return
    const currentDistance = distanceBetweenTouches(event.touches)
    const ratio = currentDistance / Math.max(1, pinchStartRef.current.distance)
    setZoom(clamp(pinchStartRef.current.zoom * ratio, 1, 2.6))
  }

  function handleTouchEnd() {
    pinchStartRef.current = null
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm">
      <article className="w-full max-w-md space-y-3 rounded-3xl border border-white/15 bg-zinc-900/95 p-4 shadow-2xl">
        <h3 className="text-base font-semibold text-white">Foto bijsnijden (1:1)</h3>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/60">
          <div
            className="aspect-square w-full overflow-hidden touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={source}
              alt="Crop preview"
              className="h-full w-full object-cover"
              style={{ transform, transformOrigin: 'center center' }}
            />
          </div>
        </div>
        <p className="text-[11px] text-zinc-500">Sleep de foto met je vinger om het kader te kiezen.</p>
        <p className="text-[11px] text-zinc-500">Zoom met twee vingers (pinch), verplaats door te slepen.</p>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-xl bg-cyan-500/25 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/35"
          >
            Gebruik uitsnede
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/30"
          >
            Annuleren
          </button>
        </div>
      </article>
    </div>
  )
}
