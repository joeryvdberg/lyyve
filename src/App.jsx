import { useEffect, useMemo, useState } from 'react'
import BottomNav from './components/layout/BottomNav'
import CheckInTab from './features/checkin/CheckInTab'
import ExploreTab from './features/explore/ExploreTab'
import FeedTab from './features/feed/FeedTab'
import ProfileTab from './features/profile/ProfileTab'
import StatsTab from './features/stats/StatsTab'
import { getAllCheckIns, getProfile, saveCatalogEntry, saveCheckIn, saveProfile } from './lib/db'

const ASSET_BASE = import.meta.env.BASE_URL

const seededCheckIns = [
  {
    id: 'seed-1',
    artist: 'BICEP',
    venue: 'Lowlands 2026',
    note: 'Mooie opbouw en super strakke liveset.',
    rating: 8.8,
    createdAt: new Date('2026-08-21T22:10:00Z').toISOString(),
  },
  {
    id: 'seed-2',
    artist: 'The Blaze',
    venue: 'Pukkelpop 2026',
    note: 'Visueel heel sterk, bass mocht wat harder.',
    rating: 7.9,
    createdAt: new Date('2026-08-16T20:45:00Z').toISOString(),
  },
]

const friendProfiles = [
  {
    id: 'friend-noa',
    username: 'noalive',
    displayName: 'Noa',
    bio: 'Altijd vooraan bij elektronische live-shows.',
    avatarUrl: '',
    city: 'Utrecht',
    checkIns: [
      {
        id: 'friend-noa-1',
        artist: 'Fred again..',
        venue: 'Lowlands 2026',
        rating: 8.9,
        note: 'Bizar goeie energie. Hele tent ging los.',
        createdAt: '2026-08-20T19:10:00Z',
      },
      {
        id: 'friend-noa-2',
        artist: 'BICEP',
        venue: 'Awakenings Festival',
        rating: 9.1,
        note: 'Visueel en sonisch echt top.',
        createdAt: '2026-07-13T21:35:00Z',
      },
    ],
  },
  {
    id: 'friend-jesse',
    username: 'jessebeats',
    displayName: 'Jesse',
    bio: 'Melodic techno en indie electronica.',
    avatarUrl: '',
    city: 'Amsterdam',
    checkIns: [
      {
        id: 'friend-jesse-1',
        artist: 'The Blaze',
        venue: 'Pukkelpop 2026',
        rating: 8.2,
        note: 'Visueel heel sterk, sound iets te zacht.',
        createdAt: '2026-08-16T20:45:00Z',
      },
      {
        id: 'friend-jesse-2',
        artist: 'Maribou State',
        venue: 'Paradiso',
        rating: 8.7,
        note: 'Mooie opbouw en fijne sfeer in de zaal.',
        createdAt: '2026-06-09T22:05:00Z',
      },
    ],
  },
]

const defaultProfile = {
  id: 'me',
  username: 'joerylive',
  displayName: 'Joery van den Berg',
  bio: 'House, techno en indie. Altijd op zoek naar de beste liveset.',
  avatarUrl: '',
  favoriteGenres: 'House, Techno, Indie Dance',
  favoriteArtists: 'BICEP, Fred again.., The Blaze',
  city: 'Amsterdam',
}

function avatarInitials(displayName = '') {
  const parts = displayName
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return 'LY'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function App() {
  const [activeTab, setActiveTab] = useState('feed')
  const [myCheckIns, setMyCheckIns] = useState(seededCheckIns)
  const [profile, setProfile] = useState(defaultProfile)

  useEffect(() => {
    let mounted = true

    async function loadCheckIns() {
      const items = await getAllCheckIns()
      if (!mounted) return

      if (items.length === 0) {
        setMyCheckIns(seededCheckIns)
        await Promise.all(seededCheckIns.map((item) => saveCheckIn(item)))
      } else {
        setMyCheckIns(items)
      }
    }

    loadCheckIns()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      const storedProfile = await getProfile()
      if (!mounted) return

      if (storedProfile) {
        setProfile({ ...defaultProfile, ...storedProfile })
      } else {
        setProfile(defaultProfile)
        await saveProfile(defaultProfile)
      }
    }

    loadProfile()
    return () => {
      mounted = false
    }
  }, [])

  const handleAddCheckIn = async (checkIn) => {
    const newCheckIn = {
      ...checkIn,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }

    setMyCheckIns((prev) => [newCheckIn, ...prev])
    await saveCheckIn(newCheckIn)
    await Promise.all([
      saveCatalogEntry('artist', newCheckIn.artist),
      saveCatalogEntry('place', newCheckIn.venue),
    ])
  }

  const handleSaveProfile = async (nextProfile) => {
    const mergedProfile = { ...defaultProfile, ...nextProfile, id: 'me' }
    setProfile(mergedProfile)
    await saveProfile(mergedProfile)
  }

  const activeView = useMemo(() => {
    if (activeTab === 'checkin') {
      return <CheckInTab onAddCheckIn={handleAddCheckIn} />
    }

    if (activeTab === 'stats') {
      return <StatsTab checkIns={myCheckIns} />
    }

    if (activeTab === 'explore') {
      return <ExploreTab checkIns={myCheckIns} />
    }

    if (activeTab === 'profile') {
      return (
        <ProfileTab
          key={`profile-${profile.id}-${profile.updatedAt ?? 'init'}`}
          profile={profile}
          onSaveProfile={handleSaveProfile}
          friends={friendProfiles}
          checkIns={myCheckIns}
        />
      )
    }

    return <FeedTab checkIns={myCheckIns} profile={profile} />
  }, [activeTab, myCheckIns, profile])

  const profileInitials = avatarInitials(profile.displayName)

  return (
    <div className="min-h-svh bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_top,#fb718544,transparent_38%),radial-gradient(circle_at_75%_20%,#8b5cf655,transparent_42%),radial-gradient(circle_at_20%_80%,#22d3ee33,transparent_38%)]" />
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.02),transparent_30%,rgba(255,255,255,0.03),transparent_70%)]" />
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-6">
        <header className="-mb-3 flex items-start justify-between">
          <div className="h-11 w-11" />
          <img
            src={`${ASSET_BASE}lyyve-logo.png`}
            alt="Lyyve logo"
            className="mx-auto h-auto w-44 drop-shadow-[0_0_28px_rgba(56,189,248,0.35)]"
          />
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`grid h-11 w-11 place-items-center overflow-hidden rounded-full border bg-zinc-900/70 text-xs font-semibold backdrop-blur ${
              activeTab === 'profile'
                ? 'border-sky-300/60 shadow-lg shadow-sky-500/20'
                : 'border-white/15 hover:border-white/30'
            }`}
            aria-label="Open profiel"
          >
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Jouw profiel" className="h-full w-full object-cover" />
            ) : (
              <span>{profileInitials}</span>
            )}
          </button>
        </header>
        {activeView}
      </main>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  )
}

export default App
