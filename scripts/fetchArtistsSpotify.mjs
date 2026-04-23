import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'
const SPOTIFY_SEARCH_ENDPOINT = 'https://api.spotify.com/v1/search'
const OUTPUT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/artists.json')

const SEARCH_TERMS = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  'nederland',
  'belgium',
  'netherlands',
  'house',
  'techno',
  'electronic',
  'dance',
  'indie',
  'hip hop',
  'de jeugd van tegenwoordig',
  'maribou state',
  'froukje',
  'goldband',
  'flemming',
  'kris kross amsterdam',
  'snelle',
]

function computePopularity(spotifyPopularity) {
  if (!Number.isFinite(spotifyPopularity)) return 0
  return Math.max(0, Math.min(100, Math.round(spotifyPopularity)))
}

function normalizeName(name) {
  return name.trim().toLowerCase()
}

async function getSpotifyToken(clientId, clientSecret) {
  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`Spotify auth failed (${response.status})`)
  }

  const payload = await response.json()
  return payload.access_token
}

async function searchArtists(token, query, offset = 0) {
  const url = new URL(SPOTIFY_SEARCH_ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('type', 'artist')
  url.searchParams.set('offset', String(offset))

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Spotify search failed (${response.status}) for query "${query}": ${details}`)
  }

  const payload = await response.json()
  return payload.artists?.items ?? []
}

async function main() {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.log(
      'Skipping Spotify enrichment: set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables.'
    )
    process.exit(0)
  }

  const token = await getSpotifyToken(clientId, clientSecret)

  const rawFile = await readFile(OUTPUT_PATH, 'utf8')
  const existingDataset = JSON.parse(rawFile)
  const existingArtists = Array.isArray(existingDataset.artists) ? existingDataset.artists : []

  const byName = new Map()
  for (const artist of existingArtists) {
    const name = typeof artist === 'string' ? artist : artist?.name
    if (!name) continue
    byName.set(normalizeName(name), artist)
  }

  let addedCount = 0
  for (const term of SEARCH_TERMS) {
    for (const offset of [0, 20, 40, 60, 80]) {
      let results = []
      try {
        results = await searchArtists(token, term, offset)
      } catch (error) {
        console.warn(String(error))
        continue
      }
      for (const artist of results) {
        const key = normalizeName(artist.name)
        const mapped = {
          name: artist.name,
          description:
            artist.genres?.length > 0
              ? `${artist.name} is een artiest bekend van ${artist.genres.slice(0, 3).join(', ')}.`
              : `${artist.name} is opgenomen in de Spotify-catalogus.`,
          source: 'Spotify',
          popularity: computePopularity(artist.popularity),
          spotifyId: artist.id,
        }

        const existing = byName.get(key)
        if (!existing) {
          byName.set(key, mapped)
          addedCount += 1
          continue
        }

        const existingPopularity =
          typeof existing === 'string' ? 0 : Number(existing.popularity ?? 0)
        if (mapped.popularity > existingPopularity) {
          byName.set(key, { ...existing, ...mapped, source: 'Wikidata+Spotify' })
        }
      }
    }
  }

  const mergedArtists = [...byName.values()]
    .map((artist) =>
      typeof artist === 'string'
        ? { name: artist, description: `${artist} is opgenomen in de Lyyve-catalogus.`, source: 'Legacy' }
        : artist
    )
    .sort((a, b) => Number(b.popularity ?? 0) - Number(a.popularity ?? 0) || a.name.localeCompare(b.name))

  const dataset = {
    ...existingDataset,
    source: `${existingDataset.source} + Spotify`,
    scrapedAt: new Date().toISOString(),
    count: mergedArtists.length,
    ranking: 'match score + curated mainstream boost + wikidata/spotify popularity',
    artists: mergedArtists,
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  console.log(`Spotify enrichment complete: +${addedCount} new artists, total ${dataset.count}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

