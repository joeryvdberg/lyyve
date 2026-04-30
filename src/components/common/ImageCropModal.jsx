import { useMemo, useState } from 'react'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export default function ImageCropModal({ source, onCancel, onConfirm }) {
  const [zoom, setZoom] = useState(1.1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)

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
    onConfirm(canvas.toDataURL('image/jpeg', 0.9))
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm">
      <article className="w-full max-w-md space-y-3 rounded-3xl border border-white/15 bg-zinc-900/95 p-4 shadow-2xl">
        <h3 className="text-base font-semibold text-white">Foto bijsnijden (1:1)</h3>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/60">
          <div className="aspect-square w-full overflow-hidden">
            <img
              src={source}
              alt="Crop preview"
              className="h-full w-full object-cover"
              style={{ transform, transformOrigin: 'center center' }}
            />
          </div>
        </div>
        <label className="block text-xs text-zinc-400">
          Zoom
          <input
            type="range"
            min="1"
            max="2.6"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="mt-1 w-full accent-cyan-400"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Horizontaal
          <input
            type="range"
            min="-100"
            max="100"
            step="1"
            value={offsetX}
            onChange={(event) => setOffsetX(Number(event.target.value))}
            className="mt-1 w-full accent-cyan-400"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Verticaal
          <input
            type="range"
            min="-100"
            max="100"
            step="1"
            value={offsetY}
            onChange={(event) => setOffsetY(Number(event.target.value))}
            className="mt-1 w-full accent-cyan-400"
          />
        </label>
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
