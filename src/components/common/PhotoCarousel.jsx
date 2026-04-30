import { useState } from 'react'

export default function PhotoCarousel({ photos = [], altBase = 'Foto', rounded = true }) {
  const cleaned = photos.filter(Boolean)
  const [index, setIndex] = useState(0)
  const [touchStartX, setTouchStartX] = useState(null)

  if (!cleaned.length) return null
  const safeIndex = Math.min(index, cleaned.length - 1)
  const active = cleaned[safeIndex]

  function handleSwipeStart(event) {
    setTouchStartX(event.touches?.[0]?.clientX ?? null)
  }

  function handleSwipeEnd(event) {
    if (touchStartX === null) return
    const endX = event.changedTouches?.[0]?.clientX ?? touchStartX
    const delta = endX - touchStartX
    const threshold = 36
    if (delta > threshold) {
      setIndex((prev) => (prev - 1 + cleaned.length) % cleaned.length)
    } else if (delta < -threshold) {
      setIndex((prev) => (prev + 1) % cleaned.length)
    }
    setTouchStartX(null)
  }

  return (
    <div>
      <div className={`relative overflow-hidden border border-white/10 bg-zinc-950/70 ${rounded ? 'rounded-xl' : ''}`}>
        <img
          src={active}
          alt={`${altBase} ${safeIndex + 1}`}
          className="aspect-square w-full object-cover"
          loading="lazy"
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        />
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
            <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/35 px-2 py-1">
              {cleaned.map((_, dotIndex) => (
                <button
                  key={`photo-dot-${dotIndex}`}
                  type="button"
                  onClick={() => setIndex(dotIndex)}
                  className={`pointer-events-auto h-1.5 w-1.5 rounded-full ${
                    dotIndex === safeIndex ? 'bg-cyan-300' : 'bg-white/45'
                  }`}
                  aria-label={`Ga naar foto ${dotIndex + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
