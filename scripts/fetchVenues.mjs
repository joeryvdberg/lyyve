import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'LyyveVenueSync/2.0 (local-dev)'

const FESTIVAL_QUERY = `
SELECT DISTINCT ?itemLabel ?itemDescription ?countryLabel ?sitelinks WHERE {
  ?item wdt:P31 wd:Q868557.
  ?item wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks >= 6)
  OPTIONAL { ?item wdt:P17 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT 2000
`

const VENUE_QUERY = `
SELECT DISTINCT ?itemLabel ?itemDescription ?countryLabel ?sitelinks WHERE {
  VALUES ?class {
    wd:Q208500
    wd:Q871905
    wd:Q622425
  }
  ?item wdt:P31 ?class.
  ?item wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks >= 6)
  OPTIONAL { ?item wdt:P17 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT 2000
`

const CURATED_PLACES = [
  ['Lowlands', 'festival', 'Nederlands muziekfestival in Biddinghuizen.'],
  ['Down The Rabbit Hole', 'festival', 'Nederlands festival in Beuningen met indie, pop en electronic.'],
  ['Awakenings Festival', 'festival', 'Iconisch Nederlands technofestival.'],
  ['Mysteryland', 'festival', 'Een van de bekendste dance festivals van Nederland.'],
  ['Amsterdam Dance Event', 'festival', 'Groot internationaal dancefestival en conferentie in Amsterdam.'],
  ['Pukkelpop', 'festival', 'Bekend Belgisch festival met brede line-up.'],
  ['Pinkpop', 'festival', 'Langlopend Nederlands pop- en rockfestival.'],
  ['Best Kept Secret', 'festival', 'Nederlands alternatief muziekfestival in Hilvarenbeek.'],
  ['Zwarte Cross', 'festival', 'Nederlands festival met muziek, motorsport en cultuur.'],
  ['Defqon.1', 'festival', 'Internationaal bekend hard dance festival in Nederland.'],
  ['Tomorrowland', 'festival', 'Wereldberoemd elektronisch muziekfestival in België.'],
  ['Glastonbury Festival', 'festival', 'Iconisch festival in het Verenigd Koninkrijk.'],
  ['Coachella', 'festival', 'Internationaal toonaangevend muziekfestival in Californië.'],
  ['Lollapalooza', 'festival', 'Groot internationaal festivalmerk met edities wereldwijd.'],
  ['Lollapalooza Berlin', 'festival', 'Europese editie van Lollapalooza in Berlijn.'],
  ['Ultra Music Festival', 'festival', 'Groot elektronisch festival in Miami en wereldwijd.'],
  ['Sziget Festival', 'festival', 'Meerdaags festival in Boedapest.'],
  ['Paradiso', 'venue', 'Bekende popzaal in Amsterdam.'],
  ['Melkweg', 'venue', 'Multidisciplinaire popzaal in Amsterdam.'],
  ['AFAS Live', 'venue', 'Grote concerthal in Amsterdam-Zuidoost.'],
  ['Ziggo Dome', 'venue', 'Grote indoor concerthal in Amsterdam.'],
  ['TivoliVredenburg', 'venue', 'Grote muziekvenue in Utrecht.'],
  ['013', 'venue', 'Bekende concertzaal in Tilburg.'],
  ['Doornroosje', 'venue', 'Pop- en dancevenue in Nijmegen.'],
  ['Maassilo', 'venue', 'Rotterdamse locatie voor elektronische events.'],
  ['Ancienne Belgique', 'venue', 'Bekende concertzaal in Brussel.'],
  ['Sportpaleis', 'venue', 'Grote evenementenhal in Antwerpen.'],
]

function computePopularity(sitelinks) {
  if (!Number.isFinite(sitelinks)) return 0
  return Math.max(0, Math.min(100, Math.round((Math.log10(sitelinks + 1) / 2) * 100)))
}

function isCuratedName(rawName) {
  const name = rawName.trim()
  if (!name) return false
  if (/^\[.*\]$/.test(name)) return false
  if (/^\(.*\)$/.test(name)) return false
  if (name.length < 2 || name.length > 80) return false
  return true
}

async function fetchNames(sparql, type) {
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(sparql)}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
    },
  })

  if (!response.ok) {
    throw new Error(`Wikidata request failed (${response.status})`)
  }

  const payload = await response.json()
  return (payload.results?.bindings ?? [])
    .map((binding) => {
      const name = binding.itemLabel?.value?.trim()
      if (!name || !isCuratedName(name)) return null
      const wikidataDescription = binding.itemDescription?.value?.trim()
      const country = binding.countryLabel?.value?.trim()
      const sitelinks = Number(binding.sitelinks?.value ?? 0)
      return {
        name,
        description:
          wikidataDescription ??
          `${name} is opgenomen in de Lyyve catalogus${country ? ` in ${country}` : ''}.`,
        source: 'Wikidata',
        type,
        popularity: computePopularity(sitelinks),
        sitelinks,
      }
    })
    .filter((value) => Boolean(value))
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(sparql, type) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetchNames(sparql, type)
    } catch (error) {
      if (attempt === 3) throw error
      await delay(1200 * attempt)
    }
  }
  return []
}

async function main() {
  const [festivalPlaces, venuePlaces] = await Promise.all([
    fetchWithRetry(FESTIVAL_QUERY, 'festival'),
    fetchWithRetry(VENUE_QUERY, 'venue'),
  ])
  const scrapedPlaces = [...festivalPlaces, ...venuePlaces]
  const curatedPlaces = CURATED_PLACES.map(([name, type, description]) => ({
    name,
    description,
    source: 'Lyyve curated',
    type,
    popularity: 100,
    sitelinks: 0,
  }))

  const allPlaces = [...curatedPlaces, ...scrapedPlaces].filter((place) => place.name.length > 2)
  const placeMap = new Map()
  for (const place of allPlaces) {
    const key = place.name.toLowerCase()
    const existing = placeMap.get(key)
    if (!existing || Number(place.popularity ?? 0) > Number(existing.popularity ?? 0)) {
      placeMap.set(key, place)
    }
  }
  const uniqueSorted = [...placeMap.values()].sort(
    (a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name)
  )

  const festivalCount = uniqueSorted.filter((item) => item.type === 'festival').length
  const venueCount = uniqueSorted.filter((item) => item.type !== 'festival').length

  const dataset = {
    source: 'Wikidata + Lyyve curated venues/festivals',
    scrapedAt: new Date().toISOString(),
    count: uniqueSorted.length,
    festivals: festivalCount,
    venues: venueCount,
    ranking: 'curated boost + popularity based on wikipedia sitelinks',
    places: uniqueSorted,
  }

  const outputPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../public/venues.json'
  )

  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  console.log(`Saved ${dataset.count} venues/festivals to ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
