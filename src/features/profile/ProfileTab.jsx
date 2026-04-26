import { useEffect, useMemo, useState } from 'react'
import { getFeedInteractions, saveFeedInteraction } from '../../lib/db'
import { evaluateBadges } from '../../lib/badges'

function avatarInitials(displayName = '') {
  const parts = displayName
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return 'LY'
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '')
  return initials.join('')
}

export default function ProfileTab({
  profile,
  onSaveProfile,
  onSignOut,
  friends = [],
  checkIns = [],
  badges = [],
  externalSelectedFriendId = '',
}) {
  const [form, setForm] = useState(profile)
  const [saveState, setSaveState] = useState('idle')
  const [isEditing, setIsEditing] = useState(false)
  const [selectedFriendId, setSelectedFriendId] = useState('')
  const [relationView, setRelationView] = useState('')
  const [interactions, setInteractions] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [openComments, setOpenComments] = useState({})
  const [commentErrors, setCommentErrors] = useState({})

  const hasChanges = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(profile)
  }, [form, profile])

  const initials = avatarInitials(form.displayName)
  const selectedFriend = friends.find((friend) => friend.id === selectedFriendId) ?? null
  const followers = friends
  const following = friends
  const unlockedBadges = useMemo(() => badges.filter((badge) => badge.unlocked), [badges])

  const friendStats = useMemo(() => {
    if (!selectedFriend) return null
    const checkIns = selectedFriend.checkIns ?? []
    const uniqueArtists = new Set(checkIns.map((item) => item.artist.toLowerCase())).size
    const uniquePlaces = new Set(checkIns.map((item) => item.venue.toLowerCase())).size
    const average =
      checkIns.length > 0
        ? (checkIns.reduce((sum, item) => sum + item.rating, 0) / checkIns.length).toFixed(1)
        : '0.0'
    return { total: checkIns.length, uniqueArtists, uniquePlaces, average }
  }, [selectedFriend])
  const selectedFriendBadges = useMemo(() => {
    if (!selectedFriend) return []
    return evaluateBadges(selectedFriend.checkIns ?? [], [])
  }, [selectedFriend])

  const getBadgeEmoji = (badgeId) => {
    if (badgeId === 'festival-veteran') return '🎪'
    if (badgeId === 'globe-trotter') return '🌍'
    if (badgeId === 'front-row') return '🎫'
    if (badgeId === 'early-adopter') return '✨'
    return '🏆'
  }

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

  useEffect(() => {
    setSelectedFriendId(externalSelectedFriendId || '')
  }, [externalSelectedFriendId])

  function getInteraction(itemId) {
    return interactions[itemId] ?? { likedByMe: false, likeCount: 0, comments: [] }
  }

  function toggleLike(itemId) {
    setInteractions((prev) => {
      const current = prev[itemId] ?? { likedByMe: false, likeCount: 0, comments: [] }
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

  function toggleCommentPanel(itemId) {
    setOpenComments((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
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
      const current = prev[itemId] ?? { likedByMe: false, likeCount: 0, comments: [] }
      const next = {
        ...prev,
        [itemId]: {
          ...current,
          comments: [
            ...current.comments,
            {
              id: crypto.randomUUID(),
              user: form.displayName || form.username || 'Jij',
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

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
    setSaveState('idle')
  }

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      setForm((prev) => ({ ...prev, avatarUrl: result }))
      setSaveState('idle')
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!hasChanges) return
    setSaveState('saving')
    await onSaveProfile(form)
    setSaveState('saved')
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <section className="space-y-4">
        <article className="rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-zinc-400">Profiel bewerken</p>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
            >
              Sluiten
            </button>
          </div>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm text-zinc-300">
              Profielfoto uploaden
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
                className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-100"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Weergavenaam
              <input
                value={form.displayName}
                onChange={handleChange('displayName')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Bijv. Joery van den Berg"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Gebruikersnaam
              <input
                value={form.username}
                onChange={handleChange('username')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Bijv. joerylive"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Bio
              <textarea
                rows={3}
                value={form.bio}
                onChange={handleChange('bio')}
                className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Waar ga jij muzikaal op aan?"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Favoriete genres
              <input
                value={form.favoriteGenres}
                onChange={handleChange('favoriteGenres')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Bijv. House, Techno, Indie Dance"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Favoriete artiesten
              <input
                value={form.favoriteArtists}
                onChange={handleChange('favoriteArtists')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Bijv. BICEP, The Blaze"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Stad
              <input
                value={form.city}
                onChange={handleChange('city')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Bijv. Amsterdam"
              />
            </label>
            <button
              type="submit"
              disabled={!hasChanges || saveState === 'saving'}
              className="w-full rounded-xl bg-gradient-to-r from-rose-500 via-fuchsia-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === 'saving' ? 'Opslaan...' : 'Profiel opslaan'}
            </button>
            {saveState === 'saved' && <p className="text-xs text-emerald-300">Profiel opgeslagen.</p>}
          </form>
        </article>
      </section>
    )
  }

  if (selectedFriend && friendStats) {
    const unlockedFriendBadges = selectedFriendBadges.filter((badge) => badge.unlocked)
    return (
      <section className="space-y-4">
        <article className="rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedFriendId('')}
              className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
            >
              Terug
            </button>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Profiel</p>
          </div>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {selectedFriend.displayName}
            <span className="text-cyan-300">.</span>
          </h2>
          <p className="mt-1 text-sm text-zinc-400">@{selectedFriend.username}</p>
          <p className="mt-3 text-sm text-zinc-300">{selectedFriend.bio}</p>

          {unlockedFriendBadges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {unlockedFriendBadges.map((badge) => (
                <span
                  key={`friend-header-badge-${badge.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-300/45 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-100"
                >
                  <span aria-hidden="true">{getBadgeEmoji(badge.id)}</span>
                  {badge.name}
                </span>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-white/10 bg-zinc-900/65 p-4 shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-white">{friendStats.total}</p>
              <p className="text-[11px] text-zinc-400">Check-ins</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-white">{friendStats.uniqueArtists}</p>
              <p className="text-[11px] text-zinc-400">Artiesten</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-white">{friendStats.uniquePlaces}</p>
              <p className="text-[11px] text-zinc-400">Plekken</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-rose-300">{friendStats.average}</p>
              <p className="text-[11px] text-zinc-400">Gemiddeld</p>
            </div>
          </div>
        </article>

        <article className="space-y-3 rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
          <p className="text-sm font-semibold text-zinc-200">Persoonlijke feed</p>
          <div className="space-y-3">
            {(selectedFriend.checkIns ?? [])
              .slice()
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((item) => (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60">
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.artist}</p>
                        <p className="text-xs text-zinc-400">{item.venue}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString('nl-NL', {
                                day: 'numeric',
                                month: 'short',
                              })
                            : 'Net toegevoegd'}
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300">
                        {item.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-300">{item.note}</p>
                  </div>
                  {item.photoDataUrl && (
                    <div className="overflow-hidden border-t border-white/10 bg-zinc-950/40">
                      <img
                        src={item.photoDataUrl}
                        alt={`${item.artist} check-in`}
                        className="h-44 w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="border-t border-white/10 p-3">
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
                      <div className="mt-3 space-y-2">
                        <div className="space-y-1.5">
                          {getInteraction(item.id).comments.length === 0 && (
                            <p className="text-xs text-zinc-500">Nog geen reacties. Wees de eerste.</p>
                          )}
                          {getInteraction(item.id).comments.map((comment) => (
                            <p key={comment.id} className="text-xs text-zinc-300">
                              <span className="font-semibold text-white">{comment.user}:</span> {comment.text}
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
                      </div>
                    )}
                  </div>
                </article>
              ))}
            {(selectedFriend.checkIns ?? []).length === 0 && (
              <p className="text-xs text-zinc-500">Nog geen check-ins van deze gebruiker.</p>
            )}
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <article className="rounded-3xl border border-fuchsia-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-zinc-950 text-lg font-semibold text-zinc-100">
            {form.avatarUrl ? (
              <img src={form.avatarUrl} alt="Profielfoto" className="h-full w-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div>
            <p className="text-sm text-zinc-400">@{form.username || 'jouwnaam'}</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">
              {form.displayName || 'Jouw naam'}
              <span className="text-cyan-300">.</span>
            </h2>
            {unlockedBadges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unlockedBadges.slice(0, 4).map((badge) => (
                  <span
                    key={`header-badge-${badge.id}`}
                    className="inline-flex items-center gap-1 rounded-full border border-cyan-300/45 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100"
                  >
                    <span aria-hidden="true">{getBadgeEmoji(badge.id)}</span>
                    {badge.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-300">{form.bio || 'Voeg een korte bio toe.'}</p>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="mt-4 rounded-xl border border-white/15 bg-zinc-950/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/30"
        >
          Profiel bewerken
        </button>
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="ml-2 mt-4 rounded-xl border border-white/15 bg-zinc-950/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/30"
          >
            Uitloggen
          </button>
        )}
      </article>

      <article className="rounded-3xl border border-white/10 bg-zinc-900/65 p-4 shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-6">
          <button
            type="button"
            onClick={() => setRelationView('followers')}
            className="text-left"
          >
            <p className="text-lg font-semibold text-white">{followers.length}</p>
            <p className="text-xs text-zinc-400">Volgers</p>
          </button>
          <button
            type="button"
            onClick={() => setRelationView('following')}
            className="text-left"
          >
            <p className="text-lg font-semibold text-white">{following.length}</p>
            <p className="text-xs text-zinc-400">Volgend</p>
          </button>
          <button
            type="button"
            onClick={() => setRelationView('checkins')}
            className="text-left"
          >
            <p className="text-lg font-semibold text-white">{checkIns.length}</p>
            <p className="text-xs text-zinc-400">Check-ins</p>
          </button>
        </div>
        <p className="text-xs text-zinc-500">Klik op Volgers, Volgend of Check-ins om te openen.</p>
      </article>

      <article className="rounded-3xl border border-cyan-300/20 bg-zinc-900/65 p-4 shadow-lg shadow-cyan-500/10 backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Badges</h3>
          <p className="text-xs text-zinc-400">
            {badges.filter((badge) => badge.unlocked).length}/{badges.length}
          </p>
        </div>
        {unlockedBadges.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {unlockedBadges.map((badge) => (
              <div
                key={`unlocked-${badge.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200"
              >
                <span aria-hidden="true">{getBadgeEmoji(badge.id)}</span>
                <span>{badge.name}</span>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className={`rounded-xl border p-3 ${
                badge.unlocked
                  ? 'border-emerald-300/35 bg-gradient-to-r from-emerald-500/12 to-cyan-500/12'
                  : 'border-white/10 bg-zinc-950/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  <span className="mr-1.5" aria-hidden="true">
                    {getBadgeEmoji(badge.id)}
                  </span>
                  {badge.name}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    badge.unlocked ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {badge.unlocked ? 'Unlocked' : `${badge.progress}/${badge.threshold}`}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{badge.description}</p>
              {!badge.unlocked && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400/80 to-fuchsia-400/80"
                    style={{
                      width: `${Math.min(100, Math.round((badge.progress / Math.max(1, badge.threshold)) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          {badges.length === 0 && <p className="text-xs text-zinc-500">Nog geen badges berekend.</p>}
        </div>
      </article>

      {selectedFriend && friendStats && (
        <article className="space-y-3 rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">{selectedFriend.displayName}</h3>
              <p className="text-xs text-zinc-400">@{selectedFriend.username}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFriendId('')}
              className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
            >
              Sluiten
            </button>
          </div>

          <p className="text-sm text-zinc-300">{selectedFriend.bio}</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-white">{friendStats.total}</p>
              <p className="text-[11px] text-zinc-400">Check-ins</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-white">{friendStats.uniqueArtists}</p>
              <p className="text-[11px] text-zinc-400">Artiesten</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-white">{friendStats.uniquePlaces}</p>
              <p className="text-[11px] text-zinc-400">Plekken</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-rose-300">{friendStats.average}</p>
              <p className="text-[11px] text-zinc-400">Gemiddeld</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-200">Timeline</p>
            <div className="max-h-[50svh] space-y-3 overflow-y-auto pr-1">
              {(selectedFriend.checkIns ?? [])
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60">
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{item.artist}</p>
                          <p className="text-xs text-zinc-400">{item.venue}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleDateString('nl-NL', {
                                  day: 'numeric',
                                  month: 'short',
                                })
                              : 'Net toegevoegd'}
                          </p>
                        </div>
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300">
                          {item.rating.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-300">{item.note}</p>
                    </div>
                    <div className="border-t border-white/10 p-3">
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
                        <div className="mt-3 space-y-2">
                          <div className="space-y-1.5">
                            {getInteraction(item.id).comments.length === 0 && (
                              <p className="text-xs text-zinc-500">Nog geen reacties. Wees de eerste.</p>
                            )}
                            {getInteraction(item.id).comments.map((comment) => (
                              <p key={comment.id} className="text-xs text-zinc-300">
                                <span className="font-semibold text-white">{comment.user}:</span> {comment.text}
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
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              {(selectedFriend.checkIns ?? []).length === 0 && (
                <p className="text-xs text-zinc-500">Nog geen check-ins van deze gebruiker.</p>
              )}
            </div>
          </div>
        </article>
      )}

      {relationView && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm">
          <article className="flex max-h-[78svh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/15 bg-zinc-900/95 shadow-2xl shadow-fuchsia-500/20">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="text-lg font-semibold text-white">
                {relationView === 'followers' ? 'Volgers' : relationView === 'following' ? 'Volgend' : 'Mijn check-ins'}
              </h3>
              <button
                type="button"
                onClick={() => setRelationView('')}
                className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
              >
                Sluiten
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {relationView === 'checkins'
                ? checkIns.map((item) => (
                    <div
                      key={`my-checkin-${item.id}`}
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-white">{item.artist}</p>
                      <p className="text-xs text-zinc-400">{item.venue}</p>
                    </div>
                  ))
                : (relationView === 'followers' ? followers : following).map((person) => (
                    <button
                      key={`${relationView}-${person.id}`}
                      type="button"
                      onClick={() => {
                        setSelectedFriendId(person.id)
                        setRelationView('')
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-left hover:border-white/20"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{person.displayName}</p>
                        <p className="text-xs text-zinc-400">@{person.username}</p>
                      </div>
                      <span className="text-xs text-zinc-500">{person.city}</span>
                    </button>
                  ))}
            </div>
          </article>
        </div>
      )}

    </section>
  )
}
