import { useMemo, useState } from 'react'

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
}) {
  const [form, setForm] = useState(profile)
  const [saveState, setSaveState] = useState('idle')
  const [isEditing, setIsEditing] = useState(false)
  const [selectedFriendId, setSelectedFriendId] = useState('')
  const [relationView, setRelationView] = useState('')

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

  const getBadgeEmoji = (badgeId) => {
    if (badgeId === 'festival-veteran') return '🎪'
    if (badgeId === 'globe-trotter') return '🌍'
    if (badgeId === 'front-row') return '🎫'
    if (badgeId === 'early-adopter') return '✨'
    return '🏆'
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
          <div className="text-left">
            <p className="text-lg font-semibold text-white">{checkIns.length}</p>
            <p className="text-xs text-zinc-400">Check-ins</p>
          </div>
        </div>
        <p className="text-xs text-zinc-500">Klik op Volgers of Volgend om de lijst te openen.</p>
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

      {relationView && (
        <article className="rounded-3xl border border-white/10 bg-zinc-900/65 p-4 shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              {relationView === 'followers' ? 'Volgers' : 'Volgend'}
            </h3>
            <button
              type="button"
              onClick={() => setRelationView('')}
              className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
            >
              Sluiten
            </button>
          </div>
          <div className="space-y-2">
            {(relationView === 'followers' ? followers : following).map((person) => (
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
      )}

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
            {(selectedFriend.checkIns ?? []).map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-zinc-950/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.artist}</p>
                    <p className="text-xs text-zinc-400">{item.venue}</p>
                  </div>
                  <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300">
                    {item.rating.toFixed(1)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-300">{item.note}</p>
              </div>
            ))}
          </div>
        </article>
      )}

    </section>
  )
}
