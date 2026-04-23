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

export default function ProfileTab({ profile, onSaveProfile }) {
  const [form, setForm] = useState(profile)
  const [saveState, setSaveState] = useState('idle')
  const [isEditing, setIsEditing] = useState(false)

  const hasChanges = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(profile)
  }, [form, profile])

  const initials = avatarInitials(form.displayName)

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
              <span className="text-sky-400">.</span>
            </h2>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-300">{form.bio || 'Voeg een korte bio toe.'}</p>
        <button
          type="button"
          onClick={() => setIsEditing((prev) => !prev)}
          className="mt-4 rounded-xl border border-white/15 bg-zinc-950/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/30"
        >
          {isEditing ? 'Bewerkmenu sluiten' : 'Profiel bewerken'}
        </button>
      </article>

      {isEditing && (
        <article className="rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
        <p className="text-sm text-zinc-400">Profiel verrijken</p>
        <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
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
      )}
    </section>
  )
}
