import Dexie from 'dexie'

const db = new Dexie('lyyve')

db.version(1).stores({
  checkIns: 'id, createdAt, artist, venue, rating',
})
db.version(2).stores({
  checkIns: 'id, createdAt, artist, venue, rating',
  profiles: 'id, updatedAt',
})
db.version(3).stores({
  checkIns: 'id, createdAt, artist, venue, rating',
  profiles: 'id, updatedAt',
  catalogEntries: 'id, kind, name, updatedAt',
})
db.version(4).stores({
  checkIns: 'id, createdAt, artist, venue, rating',
  profiles: 'id, updatedAt',
  catalogEntries: 'id, kind, name, updatedAt',
  events: 'id, cityKey, updatedAt',
  feedInteractions: 'id, updatedAt',
  badges: 'id, unlockedAt, updatedAt',
})

export async function getAllCheckIns() {
  return db.checkIns.orderBy('createdAt').reverse().toArray()
}

export async function saveCheckIn(checkIn) {
  await db.checkIns.put(checkIn)
}

export async function deleteCheckIn(checkInId) {
  await db.checkIns.delete(checkInId)
}

export async function getProfile() {
  return db.profiles.get('me')
}

export async function saveProfile(profile) {
  await db.profiles.put({
    ...profile,
    id: 'me',
    updatedAt: new Date().toISOString(),
  })
}

function catalogId(kind, name) {
  return `${kind}:${name.trim().toLowerCase()}`
}

export async function saveCatalogEntry(kind, name) {
  const trimmedName = name.trim()
  if (!trimmedName) return

  const id = catalogId(kind, trimmedName)
  const existing = await db.catalogEntries.get(id)
  const now = new Date().toISOString()

  await db.catalogEntries.put({
    id,
    kind,
    name: trimmedName,
    source: 'Community',
    popularity: Math.min(100, Number(existing?.popularity ?? 5) + 8),
    usageCount: Number(existing?.usageCount ?? 0) + 1,
    updatedAt: now,
    createdAt: existing?.createdAt ?? now,
    description:
      existing?.description ??
      `${trimmedName} is toegevoegd door de community en kan door anderen worden ingecheckt.`,
  })
}

export async function getCatalogEntries(kind) {
  return db.catalogEntries.where('kind').equals(kind).toArray()
}

export async function getFeedInteractions() {
  const rows = await db.feedInteractions.toArray()
  return Object.fromEntries(rows.map((row) => [row.id, row]))
}

export async function saveFeedInteraction(itemId, interaction) {
  await db.feedInteractions.put({
    ...interaction,
    id: itemId,
    updatedAt: new Date().toISOString(),
  })
}

export async function getEventCache(cityKey, maxAgeMs = 1000 * 60 * 45) {
  const row = await db.events.get(`city:${cityKey}`)
  if (!row) return null
  if (Date.now() - new Date(row.updatedAt).getTime() > maxAgeMs) return null
  return Array.isArray(row.events) ? row.events : null
}

export async function saveEventCache(cityKey, events, source = 'bandsintown') {
  await db.events.put({
    id: `city:${cityKey}`,
    cityKey,
    source,
    events,
    updatedAt: new Date().toISOString(),
  })
}

export async function getBadges() {
  return db.badges.toArray()
}

export async function saveBadges(badges = []) {
  if (!badges.length) return
  await db.badges.bulkPut(badges.map((badge) => ({ ...badge, updatedAt: new Date().toISOString() })))
}

