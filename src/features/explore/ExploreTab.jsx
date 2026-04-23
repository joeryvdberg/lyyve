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

export default function ExploreTab({ checkIns }) {
  const datasetBase = import.meta.env.BASE_URL
  const [mode, setMode] = useState('artist')
  const [query, setQuery] = useState('')
  const [artists, setArtists] = useState([])
  const [venues, setVenues] = useState([])
  const [selectedName, setSelectedName] = useState('')
  const [fallbackSummary, setFallbackSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)

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

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">
        Ontdekken<span className="text-sky-400">.</span>
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
    </section>
  )
}
