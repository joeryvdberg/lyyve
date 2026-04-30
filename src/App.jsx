import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { uploadCheckInPhotos } from './lib/mediaStorage'

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
  username: 'lyyve-user',
  displayName: 'Nieuwe gebruiker',
  bio: '',
  avatarUrl: '',
  favoriteGenres: '',
  favoriteArtists: '',
  city: '',
  eventRadiusKm: 75,
  usernameChangedAt: '',
}

function loadStoredEventRadius(userId) {
  if (typeof window === 'undefined') return null
  const key = userId ? `lyyve-event-radius:${userId}` : 'lyyve-event-radius'
  const raw = window.localStorage.getItem(key)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function storeEventRadius(userId, radiusKm) {
  if (typeof window === 'undefined') return
  const key = userId ? `lyyve-event-radius:${userId}` : 'lyyve-event-radius'
  window.localStorage.setItem(key, String(radiusKm))
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

function normalizeUsername(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '')
}

const BLOCKED_NAME_PARTS = [
  'kanker',
  'kkr',
  'tering',
  'tyfus',
  'kut',
  'fuck',
  'fck',
  'shit',
  'bitch',
  'hoer',
  'h0er',
  'mongool',
  'nigger',
  'nigga',
]

function containsBlockedNameLanguage(value = '') {
  const compact = String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
  if (!compact) return false
  return BLOCKED_NAME_PARTS.some((term) => compact.includes(term))
}

function metadataString(meta, key, fallback = '') {
  const value = meta?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function buildUsernameFromEmailOrId(email = '', userId = '') {
  const local = String(email || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 18)
  if (local.length >= 3) return local
  return `lyyve_${String(userId || '').replace(/-/g, '').slice(0, 8)}`
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
  const [socialFeedRefreshTick, setSocialFeedRefreshTick] = useState(0)
  const lastSocialFeedRefreshAtRef = useRef(0)
  const socialFeedRefreshCooldownMs = 12_000

  const requestSocialFeedRefresh = useCallback((force = false) => {
    const now = Date.now()
    const elapsed = now - lastSocialFeedRefreshAtRef.current
    if (!force && elapsed < socialFeedRefreshCooldownMs) return false
    lastSocialFeedRefreshAtRef.current = now
    setSocialFeedRefreshTick((prev) => prev + 1)
    return true
  }, [])

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
            photoDataUrls: Array.isArray(item.photo_urls)
              ? item.photo_urls.filter(Boolean)
              : item.photo_url
                ? [item.photo_url]
                : [],
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
        .select('id, user_id, artist, venue, note, rating, created_at, photo_url, photo_urls, city, country')
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
        .limit(1000)

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
          photoDataUrls: Array.isArray(row.photo_urls)
            ? row.photo_urls.filter(Boolean)
            : row.photo_url
              ? [row.photo_url]
              : [],
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
          photoDataUrls: Array.isArray(row.photo_urls)
            ? row.photo_urls.filter(Boolean)
            : row.photo_url
              ? [row.photo_url]
              : [],
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
  }, [followingIds, myCheckIns, profile.displayName, profile.username, session?.user?.id, socialFeedRefreshTick])

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase || !session?.user?.id) return

    function handleWindowFocus() {
      requestSocialFeedRefresh(false)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        requestSocialFeedRefresh(false)
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [requestSocialFeedRefresh, session?.user?.id])

  useEffect(() => {
    let mounted = true
    async function syncBadges() {
      const storedBadges = await getBadges()
      let earlyAdopterEligible
      if (hasSupabaseConfig && supabase && session?.user?.id) {
        const { data: firstProfiles } = await supabase
          .from('profiles')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(100)
        earlyAdopterEligible = (firstProfiles ?? []).some((row) => row.id === session.user.id)
      }
      const evaluated = evaluateBadges(myCheckIns, storedBadges, { earlyAdopterEligible })
      await saveBadges(evaluated)
      if (mounted) setBadges(evaluated)
    }
    syncBadges()
    return () => {
      mounted = false
    }
  }, [myCheckIns, session?.user?.id])

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      if (hasSupabaseConfig && supabase && session?.user?.id) {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
        if (!mounted) return
        if (data) {
          const storedRadius = loadStoredEventRadius(session.user.id)
          setProfile({
            ...defaultProfile,
            id: data.id,
            username: data.username || buildUsernameFromEmailOrId(session.user.email, data.id),
            displayName:
              data.display_name ||
              metadataString(session.user.user_metadata ?? {}, 'full_name', defaultProfile.displayName),
            bio: data.bio || '',
            city: data.city || '',
            avatarUrl: data.avatar_url || '',
            favoriteGenres: data.favorite_genres || '',
            favoriteArtists: data.favorite_artists || '',
            eventRadiusKm: storedRadius ?? defaultProfile.eventRadiusKm,
            usernameChangedAt: data.username_changed_at || '',
            updatedAt: data.updated_at || '',
          })
        } else {
          const userMeta = session.user.user_metadata ?? {}
          const fallbackName = metadataString(
            userMeta,
            'username',
            buildUsernameFromEmailOrId(session.user.email, session.user.id)
          )
          const fallbackDisplayName = metadataString(
            userMeta,
            'display_name',
            metadataString(userMeta, 'full_name', defaultProfile.displayName)
          )
          const fallbackCity = metadataString(userMeta, 'city', '')
          const fallbackGenres = metadataString(userMeta, 'favorite_genres', '')
          const fallbackArtists = metadataString(userMeta, 'favorite_artists', '')
          const initialProfile = {
            id: session.user.id,
            username: fallbackName,
            display_name: fallbackDisplayName,
            bio: '',
            city: fallbackCity,
            avatar_url: '',
            favorite_genres: fallbackGenres,
            favorite_artists: fallbackArtists,
            username_changed_at: new Date().toISOString(),
          }
          const { error: initialProfileError } = await supabase.from('profiles').upsert(initialProfile)
          if (initialProfileError) {
            await supabase.from('profiles').upsert({
              id: session.user.id,
              username: fallbackName,
              display_name: fallbackDisplayName,
              bio: '',
              city: fallbackCity,
              avatar_url: '',
              favorite_genres: fallbackGenres,
              favorite_artists: fallbackArtists,
            })
          }
          setProfile({
            ...defaultProfile,
            id: session.user.id,
            username: fallbackName,
            displayName: fallbackDisplayName,
            city: fallbackCity,
            favoriteGenres: fallbackGenres,
            favoriteArtists: fallbackArtists,
            usernameChangedAt: new Date().toISOString(),
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
    const timer = window.setTimeout(() => setSplashMinElapsed(true), 2700)
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
      createdAt: checkIn.createdAt || new Date().toISOString(),
    }

    if (hasSupabaseConfig && supabase && session?.user?.id) {
      const uploadedPhotoUrls = await uploadCheckInPhotos(session.user.id, newCheckIn.photoDataUrls || [])
      if (uploadedPhotoUrls.length > 0) {
        newCheckIn.photoDataUrls = uploadedPhotoUrls
        newCheckIn.photoDataUrl = uploadedPhotoUrls[0]
      }
      const { data, error } = await supabase
        .from('check_ins')
        .insert({
          user_id: session.user.id,
          artist: newCheckIn.artist,
          venue: newCheckIn.venue,
          note: newCheckIn.note ?? '',
          rating: newCheckIn.rating,
          created_at: newCheckIn.createdAt,
          photo_url: newCheckIn.photoDataUrl || null,
          photo_urls: Array.isArray(newCheckIn.photoDataUrls) ? newCheckIn.photoDataUrls : null,
          city: newCheckIn.city || null,
          country: newCheckIn.country || null,
        })
        .select('*')
        .single()
      if (error) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('check_ins')
          .insert({
            user_id: session.user.id,
            artist: newCheckIn.artist,
            venue: newCheckIn.venue,
            note: newCheckIn.note ?? '',
            rating: newCheckIn.rating,
            created_at: newCheckIn.createdAt,
            photo_url: newCheckIn.photoDataUrl || null,
            city: newCheckIn.city || null,
            country: newCheckIn.country || null,
          })
          .select('*')
          .single()
        if (!fallbackError && fallbackData) newCheckIn.id = fallbackData.id
      } else if (data) {
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
    requestSocialFeedRefresh(true)
  }, [requestSocialFeedRefresh, session])

  const handleSaveProfile = useCallback(async (nextProfile) => {
    const mergedProfile = { ...defaultProfile, ...nextProfile, id: 'me' }
    const normalizedUsername = normalizeUsername(mergedProfile.username)
    const normalizedDisplayName = String(mergedProfile.displayName || '').trim()
    const previousUsername = normalizeUsername(profile.username || '')
    const usernameChanged = normalizedUsername !== previousUsername
    const usernameChangedAtRaw = mergedProfile.usernameChangedAt || profile.usernameChangedAt || ''

    if (normalizedUsername.length < 3) {
      throw new Error('Gebruikersnaam moet minimaal 3 tekens zijn.')
    }
    if (normalizedDisplayName.length < 2) {
      throw new Error('Weergavenaam moet minimaal 2 tekens zijn.')
    }
    if (containsBlockedNameLanguage(normalizedUsername) || containsBlockedNameLanguage(normalizedDisplayName)) {
      throw new Error('Scheldwoorden zijn niet toegestaan in gebruikersnaam of weergavenaam.')
    }

    const duplicateInLoadedProfiles = socialFriends.some(
      (friend) =>
        friend.id !== session?.user?.id &&
        normalizeUsername(friend.username || '') === normalizedUsername
    )
    if (duplicateInLoadedProfiles) {
      throw new Error('Deze gebruikersnaam is al in gebruik.')
    }

    if (usernameChanged && usernameChangedAtRaw) {
      const lastChangedAt = new Date(usernameChangedAtRaw).getTime()
      if (Number.isFinite(lastChangedAt)) {
        const cooldownMs = 30 * 24 * 60 * 60 * 1000
        const nextAllowedAt = new Date(lastChangedAt + cooldownMs)
        if (Date.now() < nextAllowedAt.getTime()) {
          throw new Error(
            `Je kunt je gebruikersnaam niet te vaak wijzigen. Volgende wijziging mogelijk na ${nextAllowedAt.toLocaleDateString('nl-NL')}.`
          )
        }
      }
    }

    if (hasSupabaseConfig && supabase && session?.user?.id) {
      const { data: duplicateUserRows, error: duplicateUserError } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', normalizedUsername)
        .neq('id', session.user.id)
        .limit(1)

      if (duplicateUserError) {
        throw new Error('Kon gebruikersnaam nu niet controleren. Probeer opnieuw.')
      }

      if ((duplicateUserRows ?? []).length > 0) {
        throw new Error('Deze gebruikersnaam is al in gebruik.')
      }

      const payload = {
        id: session.user.id,
        username: normalizedUsername,
        display_name: normalizedDisplayName,
        bio: mergedProfile.bio,
        city: mergedProfile.city,
        avatar_url: mergedProfile.avatarUrl || '',
        favorite_genres: mergedProfile.favoriteGenres,
        favorite_artists: mergedProfile.favoriteArtists,
        username_changed_at: usernameChanged ? new Date().toISOString() : usernameChangedAtRaw || null,
      }
      const { error: upsertError } = await supabase.from('profiles').upsert(payload)
      if (upsertError) {
        await supabase.from('profiles').upsert({
          id: session.user.id,
          username: normalizedUsername,
          display_name: normalizedDisplayName,
          bio: mergedProfile.bio,
          city: mergedProfile.city,
          avatar_url: mergedProfile.avatarUrl || '',
          favorite_genres: mergedProfile.favoriteGenres,
          favorite_artists: mergedProfile.favoriteArtists,
        })
      }
      storeEventRadius(session.user.id, Number(mergedProfile.eventRadiusKm ?? defaultProfile.eventRadiusKm))
      setProfile({
        ...mergedProfile,
        username: normalizedUsername,
        displayName: normalizedDisplayName,
        usernameChangedAt: usernameChanged ? new Date().toISOString() : usernameChangedAtRaw || '',
        id: session.user.id,
      })
      return
    }

    const nextChangedAt = usernameChanged ? new Date().toISOString() : usernameChangedAtRaw || ''
    setProfile({
      ...mergedProfile,
      username: normalizedUsername,
      displayName: normalizedDisplayName,
      usernameChangedAt: nextChangedAt,
    })
    storeEventRadius(null, Number(mergedProfile.eventRadiusKm ?? defaultProfile.eventRadiusKm))
    await saveProfile({
      ...mergedProfile,
      username: normalizedUsername,
      displayName: normalizedDisplayName,
      usernameChangedAt: nextChangedAt,
    })
  }, [profile.username, profile.usernameChangedAt, session, socialFriends])

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
        const uploadedPhotoUrls = await uploadCheckInPhotos(session.user.id, merged.photoDataUrls || [])
        if (uploadedPhotoUrls.length > 0) {
          merged.photoDataUrls = uploadedPhotoUrls
          merged.photoDataUrl = uploadedPhotoUrls[0]
        }
        const { error } = await supabase
          .from('check_ins')
          .update({
            artist: merged.artist,
            venue: merged.venue,
            note: merged.note ?? '',
            rating: merged.rating,
            created_at: merged.createdAt || null,
            photo_url: merged.photoDataUrl || null,
            photo_urls: Array.isArray(merged.photoDataUrls) ? merged.photoDataUrls : null,
            city: merged.city || null,
            country: merged.country || null,
          })
          .eq('id', checkInId)
          .eq('user_id', session.user.id)
        if (error) {
          await supabase
            .from('check_ins')
            .update({
              artist: merged.artist,
              venue: merged.venue,
              note: merged.note ?? '',
              rating: merged.rating,
              created_at: merged.createdAt || null,
              photo_url: merged.photoDataUrl || null,
              city: merged.city || null,
              country: merged.country || null,
            })
            .eq('id', checkInId)
            .eq('user_id', session.user.id)
        }
      } else {
        await saveCheckIn(merged)
      }

      await Promise.all([saveCatalogEntry('artist', merged.artist), saveCatalogEntry('place', merged.venue)])
      requestSocialFeedRefresh(true)
    },
    [myCheckIns, requestSocialFeedRefresh, session]
  )

  const handleSignOut = useCallback(async () => {
    if (hasSupabaseConfig && supabase) {
      await supabase.auth.signOut()
    }
  }, [])

  const handleDeleteAccount = useCallback(async () => {
    if (!(hasSupabaseConfig && supabase && session?.user?.id)) {
      throw new Error('Account verwijderen werkt alleen in online mode.')
    }

    const confirmed = window.confirm(
      'Weet je zeker dat je je account wilt verwijderen? Je check-ins, likes, comments en profielgegevens worden verwijderd.'
    )
    if (!confirmed) return

    await Promise.all([
      supabase.from('check_in_likes').delete().eq('user_id', session.user.id),
      supabase.from('check_in_comments').delete().eq('user_id', session.user.id),
      supabase.from('follows').delete().eq('follower_id', session.user.id),
      supabase.from('follows').delete().eq('following_id', session.user.id),
      supabase.from('check_ins').delete().eq('user_id', session.user.id),
      supabase.from('profiles').delete().eq('id', session.user.id),
    ])

    const { error: deleteAuthError } = await supabase.rpc('delete_my_account')
    await supabase.auth.signOut()

    if (deleteAuthError) {
      window.alert(
        'Je profieldata is verwijderd. Volledige auth-account verwijdering vereist een Supabase SQL functie delete_my_account (kan ik zo voor je geven).'
      )
    }
  }, [session?.user?.id])

  const handleDeleteCheckIn = useCallback(
    async (checkInId) => {
      setMyCheckIns((prev) => prev.filter((item) => item.id !== checkInId))
      if (hasSupabaseConfig && supabase && session?.user?.id) {
        await supabase.from('check_ins').delete().eq('id', checkInId).eq('user_id', session.user.id)
      } else {
        await deleteCheckIn(checkInId)
      }
      requestSocialFeedRefresh(true)
    },
    [requestSocialFeedRefresh, session]
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

  const profileNeedsCompletion = useMemo(() => {
    if (!session?.user?.id) return false
    return !String(profile.displayName || '').trim() ||
      !String(profile.username || '').trim() ||
      !String(profile.favoriteGenres || '').trim() ||
      !String(profile.favoriteArtists || '').trim()
  }, [profile.displayName, profile.favoriteArtists, profile.favoriteGenres, profile.username, session?.user?.id])

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
          onDeleteAccount={handleDeleteAccount}
          forceProfileCompletion={profileNeedsCompletion}
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
        onManualRefresh={requestSocialFeedRefresh}
        onFeedMutated={() => requestSocialFeedRefresh(true)}
      />
    )
  }, [activeTab, badges, focusedFriendId, followerIds, followingIds, handleAddCheckIn, handleDeleteAccount, handleDeleteCheckIn, handleOpenProfileFromFeed, handleSaveProfile, handleSignOut, handleToggleFollow, handleUpdateCheckIn, myCheckIns, profile, profileNeedsCompletion, requestSocialFeedRefresh, socialFeedItems, socialFriends])

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
