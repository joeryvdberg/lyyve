import { useEffect, useMemo, useState } from 'react'
import { getCatalogEntries } from '../../lib/db'

const MAINSTREAM_ARTISTS = new Set(
  [
    'fred again..',
    'the blaze',
    'bicep',
    'disclosure',
    'swedish house mafia',
    'calvin harris',
    'charli xcx',
    'dua lipa',
    'drake',
    'kendrick lamar',
    'arctic monkeys',
    'billie eilish',
    'travis scott',
    'peggy gou',
    'four tet',
    'skrillex',
    'tiesto',
    'martin garrix',
    'david guetta',
    'amelie lens',
    'charlotte de witte',
  ].map((name) => name.toLowerCase())
)

const MAINSTREAM_EVENTS = new Set(
  [
    'coachella',
    'coachella valley music and arts festival',
    'lowlands',
    'lollapalooza',
    'tomorrowland',
    'pukkelpop',
    'pinkpop',
    'mysteryland',
    'awakenings festival',
    'defqon.1',
    'ultra music festival',
    'glastonbury festival',
    'sziget festival',
    'down the rabbit hole',
    'best kept secret',
    'zwarte cross',
  ].map((name) => name.toLowerCase())
)

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0))

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[rows - 1][cols - 1]
}

function getLabel(value) {
  return typeof value === 'string' ? value : value?.name ?? ''
}

function getPopularity(value) {
  if (typeof value === 'string') return 0
  return Number(value?.popularity ?? 0)
}

function isRecognizableName(rawName) {
  const name = rawName.trim()
  if (!name) return false
  if (/^\[.*\]$/.test(name)) return false
  if (/^\(.*\)$/.test(name)) return false
  if (/^(unknown|no artist|various artists|anonymous)$/i.test(name)) return false
  if (name.length < 2) return false
  return true
}

function mergeByName(primary, secondary) {
  const map = new Map()
  for (const item of [...primary, ...secondary]) {
    const name = getLabel(item).trim()
    if (!name) continue
    const key = normalizeText(name)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, item)
      continue
    }
    const currentPopularity = getPopularity(item)
    const existingPopularity = getPopularity(existing)
    if (currentPopularity > existingPopularity) {
      map.set(key, item)
    }
  }
  return [...map.values()]
}

function rankSuggestions(pool, query, mainstreamSet) {
  return pool
    .map((item) => {
      const name = getLabel(item)
      if (!isRecognizableName(name)) return null
      const normalizedArtist = normalizeText(name)
      const mainstreamBoost = mainstreamSet.has(normalizedArtist) ? 140 : 0

      if (normalizedArtist.startsWith(query)) {
        return {
          name,
          score: 300 + (50 - normalizedArtist.length) + mainstreamBoost,
          popularity: getPopularity(item),
        }
      }

      if (normalizedArtist.includes(query)) {
        return {
          name,
          score: 220 - normalizedArtist.indexOf(query) + mainstreamBoost,
          popularity: getPopularity(item),
        }
      }

      const maxDistance = query.length <= 5 ? 1 : 2
      const distance = levenshteinDistance(normalizedArtist.slice(0, query.length), query)
      if (distance <= maxDistance) {
        return { name, score: 120 - distance * 20 + mainstreamBoost, popularity: getPopularity(item) }
      }

      return null
    })
    .filter((item) => item !== null)
    .sort((a, b) => b.score - a.score || b.popularity - a.popularity || a.name.localeCompare(b.name))
    .map((item) => item.name)
    .slice(0, 6)
}

