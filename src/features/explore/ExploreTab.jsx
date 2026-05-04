import { useEffect, useMemo, useState } from 'react'
import { getCatalogEntries, getEventCache, saveEventCache } from '../../lib/db'
import { hasSupabaseConfig, supabase } from '../../lib/supabase'

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

function normalizePeopleSearch(value) {
  return normalizeText(value).replace(/^@+/, '')
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

function normalizeExternalHttpUrl(raw) {
  const u = String(raw || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('//')) return `https:${u}`
  return ''
}

function getSpotifyArtistUrl(name, catalogEntry) {
  const id = catalogEntry?.spotifyId
  if (typeof id === 'string' && id.trim()) {
    return `https://open.spotify.com/artist/${id.trim()}`
  }
  return `https://open.spotify.com/search/${encodeURIComponent(name)}`
}

function buildGoogleTicketSearch(event) {
  const q = `tickets ${event.name} ${event.city || ''} ${event.venue || ''}`.replace(/\s+/g, ' ').trim()
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

function getTicketLinks(event) {
  const fromOffers =
    Array.isArray(event.offers) && event.offers.length > 0
      ? normalizeExternalHttpUrl(
          (event.offers.find((o) => o?.url && normalizeExternalHttpUrl(o.url)) || event.offers[0])?.url
        )
      : ''
  const primary = fromOffers || normalizeExternalHttpUrl(event.url)
  const google = buildGoogleTicketSearch(event)
  return { primary, google, hasPrimary: Boolean(primary) }
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
  {
    id: 'evt-1',
    name: 'DGTL Festival',
    city: 'Amsterdam',
    date: '2026-05-02',
    type: 'Festival',
    venue: 'NDSM Docklands',
    artist: 'Meerdere artiesten',
    source: 'fallback',
  },
  {
    id: 'evt-2',
    name: 'Lente Kabinet',
    city: 'Amsterdam',
    date: '2026-05-30',
    type: 'Festival',
    venue: 'Het Twiske',
    artist: 'Meerdere artiesten',
    source: 'fallback',
  },
  {
    id: 'evt-3',
    name: 'Down The Rabbit Hole',
    city: 'Beuningen',
    date: '2026-07-03',
    type: 'Festival',
    venue: 'De Groene Heuvels',
    artist: 'Meerdere artiesten',
    source: 'fallback',
  },
  {
    id: 'evt-4',
    name: 'Awakenings Summer Festival',
    city: 'Hilvarenbeek',
    date: '2026-07-10',
    type: 'Festival',
    venue: 'Beekse Bergen',
    artist: 'Meerdere artiesten',
    source: 'fallback',
  },
  {
    id: 'evt-5',
    name: 'Roadburn',
    city: 'Tilburg',
    date: '2026-04-16',
    type: 'Festival',
    venue: '013',
    artist: 'Meerdere artiesten',
    source: 'fallback',
  },
  {
    id: 'evt-6',
    name: 'Rotterdam Rave Weekender',
    city: 'Rotterdam',
    date: '2026-06-12',
    type: 'Event',
    venue: 'RTM Stage',
    artist: 'Rotterdam Rave line-up',
    source: 'fallback',
  },
  {
    id: 'evt-7',
    name: 'Paradiso Weekend Specials',
    city: 'Amsterdam',
    date: '2026-05-09',
    type: 'Venue event',
    venue: 'Paradiso',
    artist: 'Verschillende acts',
    source: 'fallback',
  },
  {
    id: 'evt-8',
    name: 'TivoliVredenburg Electronic Night',
    city: 'Utrecht',
    date: '2026-05-15',
    type: 'Venue event',
    venue: 'TivoliVredenburg',
    artist: 'Verschillende acts',
    source: 'fallback',
  },
]

const CITY_RADIUS_GROUPS = [
  ['amsterdam', 'utrecht', 'haarlem', 'zaandam', 'amstelveen', 'hoofddorp'],
  ['rotterdam', 'den haag', 'delft', 'leiden', 'dordrecht', 'gouda'],
  ['eindhoven', 'tilburg', 'den bosch', 'breda', 'helmond'],
  ['groningen', 'arnhem', 'nijmegen', 'enschede', 'zwolle', 'leeuwarden', 'maastricht'],
]

function getTargetCities(cityKey, radiusKm) {
  const normalizedCity = normalizeText(cityKey || '')
  const radius = Number(radiusKm || 75)
  const selectedGroups = radius <= 50 ? 1 : radius <= 100 ? 2 : radius <= 175 ? 3 : 4
  const pool = CITY_RADIUS_GROUPS.slice(0, selectedGroups).flat()
  return [...new Set([normalizedCity, ...pool].filter(Boolean))]
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
  return rows.map((item) => {
    const offerList = Array.isArray(item.offers) ? item.offers : []
    const firstOfferUrl = offerList.length
      ? normalizeExternalHttpUrl(
          (offerList.find((o) => o?.url && normalizeExternalHttpUrl(o.url)) || offerList[0])?.url
        )
      : ''
    const trackingUrl = normalizeExternalHttpUrl(item.url)
    return {
      id: String(item.id ?? `${artistName}-${item.datetime}`),
      name: item.title || item?.venue?.name || artistName,
      artist: artistName,
      venue: item?.venue?.name || 'Venue volgt',
      city: item?.venue?.city || '',
      country: item?.venue?.country || '',
      date: item.datetime || '',
      url: firstOfferUrl || trackingUrl || '',
      offers: offerList,
      source: 'bandsintown',
      type: 'Live event',
    }
  })
}

async function fetchBandsintownNearbyEvents({ appId, artists, cityKey, targetCities }) {
  const cached = await getEventCache(cityKey, 1000 * 60 * 45)
  if (cached?.length) return cached

  const artistSlice = artists.slice(0, 8)
  const responses = await Promise.all(
    artistSlice.map((artist) => fetchBandsintownArtistEvents(artist, appId).catch(() => []))
  )
  const citySet = new Set(targetCities.map(normalizeText))
  const deduped = dedupeEventsById(responses.flat()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  const cityMatched = deduped.filter((event) => citySet.has(normalizeText(event.city)))
  const merged = (cityMatched.length > 0 ? cityMatched : deduped).slice(0, 20)

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

export default function ExploreTab({
  checkIns,
  profile,
  currentUserId = '',
  friends = [],
  followingIds = [],
  onToggleFollow,
  onOpenProfile,
  focusArtistName = '',
  onFocusArtistConsumed,
}) {
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
  const [expandedEventId, setExpandedEventId] = useState('')
  const [eventDetailsById, setEventDetailsById] = useState({})
  const [eventDetailsLoadingId, setEventDetailsLoadingId] = useState('')
  const [peopleDirectory, setPeopleDirectory] = useState([])
  const [wikiVisual, setWikiVisual] = useState({ imageUrl: '', pageUrl: '' })

  useEffect(() => {
    const name = String(focusArtistName || '').trim()
    if (!name) return
    setMode('artist')
    setQuery(name)
    setSelectedName(name)
    onFocusArtistConsumed?.()
  }, [focusArtistName, onFocusArtistConsumed])

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

  useEffect(() => {
    let mounted = true

    async function loadPeopleDirectory() {
      if (!(hasSupabaseConfig && supabase)) {
        if (mounted) setPeopleDirectory([])
        return
      }

      let query = supabase
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url, city')
        .limit(1000)

      if (currentUserId) {
        query = query.neq('id', currentUserId)
      }

      const { data, error } = await query

      if (!mounted) return
      if (error || !Array.isArray(data)) {
        setPeopleDirectory([])
        return
      }

      setPeopleDirectory(
        data.map((row) => ({
          id: row.id,
          username: row.username || '',
          displayName: row.display_name || row.username || 'Gebruiker',
          bio: row.bio || '',
          avatarUrl: row.avatar_url || '',
          city: row.city || '',
        }))
      )
    }

    loadPeopleDirectory()
    return () => {
      mounted = false
    }
  }, [currentUserId])

  const pool = mode === 'artist' ? artists : mode === 'venue' ? venues : []

  const normalizedQuery = normalizeText(query)
  const rankedPeople = useMemo(() => {
    const peopleQuery = normalizePeopleSearch(query)
    const source = (peopleDirectory.length > 0 ? [...peopleDirectory] : [...friends]).filter(
      (person) => person.id && person.id !== currentUserId
    )
    if (!peopleQuery) return source.slice(0, 30)
    return source
      .filter((friend) => {
        const displayName = normalizeText(friend.displayName || '')
        const username = normalizePeopleSearch(friend.username || '')
        return displayName.includes(peopleQuery) || username.includes(peopleQuery)
      })
      .slice(0, 30)
  }, [friends, peopleDirectory, query])
  const peopleSuggestions = useMemo(() => {
    const peopleQuery = normalizePeopleSearch(query)
    if (mode !== 'people' || !peopleQuery) return []

    return rankedPeople
      .slice(0, 8)
      .map((person) => ({
        id: person.id,
        display: person.displayName || person.username || 'Gebruiker',
        username: person.username || '',
      }))
  }, [mode, query, rankedPeople])

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
    if (!selectedName) {
      setWikiVisual({ imageUrl: '', pageUrl: '' })
      return
    }

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
          setWikiVisual({
            imageUrl: data.thumbnail?.source || '',
            pageUrl: data.content_urls?.desktop?.page || '',
          })
        }
      } catch {
        if (mounted) {
          setFallbackSummary(
            'Nog geen korte info gevonden. Voeg later een eigen beschrijving toe in je database.'
          )
          setWikiVisual({ imageUrl: '', pageUrl: '' })
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
  }, [selectedName])

  const displayedSummary =
    catalogEntry?.description ||
    fallbackSummary ||
    'Nog geen korte info gevonden. Voeg later een eigen beschrijving toe in je database.'

  const nearbyUpcoming = useMemo(() => {
    const cityKey = normalizeText(profile?.city || '')
    const targetCities = new Set(getTargetCities(cityKey || 'amsterdam', profile?.eventRadiusKm))
    const source = liveEvents.length > 0 ? liveEvents : UPCOMING_EVENTS
    return source
      .filter((event) => targetCities.has(normalizeText(event.city)))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5)
  }, [liveEvents, profile?.city, profile?.eventRadiusKm])

  const locationLabel = profile?.city?.trim() || 'jouw regio'

  useEffect(() => {
    let mounted = true
    const cityKey = normalizeText(profile?.city || '')
    const targetCities = getTargetCities(cityKey || 'amsterdam', profile?.eventRadiusKm)

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
  }, [artists, profile?.city, profile?.eventRadiusKm, profile?.favoriteArtists])

  useEffect(() => {
    if (!expandedEventId) return
    const source = liveEvents.length > 0 ? liveEvents : UPCOMING_EVENTS
    const event = source.find((item) => item.id === expandedEventId)
    if (!event || eventDetailsById[event.id]) return

    let mounted = true
    async function loadEventDetails() {
      try {
        setEventDetailsLoadingId(event.id)
        const response = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(event.name)}`
        )
        if (!response.ok) throw new Error('event-summary-unavailable')
        const data = await response.json()
        if (!mounted) return
        setEventDetailsById((prev) => ({
          ...prev,
          [event.id]: {
            description: data.extract || '',
            imageUrl: data.thumbnail?.source || '',
            moreInfoUrl: data.content_urls?.desktop?.page || '',
          },
        }))
      } catch {
        if (!mounted) return
        setEventDetailsById((prev) => ({
          ...prev,
          [event.id]: {
            description: '',
            imageUrl: '',
            moreInfoUrl: '',
          },
        }))
      } finally {
        if (mounted) setEventDetailsLoadingId('')
      }
    }

    loadEventDetails()
    return () => {
      mounted = false
    }
  }, [eventDetailsById, expandedEventId, liveEvents])

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">
        Ontdekken<span className="text-cyan-300">.</span>
      </h2>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-zinc-900/65 p-1 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => {
            setMode('artist')
            setSelectedName('')
          }}
          className={`min-h-14 rounded-xl px-2 py-2.5 text-center text-[13px] font-semibold leading-tight whitespace-normal ${
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
          className={`min-h-14 rounded-xl px-2 py-2.5 text-center text-[13px] font-semibold leading-tight whitespace-normal ${
            mode === 'venue'
              ? 'bg-gradient-to-r from-rose-500/30 via-fuchsia-500/30 to-sky-500/30 text-white'
              : 'text-zinc-300'
          }`}
        >
          Venues / festivals
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('people')
            setSelectedName('')
          }}
          className={`min-h-14 rounded-xl px-2 py-2.5 text-center text-[13px] font-semibold leading-tight whitespace-normal ${
            mode === 'people'
              ? 'bg-gradient-to-r from-rose-500/30 via-fuchsia-500/30 to-sky-500/30 text-white'
              : 'text-zinc-300'
          }`}
        >
          Gebruikers
        </button>
      </div>

      <label className="block text-sm text-zinc-300">
        Zoek {mode === 'artist' ? 'artiest' : mode === 'venue' ? 'venue/festival' : 'gebruiker'}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
          placeholder={
            mode === 'artist' ? 'Bijv. Fred again..' : mode === 'venue' ? 'Bijv. Lowlands' : 'Bijv. Noa of @noalive'
          }
        />
        {mode === 'people' && peopleSuggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {peopleSuggestions.map((person) => (
              <button
                key={`people-suggestion-${person.id}`}
                type="button"
                onClick={() => setQuery(person.username ? `@${person.username}` : person.display)}
                className="rounded-full border border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-sky-400/70 hover:text-sky-200"
              >
                {person.display}
                {person.username ? <span className="ml-1 text-zinc-500">@{person.username}</span> : null}
              </button>
            ))}
          </div>
        )}
      </label>

      {mode === 'people' ? (
        <article className="rounded-3xl border border-cyan-300/20 bg-zinc-900/65 p-4 shadow-lg shadow-cyan-500/10 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Gebruikers zoeken</h3>
            <p className="text-xs text-zinc-400">{rankedPeople.length} resultaten</p>
          </div>
          <div className="space-y-2">
            {rankedPeople.map((friend) => {
              const isFollowing = followingIds.includes(friend.id)
              return (
                <div
                  key={`explore-user-${friend.id}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProfile?.(friend.id, friend)}
                    className="text-left"
                  >
                    <p className="text-sm font-semibold text-white">{friend.displayName}</p>
                    <p className="text-xs text-zinc-400">@{friend.username}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFollow?.(friend.id, friend)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                      isFollowing
                        ? 'border-white/20 text-zinc-300 hover:border-white/35'
                        : 'border-cyan-300/40 text-cyan-200 hover:border-cyan-300/60'
                    }`}
                  >
                    {isFollowing ? 'Volgend' : 'Volgen'}
                  </button>
                </div>
              )
            })}
            {rankedPeople.length === 0 && (
              <p className="text-xs text-zinc-500">Geen gebruikers gevonden voor deze zoekterm.</p>
            )}
          </div>
        </article>
      ) : (
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
      )}

      {mode !== 'people' && !selectedName && rankedItems.length > 0 && (
        <p className="text-center text-[11px] text-zinc-600">Tik op een naam om de detailpagina te openen.</p>
      )}

      {mode !== 'people' && (
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
              <button
                type="button"
                onClick={() => setExpandedEventId((prev) => (prev === event.id ? '' : event.id))}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{event.name}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {new Date(event.date).toLocaleDateString('nl-NL', {
                      day: 'numeric',
                      month: 'long',
                    })}{' '}
                    · {event.city} · {event.type}
                  </p>
                </div>
                <span className="mt-0.5 text-xs text-cyan-300">{expandedEventId === event.id ? 'Sluit' : 'Info'}</span>
              </button>

              {expandedEventId === event.id && (
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs text-zinc-300">
                  {eventDetailsById[event.id]?.imageUrl && (
                    <img
                      src={eventDetailsById[event.id].imageUrl}
                      alt={event.name}
                      className="aspect-square w-full rounded-xl object-cover"
                      loading="lazy"
                    />
                  )}
                  <p>
                    <span className="text-zinc-500">Artiest:</span> {event.artist || 'TBA'}
                  </p>
                  <p>
                    <span className="text-zinc-500">Venue:</span> {event.venue || 'Nog niet bekend'}
                  </p>
                  <p>
                    <span className="text-zinc-500">Land:</span> {event.country || 'Onbekend'}
                  </p>
                  <p>
                    <span className="text-zinc-500">Bron:</span> {event.source || 'fallback'}
                  </p>
                  {eventDetailsLoadingId === event.id && (
                    <p className="text-zinc-500">Extra event-info laden...</p>
                  )}
                  {eventDetailsById[event.id]?.description && (
                    <p>{eventDetailsById[event.id].description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(() => {
                      const { primary, google, hasPrimary } = getTicketLinks(event)
                      return (
                        <>
                          {hasPrimary && (
                            <a
                              href={primary}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex rounded-full border border-cyan-300/40 bg-cyan-500/15 px-3 py-1 font-medium text-cyan-200 hover:border-cyan-200/70"
                            >
                              Tickets (aanbieder)
                            </a>
                          )}
                          <a
                            href={google}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium text-zinc-200 hover:border-white/35"
                          >
                            {hasPrimary ? 'Tickets (Google)' : 'Zoek tickets'}
                          </a>
                        </>
                      )
                    })()}
                    {event.artist &&
                      event.artist !== 'Meerdere artiesten' &&
                      event.artist !== 'Verschillende acts' &&
                      event.artist !== 'Rotterdam Rave line-up' && (
                        <a
                          href={getSpotifyArtistUrl(
                            event.artist,
                            artists.find(
                              (a) => normalizeText(getName(a)) === normalizeText(event.artist || '')
                            ) || null
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-medium text-emerald-100 hover:border-emerald-300/60"
                        >
                          Spotify: {event.artist}
                        </a>
                      )}
                    {eventDetailsById[event.id]?.moreInfoUrl && (
                      <a
                        href={eventDetailsById[event.id].moreInfoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium text-zinc-200 hover:border-white/35"
                      >
                        Meer info
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {nearbyUpcoming.length === 0 && (
            <p className="text-xs text-zinc-500">
              Nog geen events gevonden voor deze regio. Voeg je stad toe in je profiel voor betere suggesties.
            </p>
          )}
        </div>
      </article>
      )}

      {mode !== 'people' && selectedName && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="explore-detail-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedName('')
          }}
        >
          <article className="relative flex max-h-[90svh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/15 bg-zinc-900/95 shadow-2xl shadow-fuchsia-500/20">
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {mode === 'artist' ? 'Artiest' : 'Venue / festival'}
                </p>
                <h2 id="explore-detail-title" className="truncate text-xl font-semibold text-white">
                  {selectedName}
                </h2>
                {catalogEntry?.source && (
                  <p className="mt-0.5 text-[10px] text-zinc-500">Dataset: {catalogEntry.source}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedName('')}
                className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-300 hover:border-white/30"
              >
                Sluiten
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {wikiVisual.imageUrl && (
                <div className="flex justify-center overflow-hidden rounded-xl bg-zinc-950/80 ring-1 ring-white/10">
                  <img
                    src={wikiVisual.imageUrl}
                    alt=""
                    className="mx-auto max-h-[min(42svh,320px)] w-full object-contain object-center"
                    loading="lazy"
                  />
                </div>
              )}
              <p className="text-xs text-zinc-400">
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
              <div className="flex flex-wrap gap-2">
                {mode === 'artist' && (
                  <a
                    href={getSpotifyArtistUrl(selectedName, catalogEntry)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/45 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:border-emerald-400/70"
                  >
                    Spotify
                  </a>
                )}
                {wikiVisual.pageUrl && (
                  <a
                    href={wikiVisual.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-white/35"
                  >
                    Wikipedia
                  </a>
                )}
                {mode === 'venue' && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedName)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-white/35"
                  >
                    Google Maps
                  </a>
                )}
              </div>
              <p className="text-sm leading-relaxed text-zinc-300">
                {summaryLoading ? 'Info laden…' : displayedSummary}
              </p>
              <p className="text-[10px] leading-relaxed text-zinc-600">
                Wikipedia zoekt op titel—soms is het artikel niet exact over deze act. Spotify gebruikt een ID uit
                onze catalogus als die er is; anders opent de Spotify-zoekpagina voor deze naam.
              </p>
            </div>
          </article>
        </div>
      )}
    </section>
  )
}
