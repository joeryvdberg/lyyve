import { useCallback, useEffect, useMemo, useState } from 'react'
import BottomNav from './components/layout/BottomNav'
import AuthScreen from './features/auth/AuthScreen'
import CheckInTab from './features/checkin/CheckInTab'
import ExploreTab from './features/explore/ExploreTab'
import FeedTab from './features/feed/FeedTab'
import ProfileTab from './features/profile/ProfileTab'
import StatsTab from './features/stats/StatsTab'
import { evaluateBadges } from './lib/badges'
import {
  deleteCheckIn,
  getAllCheckIns,
  getBadges,
  getProfile,
  saveBadges,
  saveCatalogEntry,
  saveCheckIn,
  saveProfile,
} from './lib/db'
import { hasSupabaseConfig, supabase } from './lib/supabase'

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
        photoDataUrl:
          'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1600&q=70',
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
        photoDataUrl:
          'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=70',
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
  const [focusedFriendId, setFocusedFriendId] = useState('')
  const [myCheckIns, setMyCheckIns] = useState(seededCheckIns)
  const [socialFeedItems, setSocialFeedItems] = useState([])
  const [socialFriends, setSocialFriends] = useState(friendProfiles)
  const [followingIds, setFollowingIds] = useState([])
  const [followerIds, setFollowerIds] = useState([])
  const [profile, setProfile] = useState(defaultProfile)
  const [badges, setBadges] = useState([])
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(hasSupabaseConfig)
  const [checkInsLoaded, setCheckInsLoaded] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [splashMinElapsed, setSplashMinElapsed] = useState(false)
  const [splashHiding, setSplashHiding] = useState(false)
  const [splashGone, setSplashGone] = useState(false)

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) return

    let mounted = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setSession(data.session ?? null)
      })
      .catch(() => {
        if (!mounted) return
        setSession(null)
      })
      .finally(() => {
        if (!mounted) return
        setAuthLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadCheckIns() {
      if (hasSupabaseConfig && supabase && session?.user?.id) {
        const { data } = await supabase
          .from('check_ins')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
        if (!mounted) return
        setMyCheckIns(
          (data ?? []).map((item) => ({
            id: item.id,
            artist: item.artist,
            venue: item.venue,
            note: item.note ?? '',
            rating: Number(item.rating ?? 0),
            createdAt: item.created_at ?? '',
            photoDataUrl: item.photo_url ?? '',
            city: item.city ?? '',
            country: item.country ?? '',
          }))
        )
        if (mounted) setCheckInsLoaded(true)
        return
      }
      if (hasSupabaseConfig) {
        // In auth mode without an active session we keep user data empty.
        if (!mounted) return
        setMyCheckIns([])
        setCheckInsLoaded(true)
        return
      }

      const items = await getAllCheckIns()
      if (!mounted) return

      if (items.length === 0) {
        setMyCheckIns(seededCheckIns)
        await Promise.all(seededCheckIns.map((item) => saveCheckIn(item)))
      } else {
        setMyCheckIns(items)
      }
      if (mounted) setCheckInsLoaded(true)
    }

    loadCheckIns()
    return () => {
      mounted = false
    }
  }, [session?.user?.email, session?.user?.id])

  useEffect(() => {
    let mounted = true

    async function loadFollowing() {
      if (hasSupabaseConfig && supabase && session?.user?.id) {
        const [{ data: followingRows, error: followingError }, { data: followerRows, error: followerError }] =
          await Promise.all([
            supabase.from('follows').select('following_id').eq('follower_id', session.user.id),
            supabase.from('follows').select('follower_id').eq('following_id', session.user.id),
          ])

        if (!mounted) return
        if (followingError || followerError) {
          setFollowingIds([])
          setFollowerIds([])
          return
        }
        setFollowingIds((followingRows ?? []).map((row) => row.following_id).filter(Boolean))
        setFollowerIds((followerRows ?? []).map((row) => row.follower_id).filter(Boolean))
        return
      }

      const stored =
        typeof window !== 'undefined' ? window.localStorage.getItem('lyyve-following-ids') : null
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed)) {
            setFollowingIds(parsed)
            return
          }
        } catch {
          // Ignore malformed local data and use defaults.
        }
      }
      setFollowingIds(friendProfiles.map((friend) => friend.id))
      setFollowerIds(friendProfiles.map((friend) => friend.id))
    }

    loadFollowing()
    return () => {
      mounted = false
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (hasSupabaseConfig && supabase && session?.user?.id) return
    if (typeof window === 'undefined') return
    window.localStorage.setItem('lyyve-following-ids', JSON.stringify(followingIds))
  }, [followingIds, session?.user?.id])

  useEffect(() => {
    let mounted = true

    async function loadSocialFeed() {
      if (!(hasSupabaseConfig && supabase && session?.user?.id)) {
        const localMyFeedItems = myCheckIns.map((item) => ({
          id: item.id,
          user: profile.displayName || profile.username || 'Jij',
          artist: item.artist,
          event: item.venue,
          rating: Number(item.rating ?? 0),
          note: item.note ?? '',
          photoDataUrl: item.photoDataUrl || item.photo_url || '',
          createdAt: item.createdAt || '',
          isFriendPost: false,
          friendId: '',
        }))

        const localFriendItems = friendProfiles.flatMap((friend) =>
          (friend.checkIns ?? []).map((item) => ({
            id: item.id,
            user: friend.displayName || friend.username || 'Gebruiker',
            artist: item.artist,
            event: item.venue,
            rating: Number(item.rating ?? 0),
            note: item.note ?? '',
            photoDataUrl: item.photoDataUrl || item.photo_url || '',
            createdAt: item.createdAt || '',
            isFriendPost: true,
            friendId: friend.id,
          }))
        )

        if (!mounted) return
        setSocialFeedItems(
          [...localMyFeedItems, ...localFriendItems].sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          )
        )
        setSocialFriends(friendProfiles)
        return
      }

      const visibleUserIds = [session.user.id, ...followingIds]
      const { data: feedRows, error: feedError } = await supabase
        .from('check_ins')
        .select('id, user_id, artist, venue, note, rating, created_at, photo_url, city, country')
        .in('user_id', visibleUserIds)
        .order('created_at', { ascending: false })
        .limit(120)

      if (!mounted) return
      if (feedError || !feedRows) {
        setSocialFeedItems([])
        setSocialFriends([])
        return
      }

      const { data: directoryRows } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url, city, favorite_genres, favorite_artists')
        .neq('id', session.user.id)
        .limit(200)

      if (!mounted) return

      const userIds = [...new Set(feedRows.map((row) => row.user_id).filter(Boolean))]
      let profilesById = {}
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, username, display_name, bio, avatar_url, city, favorite_genres, favorite_artists')
          .in('id', userIds)

        if (!mounted) return
        profilesById = Object.fromEntries((profileRows ?? []).map((row) => [row.id, row]))
      }

      const mappedFeed = feedRows.map((row) => {
        const isOwn = row.user_id === session.user.id
        const linkedProfile = profilesById[row.user_id] ?? null
        return {
          id: row.id,
          user: isOwn
            ? profile.displayName || profile.username || 'Jij'
            : linkedProfile?.display_name || linkedProfile?.username || 'Gebruiker',
          artist: row.artist,
          event: row.venue,
          rating: Number(row.rating ?? 0),
          note: row.note ?? '',
          photoDataUrl: row.photo_url || '',
          createdAt: row.created_at || '',
          isFriendPost: !isOwn,
          friendId: isOwn ? '' : row.user_id,
        }
      })

      const friendMap = Object.fromEntries(
        (directoryRows ?? []).map((row) => [
          row.id,
          {
            id: row.id,
            username: row.username || `user-${String(row.id).slice(0, 8)}`,
            displayName: row.display_name || row.username || 'Gebruiker',
            bio: row.bio || '',
            avatarUrl: row.avatar_url || '',
            city: row.city || '',
            checkIns: [],
          },
        ])
      )
      for (const row of feedRows) {
        if (!row.user_id || row.user_id === session.user.id) continue
        const linkedProfile = profilesById[row.user_id] ?? null
        if (!friendMap[row.user_id]) {
          friendMap[row.user_id] = {
            id: row.user_id,
            username: linkedProfile?.username || `user-${String(row.user_id).slice(0, 8)}`,
            displayName: linkedProfile?.display_name || linkedProfile?.username || 'Gebruiker',
            bio: linkedProfile?.bio || '',
            avatarUrl: linkedProfile?.avatar_url || '',
            city: linkedProfile?.city || '',
            checkIns: [],
          }
        }
        friendMap[row.user_id].checkIns.push({
          id: row.id,
          artist: row.artist,
          venue: row.venue,
          note: row.note ?? '',
          rating: Number(row.rating ?? 0),
          createdAt: row.created_at || '',
          photoDataUrl: row.photo_url || '',
          city: row.city ?? '',
          country: row.country ?? '',
        })
      }

      setSocialFeedItems(mappedFeed)
      setSocialFriends(Object.values(friendMap))
    }

    loadSocialFeed()
    return () => {
      mounted = false
    }
  }, [followingIds, myCheckIns, profile.displayName, profile.username, session?.user?.id])

  useEffect(() => {
    let mounted = true
    async function syncBadges() {
      const storedBadges = await getBadges()
      const evaluated = evaluateBadges(myCheckIns, storedBadges)
      await saveBadges(evaluated)
      if (mounted) setBadges(evaluated)
    }
    syncBadges()
    return () => {
      mounted = false
    }
  }, [myCheckIns])

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      if (hasSupabaseConfig && supabase && session?.user?.id) {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
        if (!mounted) return
        if (data) {
          setProfile({
            ...defaultProfile,
            id: data.id,
            username: data.username || defaultProfile.username,
            displayName: data.display_name || defaultProfile.displayName,
            bio: data.bio || defaultProfile.bio,
            city: data.city || defaultProfile.city,
            avatarUrl: data.avatar_url || '',
            favoriteGenres: data.favorite_genres || defaultProfile.favoriteGenres,
            favoriteArtists: data.favorite_artists || defaultProfile.favoriteArtists,
            updatedAt: data.updated_at || '',
          })
        } else {
          const fallbackName = session.user.email?.split('@')[0] || defaultProfile.username
          const initialProfile = {
            id: session.user.id,
            username: fallbackName,
            display_name: defaultProfile.displayName,
            bio: defaultProfile.bio,
            city: defaultProfile.city,
            avatar_url: '',
            favorite_genres: defaultProfile.favoriteGenres,
            favorite_artists: defaultProfile.favoriteArtists,
          }
          await supabase.from('profiles').upsert(initialProfile)
          setProfile({
            ...defaultProfile,
            id: session.user.id,
            username: fallbackName,
          })
        }
        if (mounted) setProfileLoaded(true)
        return
      }
      if (hasSupabaseConfig) {
        // In auth mode without an active session we keep profile state neutral.
        if (!mounted) return
        setProfile(defaultProfile)
        setProfileLoaded(true)
        return
      }

      const storedProfile = await getProfile()
      if (!mounted) return

      if (storedProfile) {
        setProfile({ ...defaultProfile, ...storedProfile })
      } else {
        setProfile(defaultProfile)
        await saveProfile(defaultProfile)
      }
      if (mounted) setProfileLoaded(true)
    }

    loadProfile()
    return () => {
      mounted = false
    }
  }, [session?.user?.email, session?.user?.id])

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashMinElapsed(true), 1700)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!checkInsLoaded || !profileLoaded || !splashMinElapsed || splashGone) return

    const hideTimer = window.setTimeout(() => setSplashHiding(true), 0)
    const removeTimer = window.setTimeout(() => setSplashGone(true), 560)

    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(removeTimer)
    }
  }, [checkInsLoaded, profileLoaded, splashGone, splashMinElapsed])

  const handleAddCheckIn = useCallback(async (checkIn) => {
    const newCheckIn = {
      ...checkIn,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }

    if (hasSupabaseConfig && supabase && session?.user?.id) {
      const { data, error } = await supabase
        .from('check_ins')
        .insert({
          user_id: session.user.id,
          artist: newCheckIn.artist,
          venue: newCheckIn.venue,
          note: newCheckIn.note ?? '',
          rating: newCheckIn.rating,
          photo_url: newCheckIn.photoDataUrl || null,
          city: newCheckIn.city || null,
          country: newCheckIn.country || null,
        })
        .select('*')
        .single()

      if (!error && data) {
        newCheckIn.id = data.id
      }
    }

    setMyCheckIns((prev) => [newCheckIn, ...prev])
    if (hasSupabaseConfig && supabase && session?.user?.id) {
      // Cloud is source of truth when auth is enabled.
    } else {
      await saveCheckIn(newCheckIn)
    }
    await Promise.all([
      saveCatalogEntry('artist', newCheckIn.artist),
      saveCatalogEntry('place', newCheckIn.venue),
    ])
  }, [session])

  const handleSaveProfile = useCallback(async (nextProfile) => {
    const mergedProfile = { ...defaultProfile, ...nextProfile, id: 'me' }
    if (hasSupabaseConfig && supabase && session?.user?.id) {
      await supabase.from('profiles').upsert({
        id: session.user.id,
        username: mergedProfile.username,
        display_name: mergedProfile.displayName,
        bio: mergedProfile.bio,
        city: mergedProfile.city,
        avatar_url: mergedProfile.avatarUrl || '',
        favorite_genres: mergedProfile.favoriteGenres,
        favorite_artists: mergedProfile.favoriteArtists,
      })
      setProfile({ ...mergedProfile, id: session.user.id })
      return
    }

    setProfile(mergedProfile)
    await saveProfile(mergedProfile)
  }, [session])

  const handleUpdateCheckIn = useCallback(
    async (checkInId, updates) => {
      setMyCheckIns((prev) =>
        prev.map((item) =>
          item.id === checkInId
            ? {
                ...item,
                ...updates,
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      )

      const existing = myCheckIns.find((item) => item.id === checkInId)
      if (!existing) return
      const merged = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      }

      if (hasSupabaseConfig && supabase && session?.user?.id) {
        await supabase
          .from('check_ins')
          .update({
            artist: merged.artist,
            venue: merged.venue,
            note: merged.note ?? '',
            rating: merged.rating,
            photo_url: merged.photoDataUrl || null,
            city: merged.city || null,
            country: merged.country || null,
          })
          .eq('id', checkInId)
          .eq('user_id', session.user.id)
      } else {
        await saveCheckIn(merged)
      }

      await Promise.all([saveCatalogEntry('artist', merged.artist), saveCatalogEntry('place', merged.venue)])
    },
    [myCheckIns, session]
  )

  const handleSignOut = useCallback(async () => {
    if (hasSupabaseConfig && supabase) {
      await supabase.auth.signOut()
    }
  }, [])

  const handleDeleteCheckIn = useCallback(
    async (checkInId) => {
      setMyCheckIns((prev) => prev.filter((item) => item.id !== checkInId))
      if (hasSupabaseConfig && supabase && session?.user?.id) {
        await supabase.from('check_ins').delete().eq('id', checkInId).eq('user_id', session.user.id)
      } else {
        await deleteCheckIn(checkInId)
      }
    },
    [session]
  )

  const handleOpenProfileFromFeed = useCallback((friendId = '') => {
    setFocusedFriendId(friendId)
    setActiveTab('profile')
  }, [])

  const handleToggleFollow = useCallback(
    async (friendId) => {
      if (!friendId) return

      const isFollowing = followingIds.includes(friendId)
      setFollowingIds((prev) =>
        isFollowing ? prev.filter((id) => id !== friendId) : [...prev, friendId]
      )

      if (hasSupabaseConfig && supabase && session?.user?.id) {
        if (isFollowing) {
          await supabase
            .from('follows')
            .delete()
            .eq('follower_id', session.user.id)
            .eq('following_id', friendId)
        } else {
          await supabase.from('follows').insert({
            follower_id: session.user.id,
            following_id: friendId,
          })
        }
      }
    },
    [followingIds, session?.user?.id]
  )

  const activeView = useMemo(() => {
    if (activeTab === 'checkin') {
      return <CheckInTab onAddCheckIn={handleAddCheckIn} />
    }

    if (activeTab === 'stats') {
      return (
        <StatsTab
          checkIns={myCheckIns}
          onUpdateCheckIn={handleUpdateCheckIn}
          onDeleteCheckIn={handleDeleteCheckIn}
        />
      )
    }

    if (activeTab === 'explore') {
      return (
        <ExploreTab
          checkIns={myCheckIns}
          profile={profile}
          friends={socialFriends}
          followingIds={followingIds}
          onToggleFollow={handleToggleFollow}
          onOpenProfile={handleOpenProfileFromFeed}
        />
      )
    }

    if (activeTab === 'profile') {
      return (
        <ProfileTab
          key={`profile-${profile.id}-${profile.updatedAt ?? 'init'}`}
          profile={profile}
          onSaveProfile={handleSaveProfile}
          onSignOut={handleSignOut}
          friends={socialFriends}
          followingIdsExternal={followingIds}
          followerIdsExternal={followerIds}
          onToggleFollow={handleToggleFollow}
          checkIns={myCheckIns}
          badges={badges}
          externalSelectedFriendId={focusedFriendId}
        />
      )
    }

    return (
      <FeedTab
        checkIns={myCheckIns}
        profile={profile}
        currentUser={session?.user ?? null}
        feedItems={socialFeedItems}
        onUpdateCheckIn={handleUpdateCheckIn}
        onDeleteCheckIn={handleDeleteCheckIn}
        onOpenProfile={handleOpenProfileFromFeed}
      />
    )
  }, [activeTab, badges, focusedFriendId, followerIds, followingIds, handleAddCheckIn, handleDeleteCheckIn, handleOpenProfileFromFeed, handleSaveProfile, handleSignOut, handleToggleFollow, handleUpdateCheckIn, myCheckIns, profile, socialFeedItems, socialFriends])

  const profileInitials = avatarInitials(profile.displayName)
  const showSplash = !splashGone
  const inRecoveryFlow =
    typeof window !== 'undefined' &&
    (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery'))

  if (authLoading) {
    return <div className="min-h-svh bg-zinc-950" />
  }

  if (hasSupabaseConfig && (!session || inRecoveryFlow)) {
    return <AuthScreen forceReset={inRecoveryFlow} />
  }

  return (
    <div className="min-h-svh bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_top,#fb718544,transparent_38%),radial-gradient(circle_at_75%_20%,#8b5cf655,transparent_42%),radial-gradient(circle_at_20%_80%,#22d3ee33,transparent_38%)]" />
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.02),transparent_30%,rgba(255,255,255,0.03),transparent_70%)]" />
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-6">
        <header className="mb-6 grid grid-cols-[44px_1fr_44px] items-center gap-3">
          <div className="h-11 w-11" />
          <img src={`${ASSET_BASE}lyyve-logo-white-blue.png`} alt="Lyyve logo" className="mx-auto h-auto w-40" />
          <button
            type="button"
            onClick={() => {
              setFocusedFriendId('')
              setActiveTab('profile')
            }}
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
      {showSplash && (
        <div
          className={`fixed inset-0 z-50 overflow-hidden bg-[#05020f] text-zinc-100 transition-opacity duration-500 ${
            splashHiding ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#fb718544,transparent_42%),radial-gradient(circle_at_70%_20%,#8b5cf666,transparent_48%),radial-gradient(circle_at_20%_80%,#22d3ee33,transparent_44%)]" />
          <div className="pointer-events-none absolute inset-0 splash-grid opacity-55" />
          <div
            className={`relative z-10 flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center ${
              splashHiding ? 'splash-outro' : ''
            }`}
          >
            <img
              src={`${ASSET_BASE}lyyve-logo.png`}
              alt="Lyyve"
              className="w-72 max-w-[82vw] splash-logo splash-outro-logo"
            />
            <p className="splash-tagline text-xs uppercase tracking-[0.22em] text-zinc-300">
              Be there. See it Lyyve.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