export default function CheckInTab({ onAddCheckIn }) {
  const datasetBase = import.meta.env.BASE_URL
  const [rating, setRating] = useState(8.0)
  const [artistQuery, setArtistQuery] = useState('')
  const [venue, setVenue] = useState('')
  const [note, setNote] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [photoName, setPhotoName] = useState('')
  const [photoInputMode, setPhotoInputMode] = useState('camera')
  const [artistPool, setArtistPool] = useState([])
  const [venuePool, setVenuePool] = useState([])

  useEffect(() => {
    let mounted = true

    async function loadArtists() {
      try {
        const [response, communityArtists] = await Promise.all([
          fetch(`${datasetBase}artists.json`),
          getCatalogEntries('artist'),
        ])
        if (!response.ok) return
        const data = await response.json()
        if (mounted) {
          const baseArtists = Array.isArray(data.artists) ? data.artists : []
          setArtistPool(mergeByName(communityArtists, baseArtists))
        }
      } catch {
        // Keep UX functional even if dataset cannot be loaded.
      }
    }

    async function loadVenues() {
      try {
        const [response, communityPlaces] = await Promise.all([
          fetch(`${datasetBase}venues.json`),
          getCatalogEntries('place'),
        ])
        if (!response.ok) return
        const data = await response.json()
        if (mounted) {
          const basePlaces = Array.isArray(data.places) ? data.places : []
          setVenuePool(mergeByName(communityPlaces, basePlaces))
        }
      } catch {
        // Keep UX functional even if dataset cannot be loaded.
      }
    }

    loadArtists()
    loadVenues()
    return () => {
      mounted = false
    }
  }, [datasetBase])

  const artistSuggestions = useMemo(() => {
    const query = normalizeText(artistQuery)
    if (!query) return []

    return rankSuggestions(artistPool, query, MAINSTREAM_ARTISTS)
  }, [artistPool, artistQuery])

  const venueSuggestions = useMemo(() => {
    const query = normalizeText(venue)
    if (!query) return []

    return rankSuggestions(venuePool, query, MAINSTREAM_EVENTS)
  }, [venuePool, venue])

  const handleSubmit = (event) => {
    event.preventDefault()

    const artist = artistQuery.trim()
    const location = venue.trim()
    const description = note.trim()

    if (!artist || !location) return

    onAddCheckIn({
      artist,
      venue: location,
      note: description,
      rating,
      photoDataUrl,
    })

    setArtistPool((prev) => mergeByName([{ name: artist, source: 'Community', popularity: 100 }], prev))
    setVenuePool((prev) => mergeByName([{ name: location, source: 'Community', popularity: 100 }], prev))

    setArtistQuery('')
    setVenue('')
    setNote('')
    setRating(8.0)
    setPhotoDataUrl('')
    setPhotoName('')
  }

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      setPhotoDataUrl(result)
      setPhotoName(file.name)
    }
    reader.readAsDataURL(file)
  }

  const applyArtistSuggestion = (name) => {
    setArtistQuery(name)
  }

  const applyVenueSuggestion = (name) => {
    setVenue(name)
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">
        Nieuwe check-in<span className="text-cyan-300">.</span>
      </h2>
      <div className="rounded-3xl border border-white/10 bg-zinc-900/65 p-4 shadow-2xl shadow-fuchsia-900/25 backdrop-blur-xl">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm text-zinc-300">
            Artiest
            <input
              value={artistQuery}
              onChange={(event) => setArtistQuery(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
              placeholder="Bijv. Disclosure"
            />
            {artistQuery.trim() && artistSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {artistSuggestions.map((artist) => (
                  <button
                    key={artist}
                    type="button"
                    onClick={() => applyArtistSuggestion(artist)}
                    className="rounded-full border border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-sky-400/70 hover:text-sky-200"
                  >
                    {artist}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="block text-sm text-zinc-300">
            Festival / venue
            <input
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
              placeholder="Bijv. Down The Rabbit Hole"
            />
            {venue.trim() && venueSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {venueSuggestions.map((place) => (
                  <button
                    key={place}
                    type="button"
                    onClick={() => applyVenueSuggestion(place)}
                    className="rounded-full border border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-sky-400/70 hover:text-sky-200"
                  >
                    {place}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="block text-sm text-zinc-300">
            Opmerking / beschrijving
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
              placeholder="Hoe was de show? Sfeer, geluid, setlist..."
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Foto van je moment
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-zinc-950/70 p-1">
              <button
                type="button"
                onClick={() => setPhotoInputMode('camera')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  photoInputMode === 'camera'
                    ? 'bg-cyan-500/25 text-cyan-200'
                    : 'text-zinc-300 hover:bg-zinc-800/80'
                }`}
              >
                Foto maken
              </button>
              <button
                type="button"
                onClick={() => setPhotoInputMode('upload')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  photoInputMode === 'upload'
                    ? 'bg-cyan-500/25 text-cyan-200'
                    : 'text-zinc-300 hover:bg-zinc-800/80'
                }`}
              >
                Bestand uploaden
              </button>
            </div>
            <input
              type="file"
              accept="image/*"
              capture={photoInputMode === 'camera' ? 'environment' : undefined}
              onChange={handlePhotoChange}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-100"
            />
            {photoName && <p className="mt-2 text-xs text-zinc-400">Gekozen bestand: {photoName}</p>}
            {photoDataUrl && (
              <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                <img src={photoDataUrl} alt="Check-in preview" className="h-44 w-full object-cover" />
              </div>
            )}
          </label>
          <label className="block text-sm text-zinc-300">
            Rating
            <div className="mt-2 rounded-xl border border-white/10 bg-zinc-950/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-zinc-400">0.0</span>
                <span className="rounded-full bg-gradient-to-r from-rose-500/25 via-fuchsia-500/25 to-sky-500/25 px-2.5 py-1 text-sm font-semibold text-white">
                  {rating.toFixed(1)}
                </span>
                <span className="text-xs text-zinc-400">10.0</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={rating}
                onChange={(event) => setRating(Number(event.target.value))}
                className="w-full cursor-pointer accent-fuchsia-500"
                aria-label="Rating van 0.0 tot 10.0"
              />
            </div>
          </label>
          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-rose-500 via-fuchsia-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/30 transition hover:brightness-110"
          >
            Check-in opslaan
          </button>
        </form>
      </div>
    </section>
  )
}
