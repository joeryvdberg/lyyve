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

export async function getAllCheckIns() {
  return db.checkIns.orderBy('createdAt').reverse().toArray()
}

export async function saveCheckIn(checkIn) {
  await db.checkIns.put(checkIn)
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

