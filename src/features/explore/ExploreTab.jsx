import { useEffect, useMemo, useState } from 'react'
import { getCatalogEntries, getEventCache, saveEventCache } from '../../lib/db'

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
    'lowlands',
    'tomorrowland',
    'coachella',
    'burning man',
    'ultra music festival',
    'glastonbury festival',
    'pukkelpop',
    'mysteryland',
    'awakenings festival',
    'defqon.1 festival',
    'pinkpop',
    'sziget festival',
  ].map((name) => name.toLowerCase())
)

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
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

function getPopularity(value) {
  if (typeof value === 'string') return 0
  return Number(value?.popularity ?? 0)
}

function getName(value) {
  return typeof value === 'string' ? value : value?.name ?? ''
}

function dedupeEventsById(events = []) {
  const map = new Map()
  for (const event of events) {
    const key = event.id || `${normalizeText(event.name)}-${event.date}`
    if (!map.has(key)) map.set(key, event)
  }
  return [...map.values()]
}

const UPCOMING_EVENTS = [
  { id: 'evt-1', name: 'DGTL Festival', city: 'Amsterdam', date: '2026-05-02', type: 'Festival' },
  { id: 'evt-2', name: 'Lente Kabinet', city: 'Amsterdam', date: '2026-05-30', type: 'Festival' },
  { id: 'evt-3', name: 'Down The Rabbit Hole', city: 'Beuningen', date: '2026-07-03', type: 'Festival' },
  { id: 'evt-4', name: 'Awakenings Summer Festival', city: 'Hilvarenbeek', date: '2026-07-10', type: 'Festival' },
  { id: 'evt-5', name: 'Roadburn', city: 'Tilburg', date: '2026-04-16', type: 'Festival' },
  { id: 'evt-6', name: 'Rotterdam Rave Weekender', city: 'Rotterdam', date: '2026-06-12', type: 'Event' },
  { id: 'evt-7', name: 'Paradiso Weekend Specials', city: 'Amsterdam', date: '2026-05-09', type: 'Venue event' },
  { id: 'evt-8', name: 'TivoliVredenburg Electronic Night', city: 'Utrecht', date: '2026-05-15', type: 'Venue event' },
]

const CITY_NEIGHBORS = {
  amsterdam: ['amsterdam', 'utrecht', 'haarlem', 'zaandam', 'rotterdam'],
  rotterdam: ['rotterdam', 'den haag', 'delft', 'amsterdam', 'utrecht'],
  utrecht: ['utrecht', 'amsterdam', 'amersfoort', 'rotterdam'],
  eindhoven: ['eindhoven', 'tilburg', 'den bosch', 'breda'],
}

async function fetchBandsintownArtistEvents(artistName, appId) {
  const url = `https://rest.bandsintown.com/artists/${encodeURIComponent(
    artistName
  )}/events?app_id=${encodeURIComponent(appId)}&date=upcoming`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`bandsintown ${response.status}`)
  }
  const rows = await response.json()
  if (!Array.isArray(rows)) return []
  return rows.map((item) => ({
    id: String(item.id ?? `${artistName}-${item.datetime}`),
    name: item.title || item?.venue?.name || artistName,
    artist: artistName,
    venue: item?.venue?.name || 'Venue volgt',
    city: item?.venue?.city || '',
    country: item?.venue?.country || '',
    date: item.datetime || '',
    url: item.url || '',
    source: 'bandsintown',
    type: 'Live event',
  }))
}

async function fetchBandsintownNearbyEvents({ appId, artists, cityKey, targetCities }) {
  const cached = await getEventCache(cityKey, 1000 * 60 * 45)
  if (cached?.length) return cached

  const artistSlice = artists.slice(0, 8)
  const responses = await Promise.all(
    artistSlice.map((artist) => fetchBandsintownArtistEvents(artist, appId).catch(() => []))
  )
  const citySet = new Set(targetCities.map(normalizeText))
  const merged = dedupeEventsById(responses.flat())
    .filter((event) => citySet.has(normalizeText(event.city)))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 20)

  await saveEventCache(cityKey, merged, 'bandsintown')
  return merged
}

function mergeByName(primary, secondary) {
  const map = new Map()
  for (const item of [...primary, ...secondary]) {
    const name = getName(item).trim()
    if (!name) continue
    const key = normalizeText(name)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, item)
      continue
    }
    if (getPopularity(item) > getPopularity(existing)) {
      map.set(key, item)
    }
  }
  return [...map.values()]
}

