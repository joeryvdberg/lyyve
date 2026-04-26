import { useState } from 'react'

export default function StatsTab({ checkIns, onUpdateCheckIn }) {
  const [editingId, setEditingId] = useState('')
  const [draft, setDraft] = useState({ artist: '', venue: '', note: '', rating: 8.0 })

  function startEdit(item) {
    setEditingId(item.id)
    setDraft({
      artist: item.artist || '',
      venue: item.venue || '',
      note: item.note || '',
      rating: Number(item.rating ?? 8.0),
    })
  }

  async function saveEdit() {
    if (!editingId) return
    const artist = draft.artist.trim()
    const venue = draft.venue.trim()
    if (!artist || !venue) return
    await onUpdateCheckIn(editingId, {
      artist,
      venue,
      note: draft.note.trim(),
      rating: Number(draft.rating),
    })
    setEditingId('')
  }

  const uniqueArtists = new Set(checkIns.map((item) => item.artist.toLowerCase())).size
  const uniqueVenues = new Set(checkIns.map((item) => item.venue.toLowerCase())).size
  const averageScore = checkIns.length
    ? (
        checkIns.reduce((sum, item) => sum + item.rating, 0) / checkIns.length
      ).toFixed(1)
    : '0.0'

  const stats = [
    { label: 'Liveshows', value: String(checkIns.length) },
    { label: 'Artiesten', value: String(uniqueArtists) },
    { label: 'Gem. score', value: averageScore },
  ]

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">
        Jouw stats<span className="text-cyan-300">.</span>
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((item) => (
          <article
            key={item.label}
            className="rounded-2xl border border-fuchsia-400/20 bg-zinc-900/65 p-3 text-center shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl"
          >
            <p className="bg-gradient-to-r from-rose-300 via-fuchsia-300 to-sky-300 bg-clip-text text-xl font-bold text-transparent">
              {item.value}
            </p>
            <p className="text-xs text-zinc-400">{item.label}</p>
          </article>
        ))}
      </div>
      <article className="rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-300">Mijn check-ins</p>
          <p className="text-xs text-zinc-500">{uniqueVenues} unieke venues/festivals</p>
        </div>
        <div className="mt-3 space-y-2">
          {checkIns.length === 0 && (
            <p className="text-sm text-zinc-400">
              Nog geen check-ins opgeslagen. Voeg je eerste check-in toe bij Check-in.
            </p>
          )}
          {checkIns.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-white/10 bg-zinc-950/70 p-3"
            >
              {editingId === item.id ? (
                <div className="space-y-2">
                  <label className="block text-xs text-zinc-400">
                    Artiest
                    <input
                      value={draft.artist}
                      onChange={(event) => setDraft((prev) => ({ ...prev, artist: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-sm text-white outline-none ring-cyan-400 focus:ring-2"
                    />
                  </label>
                  <label className="block text-xs text-zinc-400">
                    Venue / festival
                    <input
                      value={draft.venue}
                      onChange={(event) => setDraft((prev) => ({ ...prev, venue: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-sm text-white outline-none ring-cyan-400 focus:ring-2"
                    />
                  </label>
                  <label className="block text-xs text-zinc-400">
                    Notitie
                    <textarea
                      rows={2}
                      value={draft.note}
                      onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
                      className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-sm text-white outline-none ring-cyan-400 focus:ring-2"
                    />
                  </label>
                  <label className="block text-xs text-zinc-400">
                    Rating ({Number(draft.rating).toFixed(1)})
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.1"
                      value={draft.rating}
                      onChange={(event) => setDraft((prev) => ({ ...prev, rating: Number(event.target.value) }))}
                      className="mt-1 w-full accent-fuchsia-500"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="rounded-lg bg-cyan-500/25 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/35"
                    >
                      Opslaan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId('')}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/30"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.artist}</p>
                      <p className="text-xs text-zinc-400">{item.venue}</p>
                    </div>
                    <p className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300">
                      {item.rating.toFixed(1)}
                    </p>
                  </div>
                  {item.note && <p className="mt-2 text-xs text-zinc-300">{item.note}</p>}
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="mt-2 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:border-white/30"
                  >
                    Bewerken
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
