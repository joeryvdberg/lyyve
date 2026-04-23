const friendFeedItems = [
  {
    user: 'Noa',
    artist: 'Fred again..',
    event: 'Lowlands 2026',
    rating: 5,
    note: 'Bizar goeie energie. Hele tent ging los.',
    photoDataUrl:
      'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1600&q=70',
  },
  {
    user: 'Jesse',
    artist: 'The Blaze',
    event: 'Pukkelpop 2026',
    rating: 4,
    note: 'Visueel heel sterk, sound iets te zacht.',
    photoDataUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=70',
  },
]

export default function FeedTab({ checkIns, profile }) {
  const myFeedItems = checkIns.map((item) => ({
    id: item.id,
    user: profile.displayName || profile.username || 'Jij',
    artist: item.artist,
    event: item.venue,
    rating: item.rating,
    note: item.note,
    photoDataUrl: item.photoDataUrl || '',
    createdAt: item.createdAt || '',
  }))

  const feedItems = [...myFeedItems, ...friendFeedItems]

  function getDisplayImage(item) {
    if (item.photoDataUrl) return item.photoDataUrl
    return `https://picsum.photos/seed/${encodeURIComponent(item.artist)}-${encodeURIComponent(item.event)}/1600/900`
  }

  function formatTime(value) {
    if (!value) return 'Net toegevoegd'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Net toegevoegd'
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">
        Vriendenfeed<span className="text-sky-400">.</span>
      </h2>
      <p className="text-sm text-zinc-400">
        Hier zie je check-ins van vrienden: welke artiest ze zagen, hun score en opmerking.
      </p>
      <div className="space-y-3">
        {feedItems.map((item, index) => (
          <article
            key={item.id ?? `${item.user}-${item.artist}-${index}`}
            className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/70 shadow-xl shadow-fuchsia-500/10 backdrop-blur-xl"
          >
            <div className="p-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{formatTime(item.createdAt)}</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    <span className="font-semibold text-white">{item.user}</span> zag{' '}
                    <span className="font-semibold text-white">{item.artist}</span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{item.event}</p>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/35 bg-zinc-950/80 px-3 py-2">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5 text-rose-300"
                    aria-hidden="true"
                  >
                    <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
                  </svg>
                  <p className="text-sm font-bold leading-none text-rose-300">{item.rating.toFixed(1)}</p>
                </div>
              </div>
            </div>
            <div className="overflow-hidden border-y border-white/10 bg-zinc-950/30">
              <img
                src={getDisplayImage(item)}
                alt={`${item.artist} check-in`}
                className="h-48 w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="p-4 pt-3">
              <p className="text-sm leading-relaxed text-zinc-200">{item.note}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
