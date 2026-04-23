import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'LyyveArtistSync/2.0 (local-dev)'
const ARTIST_QUERY = `
SELECT DISTINCT ?itemLabel ?itemDescription ?sitelinks WHERE {
  {
    ?item wdt:P31/wdt:P279* wd:Q215380.
  }
  UNION
  {
    ?item wdt:P31 wd:Q5;
          wdt:P106 ?occupation.
    VALUES ?occupation {
      wd:Q177220
      wd:Q639669
      wd:Q753110
      wd:Q10800557
      wd:Q2526255
      wd:Q66715801
    }
  }
  UNION
  {
    ?item wdt:P31 wd:Q5;
          wdt:P27 wd:Q55;
          wdt:P106 ?occupation.
    VALUES ?occupation {
      wd:Q177220
      wd:Q639669
      wd:Q753110
      wd:Q10800557
      wd:Q2526255
      wd:Q66715801
    }
  }
  ?item wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks >= 8)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT 6000
`

function isCuratedName(rawName) {
  const name = rawName.trim()
  if (!name) return false
  if (/^\[.*\]$/.test(name)) return false
  if (/^\(.*\)$/.test(name)) return false
  if (/[<>[\]{}]/.test(name)) return false
  if (/^(unknown|no artist|various artists|anonymous)$/i.test(name)) return false
  if (name.length < 2 || name.length > 70) return false
  return true
}

function computePopularity(sitelinks) {
  if (!Number.isFinite(sitelinks)) return 0
  const bounded = Math.max(0, Math.min(100, Math.round((Math.log10(sitelinks + 1) / 2) * 100)))
  return bounded
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchArtists() {
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(ARTIST_QUERY)}`
  let response = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/sparql-results+json',
      },
    })
    if (response.ok) break
    if (response.status < 500 || attempt === 3) {
      throw new Error(`Wikidata request failed (${response.status})`)
    }
    await delay(1200 * attempt)
  }

  const payload = await response.json()
  return (payload.results?.bindings ?? [])
    .map((binding) => {
      const name = binding.itemLabel?.value?.trim() ?? ''
      if (!isCuratedName(name)) return null
      const sitelinks = Number(binding.sitelinks?.value ?? 0)
      const description = binding.itemDescription?.value?.trim()
      return {
        name,
        description: description || `${name} is opgenomen in de Lyyve artiestencatalogus.`,
        source: 'Wikidata',
        popularity: computePopularity(sitelinks),
        sitelinks,
      }
    })
    .filter((item) => Boolean(item))
}

async function main() {
  const allArtists = await fetchArtists()

  const artistMap = new Map()
  for (const artist of allArtists) {
    const key = artist.name.toLowerCase()
    if (!artistMap.has(key)) {
      artistMap.set(key, artist)
    }
  }
  const uniqueSortedArtists = [...artistMap.values()].sort(
    (a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name)
  )

  const dataset = {
    source: 'Wikidata curated artist catalog',
    scrapedAt: new Date().toISOString(),
    count: uniqueSortedArtists.length,
    ranking: 'popularity based on wikipedia sitelinks',
    artists: uniqueSortedArtists,
  }

  const outputPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../public/artists.json'
  )

  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  console.log(`Saved ${dataset.count} artists to ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
