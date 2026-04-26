import { useMemo, useState } from 'react'
import { useEffect } from 'react'
import { getFeedInteractions, saveFeedInteraction } from '../../lib/db'

const friendFeedItems = [
  {
    id: 'friend-feed-noa-1',
    user: 'Noa',
    artist: 'Fred again..',
    event: 'Lowlands 2026',
    rating: 5,
    note: 'Bizar goeie energie. Hele tent ging los.',
    createdAt: '2026-08-20T19:10:00Z',
    photoDataUrl:
      'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1600&q=70',
  },
  {
    id: 'friend-feed-jesse-1',
    user: 'Jesse',
    artist: 'The Blaze',
    event: 'Pukkelpop 2026',
    rating: 4,
    note: 'Visueel heel sterk, sound iets te zacht.',
    createdAt: '2026-08-16T20:45:00Z',
    photoDataUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=70',
  },
]

export default function FeedTab({ checkIns, profile, onUpdateCheckIn }) {
  const [interactions, setInteractions] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [openComments, setOpenComments] = useState({})
  const [commentErrors, setCommentErrors] = useState({})
  const [editingId, setEditingId] = useState('')
  const [editDraft, setEditDraft] = useState({ artist: '', venue: '', note: '', rating: 8 })

  const myFeedItems = checkIns.map((item) => ({
    id: item.id,
    user: profile.displayName || profile.username || 'Jij',
    artist: item.artist,
    event: item.venue,
    rating: item.rating,
    note: item.note,
    photoDataUrl: item.photoDataUrl || '',
    createdAt: item.createdAt || '',
    isFriendPost: false,
  }))

  const feedItems = [...myFeedItems, ...friendFeedItems.map((item) => ({ ...item, isFriendPost: true }))]

  const defaultInteractions = useMemo(() => ({}), [])

  useEffect(() => {
    let mounted = true
    async function loadInteractions() {
      const stored = await getFeedInteractions()
      if (mounted) setInteractions(stored)
    }
    loadInteractions()
    return () => {
      mounted = false
    }
  }, [])

  function getInteraction(itemId) {
    return interactions[itemId] ?? defaultInteractions[itemId] ?? { likedByMe: false, likeCount: 0, comments: [] }
  }

  function formatTime(value) {
    if (!value) return 'Net toegevoegd'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Net toegevoegd'
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  }

  function toggleLike(itemId) {
    setInteractions((prev) => {
      const current = prev[itemId] ?? defaultInteractions[itemId] ?? { likedByMe: false, likeCount: 0, comments: [] }
      const nextLiked = !current.likedByMe
      const next = {
        ...prev,
        [itemId]: {
          ...current,
          likedByMe: nextLiked,
          likeCount: Math.max(0, current.likeCount + (nextLiked ? 1 : -1)),
        },
      }
      saveFeedInteraction(itemId, next[itemId])
      return next
    })
  }

  function addComment(itemId) {
    const rawComment = commentDrafts[itemId] ?? ''
    const comment = rawComment.trim()
    if (!comment) {
      setCommentErrors((prev) => ({ ...prev, [itemId]: 'Reactie mag niet leeg zijn.' }))
      return
    }
    if (comment.length > 220) {
      setCommentErrors((prev) => ({ ...prev, [itemId]: 'Maximaal 220 tekens per reactie.' }))
      return
    }

    setInteractions((prev) => {
      const current = prev[itemId] ?? defaultInteractions[itemId] ?? { likedByMe: false, likeCount: 0, comments: [] }
      const next = {
        ...prev,
        [itemId]: {
          ...current,
          comments: [
            ...current.comments,
            {
              id: crypto.randomUUID(),
              user: profile.displayName || 'Jij',
              text: comment,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }
      saveFeedInteraction(itemId, next[itemId])
      return next
    })

    setCommentDrafts((prev) => ({ ...prev, [itemId]: '' }))
    setCommentErrors((prev) => ({ ...prev, [itemId]: '' }))
  }

  function toggleCommentPanel(itemId) {
    setOpenComments((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEditDraft({
      artist: item.artist ?? '',
      venue: item.event ?? '',
      note: item.note ?? '',
      rating: Number(item.rating ?? 8),
    })
  }

  async function saveEdit(itemId) {
    if (!onUpdateCheckIn) return
    const artist = editDraft.artist.trim()
    const venue = editDraft.venue.trim()
    if (!artist || !venue) return
    await onUpdateCheckIn(itemId, {
      artist,
      venue,
      note: editDraft.note.trim(),
      rating: Number(editDraft.rating),
    })
    setEditingId('')
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">
        Vriendenfeed<span className="text-cyan-300">.</span>
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
            {item.photoDataUrl && (
              <div className="overflow-hidden border-y border-white/10 bg-zinc-950/30">
                <img
                  src={item.photoDataUrl}
                  alt={`${item.artist} check-in`}
                  className="h-48 w-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="p-4 pt-3">
              {editingId === item.id && !item.isFriendPost ? (
                <div className="space-y-2 rounded-2xl border border-white/10 bg-zinc-950/35 p-3">
                  <label className="block text-xs text-zinc-400">
                    Artiest
                    <input
                      value={editDraft.artist}
                      onChange={(event) => setEditDraft((prev) => ({ ...prev, artist: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-sm text-white outline-none ring-cyan-400 focus:ring-2"
                    />
                  </label>
                  <label className="block text-xs text-zinc-400">
                    Venue / festival
                    <input
                      value={editDraft.venue}
                      onChange={(event) => setEditDraft((prev) => ({ ...prev, venue: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-sm text-white outline-none ring-cyan-400 focus:ring-2"
                    />
                  </label>
                  <label className="block text-xs text-zinc-400">
                    Notitie
                    <textarea
                      rows={2}
                      value={editDraft.note}
                      onChange={(event) => setEditDraft((prev) => ({ ...prev, note: event.target.value }))}
                      className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-sm text-white outline-none ring-cyan-400 focus:ring-2"
                    />
                  </label>
                  <label className="block text-xs text-zinc-400">
                    Rating ({Number(editDraft.rating).toFixed(1)})
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.1"
                      value={editDraft.rating}
                      onChange={(event) => setEditDraft((prev) => ({ ...prev, rating: Number(event.target.value) }))}
                      className="mt-1 w-full accent-fuchsia-500"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(item.id)}
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
                <p className="text-sm leading-relaxed text-zinc-200">{item.note}</p>
              )}
              {!item.isFriendPost && editingId !== item.id && (
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="mt-2 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:border-white/30"
                >
                  Bewerken
                </button>
              )}
              {item.id && (
                <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-zinc-950/40 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleLike(item.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                        getInteraction(item.id).likedByMe
                          ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-200'
                          : 'border-white/15 bg-zinc-900/80 text-zinc-300 hover:border-white/30'
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
                        <path
                          d="M12 20.5s-6.5-3.9-9.1-8C1.2 9.7 2.2 6.5 5.4 5.6c2-.5 3.8.3 4.9 2 1.1-1.7 2.9-2.5 4.9-2 3.2.9 4.2 4.1 2.5 6.9-2.6 4.1-9.1 8-9.1 8z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill={getInteraction(item.id).likedByMe ? 'currentColor' : 'none'}
                        />
                      </svg>
                      {getInteraction(item.id).likeCount}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCommentPanel(item.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                        openComments[item.id]
                          ? 'border-sky-300/55 bg-sky-500/20 text-sky-200'
                          : 'border-white/15 bg-zinc-900/80 text-zinc-300 hover:border-white/30'
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                        <path
                          d="M7 10h10M7 14h6m-5 7l-4 2 1-5a8 8 0 1 1 2.3 2.3z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {getInteraction(item.id).comments.length}
                    </button>
                  </div>

                  {openComments[item.id] && (
                    <>
                      <div className="space-y-2">
                        {getInteraction(item.id).comments.length === 0 && (
                          <p className="text-xs text-zinc-500">Nog geen reacties. Wees de eerste.</p>
                        )}
                        {getInteraction(item.id).comments.map((comment) => (
                          <p key={comment.id} className="text-xs text-zinc-300">
                            <span className="font-semibold text-white">{comment.user}:</span> {comment.text}
                            {comment.createdAt ? (
                              <span className="ml-2 text-zinc-500">
                                {new Date(comment.createdAt).toLocaleDateString('nl-NL', {
                                  day: 'numeric',
                                  month: 'short',
                                })}
                              </span>
                            ) : null}
                          </p>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          value={commentDrafts[item.id] ?? ''}
                          onChange={(event) =>
                            setCommentDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))
                          }
                          placeholder="Plaats een reactie..."
                          className="w-full rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                        />
                        <button
                          type="button"
                          onClick={() => addComment(item.id)}
                          className="rounded-xl border border-sky-400/35 bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-200 hover:border-sky-300/60"
                        >
                          Plaats
                        </button>
                      </div>
                      {commentErrors[item.id] && <p className="text-xs text-amber-300">{commentErrors[item.id]}</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