export default function ExploreTab({ checkIns, profile }) {
  const datasetBase = import.meta.env.BASE_URL
  const [mode, setMode] = useState('artist')
  const [query, setQuery] = useState('')
  const [artists, setArtists] = useState([])
  const [venues, setVenues] = useState([])
  const [selectedName, setSelectedName] = useState('')
  const [fallbackSummary, setFallbackSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [liveEvents, setLiveEvents] = useState([])
  const [liveEventsLoading, setLiveEventsLoading] = useState(false)
  const [liveEventsError, setLiveEventsError] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadData() {
      try {
        const [artistsRes, venuesRes, communityArtists, communityPlaces] = await Promise.all([
          fetch(`${datasetBase}artists.json`),
          fetch(`${datasetBase}venues.json`),
          getCatalogEntries('artist'),
          getCatalogEntries('place'),
        ])

        if (!mounted) return

        if (artistsRes.ok) {
          const artistsData = await artistsRes.json()
          const baseArtists = Array.isArray(artistsData.artists) ? artistsData.artists : []
          setArtists(mergeByName(communityArtists, baseArtists))
        }

        if (venuesRes.ok) {
          const venuesData = await venuesRes.json()
          const basePlaces = Array.isArray(venuesData.places) ? venuesData.places : []
          setVenues(mergeByName(communityPlaces, basePlaces))
        }
      } catch {
        // Fall back gracefully if datasets are unavailable.
      }
    }

    loadData()
    return () => {
      mounted = false
    }
  }, [datasetBase])

  const pool = mode === 'artist' ? artists : venues

  const normalizedQuery = normalizeText(query)

  const rankedItems = useMemo(() => {
    const source = [...pool].filter((item) => isRecognizableName(getName(item)))
    if (!normalizedQuery) return source.slice(0, 12).map((item) => getName(item))

    return source
      .map((item) => {
        const name = getName(item)
        const normalizedName = normalizeText(name)
        const popularity = getPopularity(item)
        const mainstreamBoost =
          mode === 'artist'
            ? MAINSTREAM_ARTISTS.has(normalizedName)
              ? 120
              : 0
            : MAINSTREAM_EVENTS.has(normalizedName)
              ? 120
              : 0

        if (normalizedName.startsWith(normalizedQuery)) {
          return { name, score: 200 - normalizedName.length + mainstreamBoost, popularity }
        }

        if (normalizedName.includes(normalizedQuery)) {
          return { name, score: 120 - normalizedName.indexOf(normalizedQuery) + mainstreamBoost, popularity }
        }

        return null
      })
      .filter((item) => item !== null)
      .sort((a, b) => b.score - a.score || b.popularity - a.popularity || a.name.localeCompare(b.name))
      .map((item) => item.name)
      .slice(0, 12)
  }, [mode, pool, normalizedQuery])

  const catalogEntry = useMemo(() => {
    const entries = mode === 'artist' ? artists : venues
    return entries.find((item) => normalizeText(getName(item)) === normalizeText(selectedName)) ?? null
  }, [artists, mode, selectedName, venues])

  const averageRatingInfo = useMemo(() => {
    if (!selectedName) return null

    const normalizedSelection = normalizeText(selectedName)
    const relevant = checkIns.filter((item) =>
      normalizeText(mode === 'artist' ? item.artist : item.venue) === normalizedSelection
    )

    if (!relevant.length) {
      return { count: 0, average: 0 }
    }

    const average = relevant.reduce((sum, item) => sum + item.rating, 0) / relevant.length
    return { count: relevant.length, average }
  }, [checkIns, mode, selectedName])

  useEffect(() => {
    if (!selectedName || catalogEntry?.description) return

    let mounted = true

    async function loadSummary() {
      try {
        if (mounted) setSummaryLoading(true)
        const response = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(selectedName)}`
        )

        if (!response.ok) {
          throw new Error('summary unavailable')
        }

        const data = await response.json()
        if (mounted) {
          setFallbackSummary(
            data.extract ??
              'Nog geen korte info gevonden. Voeg later een eigen beschrijving toe in je database.'
          )
        }
      } catch {
        if (mounted) {
          setFallbackSummary(
            'Nog geen korte info gevonden. Voeg later een eigen beschrijving toe in je database.'
          )
        }
      } finally {
        if (mounted) {
          setSummaryLoading(false)
        }
      }
    }

    loadSummary()
    return () => {
      mounted = false
    }
  }, [catalogEntry, selectedName])

  const displayedSummary =
    catalogEntry?.description ||
    fallbackSummary ||
    'Nog geen korte info gevonden. Voeg later een eigen beschrijving toe in je database.'

  const nearbyUpcoming = useMemo(() => {
    const cityKey = normalizeText(profile?.city || '')
    const targetCities = new Set(CITY_NEIGHBORS[cityKey] ?? [cityKey || 'amsterdam'])
    const source = liveEvents.length > 0 ? liveEvents : UPCOMING_EVENTS
    return source
      .filter((event) => targetCities.has(normalizeText(event.city)))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5)
  }, [liveEvents, profile?.city])

  const locationLabel = profile?.city?.trim() || 'jouw regio'

  useEffect(() => {
    let mounted = true
    const cityKey = normalizeText(profile?.city || '')
    const targetCities = CITY_NEIGHBORS[cityKey] ?? [cityKey || 'amsterdam']

    async function loadLiveEvents() {
      try {
        if (mounted) {
          setLiveEventsLoading(true)
          setLiveEventsError('')
        }

        const appId = import.meta.env.VITE_BANDSINTOWN_APP_ID
        if (!appId) {
          throw new Error('missing-app-id')
        }

        const favoriteArtists = String(profile?.favoriteArtists || '')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
        const suggestedArtists = dedupeEventsById(
          artists.map((item) => ({ id: getName(item), name: getName(item) })).slice(0, 6)
        ).map((item) => item.name)
        const artistSeed = [...new Set([...favoriteArtists, ...suggestedArtists, 'Fred again..', 'BICEP'])]
        const events = await fetchBandsintownNearbyEvents({
          appId,
          artists: artistSeed,
          cityKey: cityKey || 'amsterdam',
          targetCities,
        })
        if (mounted) {
          setLiveEvents(events)
        }
      } catch {
        if (mounted) {
          setLiveEvents([])
          setLiveEventsError('Bandsintown live data niet beschikbaar, fallback actief.')
        }
      } finally {
        if (mounted) {
          setLiveEventsLoading(false)
        }
      }
    }

    loadLiveEvents()
    return () => {
      mounted = false
    }
  }, [artists, profile?.city, profile?.favoriteArtists])

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">
        Ontdekken<span className="text-cyan-300">.</span>
      </h2>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-zinc-900/65 p-1 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => {
            setMode('artist')
            setSelectedName('')
          }}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            mode === 'artist'
              ? 'bg-gradient-to-r from-rose-500/30 via-fuchsia-500/30 to-sky-500/30 text-white'
              : 'text-zinc-300'
          }`}
        >
          Artiesten
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('venue')
            setSelectedName('')
          }}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            mode === 'venue'
              ? 'bg-gradient-to-r from-rose-500/30 via-fuchsia-500/30 to-sky-500/30 text-white'
              : 'text-zinc-300'
          }`}
        >
          Venues/Festivals
        </button>
      </div>

      <label className="block text-sm text-zinc-300">
        Zoek {mode === 'artist' ? 'artiest' : 'venue/festival'}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
          placeholder={mode === 'artist' ? 'Bijv. Fred again..' : 'Bijv. Lowlands'}
        />
      </label>

      <div className="rounded-3xl border border-fuchsia-400/20 bg-zinc-900/65 p-3 shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl">
        <p className="mb-2 text-sm text-zinc-300">Klik voor details:</p>
        <div className="flex flex-wrap gap-2">
          {rankedItems.length === 0 && (
            <span className="text-xs text-zinc-500">Geen resultaten gevonden.</span>
          )}
          {rankedItems.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setSelectedName(name)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                selectedName === name
                  ? 'border-sky-400/70 bg-sky-500/20 text-sky-200'
                  : 'border-white/10 bg-zinc-950 text-zinc-300 hover:border-white/20'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {selectedName && (
        <article className="rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-xl shadow-sky-500/10 backdrop-blur-xl">
          <h3 className="text-lg font-semibold text-white">{selectedName}</h3>
          {catalogEntry?.source && (
            <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
              Dataset bron: {catalogEntry.source}
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-400">
            Gemiddelde Lyyve-rating:{' '}
            <span className="font-semibold text-sky-300">
              {averageRatingInfo && averageRatingInfo.count > 0
                ? `${averageRatingInfo.average.toFixed(1)} / 10.0`
                : 'Nog geen ratings'}
            </span>
            {averageRatingInfo && averageRatingInfo.count > 0
              ? ` (${averageRatingInfo.count} check-ins)`
              : ''}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            {summaryLoading ? 'Info laden...' : displayedSummary}
          </p>
        </article>
      )}

      <article className="rounded-3xl border border-emerald-300/20 bg-zinc-900/65 p-4 shadow-xl shadow-emerald-500/10 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">
            Binnenkort in de buurt<span className="text-emerald-300">.</span>
          </h3>
          <span className="rounded-full border border-white/10 bg-zinc-950/70 px-2 py-1 text-[11px] uppercase tracking-wide text-zinc-400">
            {locationLabel}
          </span>
        </div>
        {liveEventsLoading && <p className="mb-3 text-xs text-zinc-400">Live data laden...</p>}
        {!liveEventsLoading && liveEventsError && <p className="mb-3 text-xs text-amber-300">{liveEventsError}</p>}
        <div className="space-y-2">
          {nearbyUpcoming.map((event) => (
            <div key={event.id} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
              <p className="text-sm font-semibold text-white">{event.name}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {new Date(event.date).toLocaleDateString('nl-NL', {
                  day: 'numeric',
                  month: 'long',
                })}{' '}
                · {event.city} · {event.type}
              </p>
              {event.url ? (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-xs font-medium text-cyan-300 hover:text-cyan-200"
                >
                  Tickets / event
                </a>
              ) : null}
            </div>
          ))}
          {nearbyUpcoming.length === 0 && (
            <p className="text-xs text-zinc-500">
              Nog geen events gevonden voor deze regio. Voeg je stad toe in je profiel voor betere suggesties.
            </p>
          )}
        </div>
      </article>
    </section>
  )
}
