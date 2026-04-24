const FESTIVAL_KEYWORDS = [
  'festival',
  'lowlands',
  'coachella',
  'tomorrowland',
  'pukkelpop',
  'pinkpop',
  'awakenings',
  'mysteryland',
  'lollapalooza',
]

const VENUE_COUNTRY_HINTS = [
  { keywords: ['amsterdam', 'rotterdam', 'utrecht', 'lowlands', 'pinkpop', 'awakenings'], country: 'NL' },
  { keywords: ['coachella', 'new york', 'los angeles', 'chicago'], country: 'US' },
  { keywords: ['pukkelpop', 'brussel', 'antwerp'], country: 'BE' },
  { keywords: ['berlin', 'hamburg', 'munich'], country: 'DE' },
  { keywords: ['london', 'manchester', 'glastonbury'], country: 'UK' },
]

export const BADGE_DEFINITIONS = [
  { id: 'festival-veteran', name: 'Festival Veteran', description: 'Bezoek 5 verschillende festivals.', threshold: 5 },
  { id: 'globe-trotter', name: 'Globe Trotter', description: 'Check in binnen 3 landen.', threshold: 3 },
  { id: 'front-row', name: 'Front Row', description: 'Zie dezelfde artiest 3x live.', threshold: 3 },
  { id: 'early-adopter', name: 'Early Adopter', description: 'Je bent er vroeg bij op Lyyve.', threshold: 1 },
]

function normalize(value = '') {
  return String(value).trim().toLowerCase()
}

function inferCountryFromCheckIn(checkIn) {
  if (checkIn.country) return normalize(checkIn.country).toUpperCase()
  const haystack = `${checkIn.venue || ''} ${checkIn.city || ''}`.toLowerCase()
  for (const hint of VENUE_COUNTRY_HINTS) {
    if (hint.keywords.some((keyword) => haystack.includes(keyword))) return hint.country
  }
  return ''
}

export function evaluateBadges(checkIns = [], existingBadges = []) {
  const existingMap = new Map(existingBadges.map((badge) => [badge.id, badge]))
  const now = new Date().toISOString()
  const firstCheckInAt = checkIns
    .map((item) => item.createdAt)
    .filter(Boolean)
    .sort()[0]

  const uniqueFestivalCount = new Set(
    checkIns
      .filter((item) => FESTIVAL_KEYWORDS.some((keyword) => normalize(item.venue).includes(keyword)))
      .map((item) => normalize(item.venue))
  ).size

  const artistCounter = new Map()
  for (const item of checkIns) {
    const key = normalize(item.artist)
    artistCounter.set(key, (artistCounter.get(key) ?? 0) + 1)
  }
  const highestArtistCount = [...artistCounter.values()].reduce((max, count) => Math.max(max, count), 0)

  const countryCount = new Set(checkIns.map(inferCountryFromCheckIn).filter(Boolean)).size
  const isEarlyAdopter = Boolean(firstCheckInAt && new Date(firstCheckInAt).getTime() < new Date('2027-01-01').getTime())

  const progressById = {
    'festival-veteran': uniqueFestivalCount,
    'globe-trotter': countryCount,
    'front-row': highestArtistCount,
    'early-adopter': isEarlyAdopter ? 1 : 0,
  }

  return BADGE_DEFINITIONS.map((definition) => {
    const progress = progressById[definition.id] ?? 0
    const unlocked = progress >= definition.threshold
    const existing = existingMap.get(definition.id)
    return {
      ...definition,
      progress,
      unlocked,
      unlockedAt: unlocked ? existing?.unlockedAt ?? now : existing?.unlockedAt ?? '',
      updatedAt: now,
    }
  })
}
