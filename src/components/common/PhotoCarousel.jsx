import { useState } from 'react'

export default function PhotoCarousel({ photos = [], altBase = 'Foto' }) {
  const cleaned = photos.filter(Boolean)
  const [index, setIndex] = useState(0)

  if (!cleaned.length) return null
  const safeIndex = Math.min(index, cleaned.length - 1)
  const active = cleaned[safeIndex]

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950/70">
        <img src={active} alt={`${altBase} ${safeIndex + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
        {cleaned.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((prev) => (prev - 1 + cleaned.length) % cleaned.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/45 px-2 py-1 text-xs text-white"
              aria-label="Vorige foto"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setIndex((prev) => (prev + 1) % cleaned.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/45 px-2 py-1 text-xs text-white"
              aria-label="Volgende foto"
            >
              ›
            </button>
          </>
        )}
      </div>
      {cleaned.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {cleaned.map((_, dotIndex) => (
            <button
              key={`photo-dot-${dotIndex}`}
              type="button"
              onClick={() => setIndex(dotIndex)}
              className={`h-1.5 w-1.5 rounded-full ${dotIndex === safeIndex ? 'bg-cyan-300' : 'bg-white/30'}`}
              aria-label={`Ga naar foto ${dotIndex + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
