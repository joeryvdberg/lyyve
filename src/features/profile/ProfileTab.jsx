import { useEffect, useMemo, useState } from 'react'
import { getCatalogEntries, getFeedInteractions, saveFeedInteraction } from '../../lib/db'
import { evaluateBadges } from '../../lib/badges'
import { cropFileToSquareDataUrl } from '../../lib/image'
import { hasSupabaseConfig, supabase } from '../../lib/supabase'
import PhotoCarousel from '../../components/common/PhotoCarousel'

const CITY_SUGGESTIONS = [
  'Amsterdam',
  'Rotterdam',
  'Den Haag',
  'Utrecht',
  'Eindhoven',
  'Groningen',
  'Tilburg',
  'Almere',
  'Breda',
  'Nijmegen',
  'Enschede',
  'Haarlem',
  'Arnhem',
  'Zaanstad',
  'Amersfoort',
  'Apeldoorn',
  'Hoofddorp',
  'Leiden',
  'Dordrecht',
  'Zoetermeer',
  'Zwolle',
  'Maastricht',
  'Delft',
  'Leeuwarden',
  'Den Bosch',
  'Helmond',
  'Amstelveen',
  'Deventer',
  'Venlo',
  'Hilversum',
  'Purmerend',
  'Alkmaar',
  'Zaandam',
  'Vlaardingen',
  'Hengelo',
  'Roermond',
  'Sittard',
  'Gouda',
  'Doetinchem',
  'Middelburg',
  'Lelystad',
  'Heerlen',
  'Oss',
  'Assen',
  'Tiel',
  'Bergen op Zoom',
  'Harderwijk',
  'Emmen',
  'Ede',
  'Sneek',
  'Ermelo',
  'Uden',
  'Nunspeet',
  'Putten',
  'Nijkerk',
  'Barneveld',
  'Zeewolde',
  'Dronten',
  'Urk',
  'Kampen',
  'Meppel',
  'Hoogeveen',
  'Stadskanaal',
  'Winschoten',
  'Veendam',
  'Drachten',
  'Heerenveen',
  'Joure',
  'Franeker',
  'Harlingen',
  'Schagen',
  'Hoorn',
  'Enkhuizen',
  'Heiloo',
  'Castricum',
  'Heemskerk',
  'Beverwijk',
  'Noordwijk',
  'Katwijk',
  'Lisse',
  'Hillegom',
  'Aalsmeer',
  'Uithoorn',
  'Woerden',
  'Nieuwegein',
  'Houten',
  'Zeist',
  'Veenendaal',
  'Wageningen',
  'Rhenen',
  'Culemborg',
  'Gorinchem',
  'Sliedrecht',
  'Papendrecht',
  'Spijkenisse',
  'Barendrecht',
  'Ridderkerk',
  'Schiedam',
  'Capelle aan den IJssel',
  'Nieuwerkerk aan den IJssel',
  'Naaldwijk',
  'Westland',
  'Rijswijk',
  'Voorburg',
  'Zoeterwoude',
  'Oegstgeest',
  'Alphen aan den Rijn',
  'Waddinxveen',
  'Krimpen aan den IJssel',
  'Etten-Leur',
  'Oosterhout',
  'Waalwijk',
  'Kaatsheuvel',
  'Zaltbommel',
  'Boxtel',
  'Vught',
  'Best',
  'Veldhoven',
  'Nuenen',
  'Veghel',
  'Udenhout',
  'Boxmeer',
  'Cuijk',
  'Wijchen',
  'Elst',
  'Duiven',
  'Zevenaar',
  'Doesburg',
  'Winterswijk',
  'Aalten',
  'Oldenzaal',
  'Borne',
  'Raalte',
  'Ommen',
  'Hardenberg',
  'Coevorden',
  'Terneuzen',
  'Goes',
  'Vlissingen',
  'Zierikzee',
  'Hellevoetsluis',
  'Brielle',
  'Leidschendam',
  'Pijnacker',
  'Nootdorp',
]

function avatarInitials(displayName = '') {
  const parts = displayName
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return 'LY'
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '')
  return initials.join('')
}

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getLabel(value) {
  return typeof value === 'string' ? value : value?.name ?? ''
}

function getPopularity(value) {
  if (typeof value === 'string') return 0
  return Number(value?.popularity ?? 0)
}

function mergeByName(primary, secondary) {
  const map = new Map()
  for (const item of [...primary, ...secondary]) {
    const name = getLabel(item).trim()
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

function rankArtistSuggestions(pool, query) {
  return pool
    .map((item) => getLabel(item).trim())
    .filter(Boolean)
    .filter((name) => normalizeText(name).includes(query))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8)
}

function mapPasswordUpdateError(error) {
  const raw = String(error?.message || '').toLowerCase()
  if (
    raw.includes('same password') ||
    raw.includes('same as the') ||
    (raw.includes('different') && raw.includes('old')) ||
    (raw.includes('new password') && raw.includes('different'))
  ) {
    return 'Het nieuwe wachtwoord moet anders zijn dan je huidige wachtwoord.'
  }
  if (raw.includes('password') && raw.includes('least')) {
    return 'Het wachtwoord is volgens de server nog niet sterk genoeg. Voeg hoofd-/kleine letters, een cijfer en een symbool toe (zoals hierboven beschreven).'
  }
  if (
    raw.includes('reauthenticate') ||
    raw.includes('session expired') ||
    raw.includes('jwt expired')
  ) {
    return 'De sessie is verlopen of ongeldig. Log uit, log opnieuw in op dit apparaat en probeer nog eens.'
  }
  if (error?.message && String(error.message).trim()) {
    return error.message
  }
  return 'Wachtwoord bijwerken mislukt.'
}

function validatePasswordStrength(value) {
  const minLength = value.length >= 10
  const hasLower = /[a-z]/.test(value)
  const hasUpper = /[A-Z]/.test(value)
  const hasNumber = /\d/.test(value)
  const hasSpecial = /[^A-Za-z0-9]/.test(value)
  const hasNoWhitespace = !/\s/.test(value)
  const valid = minLength && hasLower && hasUpper && hasNumber && hasSpecial && hasNoWhitespace
  return { valid, minLength, hasLower, hasUpper, hasNumber, hasSpecial, hasNoWhitespace }
}

function normalizeUsernameField(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '')
}

function ProfileTasteReadout({ favoriteGenres = '', favoriteArtists = '', className = '' }) {
  const g = String(favoriteGenres || '').trim()
  const a = String(favoriteArtists || '').trim()
  if (!g && !a) return null
  return (
    <div className={className}>
      {g && (
        <p className="text-xs leading-relaxed text-zinc-400">
          <span className="font-semibold text-zinc-300">Favoriete genres</span>: {g}
        </p>
      )}
      {a && (
        <p className={`text-xs leading-relaxed text-zinc-400 ${g ? 'mt-1' : ''}`}>
          <span className="font-semibold text-zinc-300">Favoriete artiesten</span>: {a}
        </p>
      )}
    </div>
  )
}

export default function ProfileTab({
  profile,
  onSaveProfile,
  onSignOut,
  onDeleteAccount,
  forceProfileCompletion = false,
  friends = [],
  followingIdsExternal = [],
  followerIdsExternal = [],
  onToggleFollow,
  checkIns = [],
  badges = [],
  externalSelectedFriendId = '',
}) {
  const [form, setForm] = useState(profile)
  const [saveState, setSaveState] = useState('idle')
  const [isEditing, setIsEditing] = useState(false)
  const [selectedFriendId, setSelectedFriendId] = useState('')
  const [relationView, setRelationView] = useState('')
  const [friendStatsView, setFriendStatsView] = useState('')
  const [friendSearchQuery, setFriendSearchQuery] = useState('')
  const [relationSearchQuery, setRelationSearchQuery] = useState('')
  const [followingIds, setFollowingIds] = useState(followingIdsExternal)
  const [interactions, setInteractions] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [openComments, setOpenComments] = useState({})
  const [commentErrors, setCommentErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [artistPool, setArtistPool] = useState([])
  const [badgeDetailGroup, setBadgeDetailGroup] = useState('')
  const [globalBadgePercentages, setGlobalBadgePercentages] = useState({})
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordChangeMessage, setPasswordChangeMessage] = useState('')
  const [passwordChangeBusy, setPasswordChangeBusy] = useState(false)

  const hasChanges = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(profile)
  }, [form, profile])

  const initials = avatarInitials(form.displayName)
  const usernameFrozen = normalizeUsernameField(profile.username || '').length >= 3
  const selectedFriend = friends.find((friend) => friend.id === selectedFriendId) ?? null
  const followers = friends.filter((friend) => followerIdsExternal.includes(friend.id))
  const following = friends.filter((friend) => followingIds.includes(friend.id))
  const unlockedBadges = useMemo(() => badges.filter((badge) => badge.unlocked), [badges])
  const groupedBadges = useMemo(() => {
    const groups = new Map()
    for (const badge of badges) {
      const groupKey = badge.group || badge.metric || badge.id
      const list = groups.get(groupKey) ?? []
      list.push(badge)
      groups.set(groupKey, list)
    }
    return [...groups.entries()].map(([group, list]) => ({
      group,
      badges: list.slice().sort((a, b) => a.threshold - b.threshold),
    }))
  }, [badges])
  const compactBadgeCards = useMemo(() => {
    return groupedBadges.map(({ group, badges: tierBadges }) => {
      const nextLocked = tierBadges.find((badge) => !badge.unlocked)
      const displayBadge = nextLocked || tierBadges[tierBadges.length - 1]
      const unlockedInGroup = tierBadges.filter((badge) => badge.unlocked).length
      return {
        group,
        displayBadge,
        unlockedInGroup,
        totalInGroup: tierBadges.length,
      }
    })
  }, [groupedBadges])
  const unlockedBadgeHighlights = useMemo(() => {
    return groupedBadges
      .map(({ badges: tierBadges }) => tierBadges.filter((badge) => badge.unlocked).slice(-1)[0] || null)
      .filter(Boolean)
  }, [groupedBadges])
  const localBadgePercentages = useMemo(() => {
    const users = [{ id: 'me', checkIns }, ...friends]
    if (!users.length) return {}
    const totals = Object.fromEntries(badges.map((badge) => [badge.id, 0]))
    for (const user of users) {
      const userBadges = user.id === 'me' ? badges : evaluateBadges(user.checkIns ?? [], [])
      for (const badge of userBadges) {
        if (badge.unlocked) totals[badge.id] = (totals[badge.id] ?? 0) + 1
      }
    }
    return Object.fromEntries(
      Object.entries(totals).map(([badgeId, count]) => [badgeId, Math.round((count / users.length) * 100)])
    )
  }, [badges, checkIns, friends])
  const friendSearchResults = useMemo(() => {
    const query = friendSearchQuery.trim().toLowerCase()
    if (!query) return friends
    return friends.filter(
      (friend) =>
        friend.displayName.toLowerCase().includes(query) || friend.username.toLowerCase().includes(query)
    )
  }, [friendSearchQuery, friends])
  const citySuggestions = useMemo(() => {
    const query = String(form.city || '').trim().toLowerCase()
    if (!query) return CITY_SUGGESTIONS.slice(0, 8)
    return CITY_SUGGESTIONS.filter((city) => city.toLowerCase().includes(query)).slice(0, 8)
  }, [form.city])
  const favoriteArtistSuggestions = useMemo(() => {
    const raw = String(form.favoriteArtists || '')
    const segments = raw.split(',')
    const activeToken = normalizeText(segments[segments.length - 1] || '')
    if (!activeToken) return []
    const selectedNames = new Set(segments.map((entry) => normalizeText(entry)).filter(Boolean))
    return rankArtistSuggestions(artistPool, activeToken).filter((name) => !selectedNames.has(normalizeText(name)))
  }, [artistPool, form.favoriteArtists])

  const friendStats = useMemo(() => {
    if (!selectedFriend) return null
    const checkIns = selectedFriend.checkIns ?? []
    const uniqueArtists = new Set(checkIns.map((item) => item.artist.toLowerCase())).size
    const uniquePlaces = new Set(checkIns.map((item) => item.venue.toLowerCase())).size
    const average =
      checkIns.length > 0
        ? (checkIns.reduce((sum, item) => sum + item.rating, 0) / checkIns.length).toFixed(1)
        : '0.0'
    return { total: checkIns.length, uniqueArtists, uniquePlaces, average }
  }, [selectedFriend])
  const selectedFriendBadges = useMemo(() => {
    if (!selectedFriend) return []
    return evaluateBadges(selectedFriend.checkIns ?? [], [])
  }, [selectedFriend])
  const selectedFriendArtists = useMemo(() => {
    if (!selectedFriend) return []
    return Array.from(new Set((selectedFriend.checkIns ?? []).map((item) => item.artist))).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [selectedFriend])
  const selectedFriendPlaces = useMemo(() => {
    if (!selectedFriend) return []
    return Array.from(new Set((selectedFriend.checkIns ?? []).map((item) => item.venue))).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [selectedFriend])

  const getBadgeEmoji = (badgeId) => {
    if (badgeId.startsWith('festival-')) return '🎪'
    if (badgeId === 'globe-trotter' || badgeId === 'world-tour') return '🌍'
    if (badgeId === 'front-row' || badgeId === 'die-hard' || badgeId === 'superfan') return '🎫'
    if (badgeId === 'taste-maker' || badgeId === 'scene-curator') return '🎧'
    if (badgeId === 'crowd-favorite') return '🔥'
    if (badgeId === 'early-adopter') return '✨'
    return '🏆'
  }

  function getBadgeGroupLabel(groupId = '') {
    if (groupId === 'artist-loyalty') return 'Artiest loyaliteit'
    if (groupId === 'festival-tier') return 'Festival levels'
    if (groupId === 'travel-tier') return 'Reis levels'
    if (groupId === 'discovery-tier') return 'Ontdekker levels'
    if (groupId === 'quality-tier') return 'Kwaliteit'
    if (groupId === 'special') return 'Special'
    return 'Badges'
  }

  useEffect(() => {
    let mounted = true
    async function loadInteractions() {
      const stored = await getFeedInteractions()
      if (mounted) setInteractions(stored)
    }
    loadInteractions()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase || badges.length === 0) return
    let cancelled = false

    async function loadGlobalBadgePercentages() {
      const profiles = []
      const pageSize = 1000
      let from = 0
      while (!cancelled) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, created_at')
          .order('created_at', { ascending: true })
          .range(from, from + pageSize - 1)
        if (error || !data || data.length === 0) break
        profiles.push(...data.filter((row) => row.id))
        if (data.length < pageSize) break
        from += pageSize
      }
      const profileIds = profiles.map((row) => row.id)
      if (cancelled || profileIds.length === 0) return
      const earlyAdopterIds = new Set(profiles.slice(0, 100).map((row) => row.id))

      const rows = []
      from = 0
      while (!cancelled) {
        const { data, error } = await supabase
          .from('check_ins')
          .select('user_id, artist, venue, rating, created_at, city, country')
          .range(from, from + pageSize - 1)
        if (error || !data || data.length === 0) break
        rows.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }
      if (cancelled) return

      const checkInsByUser = new Map(profileIds.map((id) => [id, []]))
      for (const row of rows) {
        const userId = row.user_id
        if (!checkInsByUser.has(userId)) continue
        checkInsByUser.get(userId).push({
          artist: row.artist || '',
          venue: row.venue || '',
          rating: Number(row.rating ?? 0),
          createdAt: row.created_at || '',
          city: row.city || '',
          country: row.country || '',
        })
      }

      const totals = Object.fromEntries(badges.map((badge) => [badge.id, 0]))
      for (const userId of profileIds) {
        const userBadges = evaluateBadges(checkInsByUser.get(userId) || [], [], {
          earlyAdopterEligible: earlyAdopterIds.has(userId),
        })
        for (const badge of userBadges) {
          if (badge.unlocked) totals[badge.id] = (totals[badge.id] ?? 0) + 1
        }
      }
      if (cancelled) return
      const denominator = Math.max(1, profileIds.length)
      setGlobalBadgePercentages(
        Object.fromEntries(
          Object.entries(totals).map(([badgeId, count]) => [badgeId, Math.round((count / denominator) * 100)])
        )
      )
    }

    loadGlobalBadgePercentages()
    return () => {
      cancelled = true
    }
  }, [badges])

  useEffect(() => {
    let mounted = true
    async function loadArtists() {
      try {
        const datasetBase = import.meta.env.BASE_URL
        const [response, communityArtists] = await Promise.all([
          fetch(`${datasetBase}artists.json`),
          getCatalogEntries('artist'),
        ])
        if (!response.ok || !mounted) return
        const data = await response.json()
        const baseArtists = Array.isArray(data.artists) ? data.artists : []
        if (mounted) setArtistPool(mergeByName(communityArtists, baseArtists))
      } catch {
        // Keep profile editing usable even when artist dataset fails.
      }
    }
    loadArtists()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    setSelectedFriendId(externalSelectedFriendId || '')
  }, [externalSelectedFriendId])

  useEffect(() => {
    setFollowingIds(followingIdsExternal)
  }, [followingIdsExternal])

  useEffect(() => {
    if (forceProfileCompletion && !isEditing) {
      setIsEditing(true)
    }
  }, [forceProfileCompletion, isEditing])

  useEffect(() => {
    if (onToggleFollow) return
    const stored = window.localStorage.getItem('lyyve-following-ids')
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
    setFollowingIds(friends.map((friend) => friend.id))
  }, [friends, onToggleFollow])

  useEffect(() => {
    if (onToggleFollow) return
    if (!followingIds.length) return
    window.localStorage.setItem('lyyve-following-ids', JSON.stringify(followingIds))
  }, [followingIds, onToggleFollow])

  function toggleFollow(friendId) {
    if (onToggleFollow) {
      onToggleFollow(friendId)
      return
    }
    setFollowingIds((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    )
  }

  function getInteraction(itemId) {
    return interactions[itemId] ?? { likedByMe: false, likeCount: 0, comments: [] }
  }

  function toggleLike(itemId) {
    setInteractions((prev) => {
      const current = prev[itemId] ?? { likedByMe: false, likeCount: 0, comments: [] }
      const nextLiked = !current.likedByMe
      const next = {
        ...prev,
        [itemId]: {
          ...current,
          likedByMe: nextLiked,
          likeCount: Math.max(0, current.likeCount + (nextLiked ? 1 : -1)),
        },
      }
      saveFeedInteraction(itemId, next[itemId])
      return next
    })
  }

  function toggleCommentPanel(itemId) {
    setOpenComments((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  function addComment(itemId) {
    const rawComment = commentDrafts[itemId] ?? ''
    const comment = rawComment.trim()
    if (!comment) {
      setCommentErrors((prev) => ({ ...prev, [itemId]: 'Reactie mag niet leeg zijn.' }))
      return
    }
    if (comment.length > 220) {
      setCommentErrors((prev) => ({ ...prev, [itemId]: 'Maximaal 220 tekens per reactie.' }))
      return
    }

    setInteractions((prev) => {
      const current = prev[itemId] ?? { likedByMe: false, likeCount: 0, comments: [] }
      const next = {
        ...prev,
        [itemId]: {
          ...current,
          comments: [
            ...current.comments,
            {
              id: crypto.randomUUID(),
              user: form.displayName || form.username || 'Jij',
              text: comment,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }
      saveFeedInteraction(itemId, next[itemId])
      return next
    })

    setCommentDrafts((prev) => ({ ...prev, [itemId]: '' }))
    setCommentErrors((prev) => ({ ...prev, [itemId]: '' }))
  }

  const handleChange = (field) => (event) => {
    const nextValue =
      field === 'username'
        ? String(event.target.value)
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9._-]/g, '')
        : event.target.value
    setForm((prev) => ({ ...prev, [field]: nextValue }))
    setSaveState('idle')
    setSaveError('')
  }

  const handleAvatarFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const cropped = await cropFileToSquareDataUrl(file)
    setForm((prev) => ({ ...prev, avatarUrl: cropped }))
    setSaveState('idle')
  }

  const applyFavoriteArtistSuggestion = (artistName) => {
    setForm((prev) => {
      const raw = String(prev.favoriteArtists || '')
      const segments = raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
      if (segments.length === 0) return { ...prev, favoriteArtists: artistName }
      segments[segments.length - 1] = artistName
      return { ...prev, favoriteArtists: `${segments.join(', ')}, ` }
    })
    setSaveState('idle')
    setSaveError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!hasChanges) return
    setSaveState('saving')
    setSaveError('')
    try {
      await onSaveProfile(form)
      setSaveState('saved')
      setIsEditing(false)
    } catch (error) {
      setSaveState('idle')
      setSaveError(error instanceof Error ? error.message : 'Opslaan mislukt. Probeer opnieuw.')
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault()
    setPasswordChangeMessage('')
    if (!hasSupabaseConfig || !supabase) {
      setPasswordChangeMessage('Wachtwoord wijzigen werkt alleen in online mode.')
      return
    }
    const rule = validatePasswordStrength(newPassword)
    if (!rule.valid) {
      setPasswordChangeMessage(
        'Gebruik minimaal 10 tekens met hoofdletter, kleine letter, cijfer en symbool, zonder spaties.'
      )
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeMessage('De wachtwoorden komen niet overeen.')
      return
    }
    setPasswordChangeBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordChangeMessage('Wachtwoord bijgewerkt.')
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (error) {
      setPasswordChangeMessage(mapPasswordUpdateError(error))
    } finally {
      setPasswordChangeBusy(false)
    }
  }

  if (isEditing) {
    return (
      <section className="space-y-4">
        <article className="rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-zinc-400">Profiel bewerken</p>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
            >
              Sluiten
            </button>
          </div>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm text-zinc-300">
              Profielfoto uploaden
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
                className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-100"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Weergavenaam
              <input
                value={form.displayName}
                onChange={handleChange('displayName')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Bijv. Alex de Vries"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Gebruikersnaam
              <input
                value={form.username}
                onChange={handleChange('username')}
                disabled={usernameFrozen}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2 disabled:cursor-not-allowed disabled:border-white/5 disabled:text-zinc-500"
                placeholder="Bijv. alexbeats"
                autoCapitalize="off"
                autoCorrect="off"
              />
              <p className="mt-1 text-xs text-zinc-500">
                {usernameFrozen
                  ? 'Je gebruikersnaam kun je maar één keer kiezen; die staat nu vast.'
                  : 'Je kunt nog een gebruikersnaam instellen van minimaal 3 tekens.'}
              </p>
            </label>
            <label className="block text-sm text-zinc-300">
              Bio
              <textarea
                rows={3}
                value={form.bio}
                onChange={handleChange('bio')}
                className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Waar ga jij muzikaal op aan?"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Favoriete genres
              <input
                value={form.favoriteGenres}
                onChange={handleChange('favoriteGenres')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Bijv. House, Techno, Indie Dance"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Favoriete artiesten
              <input
                value={form.favoriteArtists}
                onChange={handleChange('favoriteArtists')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Bijv. BICEP, The Blaze"
              />
              {favoriteArtistSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {favoriteArtistSuggestions.map((artist) => (
                    <button
                      key={`favorite-artist-suggestion-${artist}`}
                      type="button"
                      onClick={() => applyFavoriteArtistSuggestion(artist)}
                      className="rounded-full border border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-sky-400/70 hover:text-sky-200"
                    >
                      {artist}
                    </button>
                  ))}
                </div>
              )}
            </label>
            <label className="block text-sm text-zinc-300">
              Stad
              <input
                value={form.city}
                onChange={handleChange('city')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Bijv. Amsterdam"
                list="lyyve-city-suggestions"
              />
              <datalist id="lyyve-city-suggestions">
                {citySuggestions.map((city) => (
                  <option key={`city-suggestion-${city}`} value={city} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm text-zinc-300">
              Straal voor events ontdekken ({Number(form.eventRadiusKm ?? 75)} km)
              <input
                type="range"
                min="25"
                max="250"
                step="25"
                value={Number(form.eventRadiusKm ?? 75)}
                onChange={(event) => setForm((prev) => ({ ...prev, eventRadiusKm: Number(event.target.value) }))}
                className="mt-1 w-full accent-cyan-400"
              />
            </label>
            <button
              type="submit"
              disabled={!hasChanges || saveState === 'saving'}
              className="w-full rounded-xl bg-gradient-to-r from-rose-500 via-fuchsia-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === 'saving' ? 'Opslaan...' : 'Profiel opslaan'}
            </button>
            {saveState === 'saved' && <p className="text-xs text-emerald-300">Profiel opgeslagen.</p>}
            {saveError && <p className="text-xs text-amber-300">{saveError}</p>}
          </form>
        </article>
      </section>
    )
  }

  if (selectedFriend && friendStats) {
    const unlockedFriendBadges = selectedFriendBadges.filter((badge) => badge.unlocked)
    const isFollowingSelectedFriend = followingIds.includes(selectedFriend.id)
    return (
      <section className="space-y-4">
        <article className="rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedFriendId('')}
              className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
            >
              Terug
            </button>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Profiel</p>
          </div>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {selectedFriend.displayName}
            <span className="text-cyan-300">.</span>
          </h2>
          <p className="mt-1 text-sm text-zinc-400">@{selectedFriend.username}</p>
          <p className="mt-3 text-sm text-zinc-300">{selectedFriend.bio}</p>
          <ProfileTasteReadout
            favoriteGenres={selectedFriend.favoriteGenres}
            favoriteArtists={selectedFriend.favoriteArtists}
            className="mt-3"
          />
          <button
            type="button"
            onClick={() => toggleFollow(selectedFriend.id)}
            className={`mt-3 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              isFollowingSelectedFriend
                ? 'border-white/20 bg-zinc-950/60 text-zinc-200 hover:border-white/35'
                : 'border-cyan-300/40 bg-cyan-500/20 text-cyan-100 hover:border-cyan-300/60'
            }`}
          >
            {isFollowingSelectedFriend ? 'Volgend' : 'Volgen'}
          </button>

          {unlockedFriendBadges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {unlockedFriendBadges.map((badge) => (
                <span
                  key={`friend-header-badge-${badge.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-300/45 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-100"
                >
                  <span aria-hidden="true">{getBadgeEmoji(badge.id)}</span>
                  {badge.name}
                </span>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-white/10 bg-zinc-900/65 p-4 shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setFriendStatsView('checkins')}
              className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center hover:border-white/20"
            >
              <p className="text-sm font-semibold text-white">{friendStats.total}</p>
              <p className="text-[11px] text-zinc-400">Check-ins</p>
            </button>
            <button
              type="button"
              onClick={() => setFriendStatsView('artists')}
              className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center hover:border-white/20"
            >
              <p className="text-sm font-semibold text-white">{friendStats.uniqueArtists}</p>
              <p className="text-[11px] text-zinc-400">Artiesten</p>
            </button>
            <button
              type="button"
              onClick={() => setFriendStatsView('places')}
              className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center hover:border-white/20"
            >
              <p className="text-sm font-semibold text-white">{friendStats.uniquePlaces}</p>
              <p className="text-[11px] text-zinc-400">Plekken</p>
            </button>
            <button
              type="button"
              onClick={() => setFriendStatsView('ratings')}
              className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center hover:border-white/20"
            >
              <p className="text-sm font-semibold text-rose-300">{friendStats.average}</p>
              <p className="text-[11px] text-zinc-400">Gemiddeld</p>
            </button>
          </div>
        </article>

        <article className="space-y-3 rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
          <p className="text-sm font-semibold text-zinc-200">Persoonlijke feed</p>
          <div className="space-y-3">
            {(selectedFriend.checkIns ?? [])
              .slice()
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((item) => (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60">
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.artist}</p>
                        <p className="text-xs text-zinc-400">{item.venue}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString('nl-NL', {
                                day: 'numeric',
                                month: 'short',
                              })
                            : 'Net toegevoegd'}
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300">
                        {item.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-300">{item.note}</p>
                  </div>
                  {(item.photoDataUrls?.length || item.photoDataUrl || item.photo_url) && (
                    <div className="overflow-hidden border-t border-white/10 bg-zinc-950/40">
                      <PhotoCarousel
                        photos={item.photoDataUrls?.length ? item.photoDataUrls : [item.photoDataUrl || item.photo_url]}
                        altBase={`${item.artist} check-in`}
                      />
                    </div>
                  )}
                  <div className="border-t border-white/10 p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleLike(item.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                          getInteraction(item.id).likedByMe
                            ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-200'
                            : 'border-white/15 bg-zinc-900/80 text-zinc-300 hover:border-white/30'
                        }`}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
                          <path
                            d="M12 20.5s-6.5-3.9-9.1-8C1.2 9.7 2.2 6.5 5.4 5.6c2-.5 3.8.3 4.9 2 1.1-1.7 2.9-2.5 4.9-2 3.2.9 4.2 4.1 2.5 6.9-2.6 4.1-9.1 8-9.1 8z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill={getInteraction(item.id).likedByMe ? 'currentColor' : 'none'}
                          />
                        </svg>
                        {getInteraction(item.id).likeCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCommentPanel(item.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                          openComments[item.id]
                            ? 'border-sky-300/55 bg-sky-500/20 text-sky-200'
                            : 'border-white/15 bg-zinc-900/80 text-zinc-300 hover:border-white/30'
                        }`}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                          <path
                            d="M7 10h10M7 14h6m-5 7l-4 2 1-5a8 8 0 1 1 2.3 2.3z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {getInteraction(item.id).comments.length}
                      </button>
                    </div>
                    {openComments[item.id] && (
                      <div className="mt-3 space-y-2">
                        <div className="space-y-1.5">
                          {getInteraction(item.id).comments.length === 0 && (
                            <p className="text-xs text-zinc-500">Nog geen reacties. Wees de eerste.</p>
                          )}
                          {getInteraction(item.id).comments.map((comment) => (
                            <p key={comment.id} className="text-xs text-zinc-300">
                              <span className="font-semibold text-white">{comment.user}:</span> {comment.text}
                            </p>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            value={commentDrafts[item.id] ?? ''}
                            onChange={(event) =>
                              setCommentDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))
                            }
                            placeholder="Plaats een reactie..."
                            className="w-full rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                          />
                          <button
                            type="button"
                            onClick={() => addComment(item.id)}
                            className="rounded-xl border border-sky-400/35 bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-200 hover:border-sky-300/60"
                          >
                            Plaats
                          </button>
                        </div>
                        {commentErrors[item.id] && <p className="text-xs text-amber-300">{commentErrors[item.id]}</p>}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            {(selectedFriend.checkIns ?? []).length === 0 && (
              <p className="text-xs text-zinc-500">Nog geen check-ins van deze gebruiker.</p>
            )}
          </div>
        </article>

        {friendStatsView && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm">
            <article className="flex max-h-[78svh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/15 bg-zinc-900/95 shadow-2xl shadow-fuchsia-500/20">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h3 className="text-lg font-semibold text-white">
                  {friendStatsView === 'checkins'
                    ? 'Check-ins'
                    : friendStatsView === 'artists'
                      ? 'Artiesten'
                      : friendStatsView === 'places'
                        ? 'Plekken'
                        : 'Ratings'}
                </h3>
                <button
                  type="button"
                  onClick={() => setFriendStatsView('')}
                  className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
                >
                  Sluiten
                </button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {friendStatsView === 'checkins' &&
                  (selectedFriend.checkIns ?? []).map((item) => (
                    <div key={`fs-checkin-${item.id}`} className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2">
                      <p className="text-sm font-semibold text-white">{item.artist}</p>
                      <p className="text-xs text-zinc-400">{item.venue}</p>
                    </div>
                  ))}
                {friendStatsView === 'artists' &&
                  selectedFriendArtists.map((artist) => (
                    <div key={`fs-artist-${artist}`} className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2">
                      <p className="text-sm font-semibold text-white">{artist}</p>
                    </div>
                  ))}
                {friendStatsView === 'places' &&
                  selectedFriendPlaces.map((place) => (
                    <div key={`fs-place-${place}`} className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2">
                      <p className="text-sm font-semibold text-white">{place}</p>
                    </div>
                  ))}
                {friendStatsView === 'ratings' &&
                  (selectedFriend.checkIns ?? []).map((item) => (
                    <div
                      key={`fs-rating-${item.id}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-white">{item.artist}</p>
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">
                        {item.rating.toFixed(1)}
                      </span>
                    </div>
                  ))}
              </div>
            </article>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <article className="rounded-3xl border border-fuchsia-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-zinc-950 text-lg font-semibold text-zinc-100">
            {form.avatarUrl ? (
              <img src={form.avatarUrl} alt="Profielfoto" className="h-full w-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div>
            <p className="text-sm text-zinc-400">@{form.username || 'jouwnaam'}</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">
              {form.displayName || 'Jouw naam'}
              <span className="text-cyan-300">.</span>
            </h2>
            {unlockedBadgeHighlights.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unlockedBadgeHighlights.slice(0, 4).map((badge) => (
                  <span
                    key={`header-badge-${badge.id}`}
                    className="inline-flex items-center gap-1 rounded-full border border-cyan-300/45 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100"
                  >
                    <span aria-hidden="true">{getBadgeEmoji(badge.id)}</span>
                    {badge.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-300">{form.bio || 'Voeg een korte bio toe.'}</p>
        <ProfileTasteReadout favoriteGenres={form.favoriteGenres} favoriteArtists={form.favoriteArtists} className="mt-3" />
        {forceProfileCompletion && (
          <p className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Maak je profiel compleet (naam, gebruikersnaam en favorieten) om alles uit Lyyve te halen.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-xl border border-white/15 bg-zinc-950/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/30"
          >
            Profiel bewerken
          </button>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-xl border border-white/15 bg-zinc-950/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/30"
            >
              Uitloggen
            </button>
          )}
        </div>
        {onDeleteAccount && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onDeleteAccount()}
              className="text-[11px] text-zinc-500 underline-offset-2 transition hover:text-red-400/90 hover:underline"
            >
              Account verwijderen
            </button>
          </div>
        )}
      </article>

      {hasSupabaseConfig && supabase && (
        <article className="rounded-3xl border border-emerald-300/25 bg-zinc-900/65 p-4 shadow-lg shadow-emerald-500/10 backdrop-blur-xl">
          <h3 className="text-base font-semibold text-white">
            Beveiliging<span className="text-emerald-300">.</span>
          </h3>
          <p className="mt-2 text-xs text-zinc-400">Stel een nieuw inlogwachtwoord in (alleen dit app-account).</p>
          <form className="mt-3 space-y-3" onSubmit={handlePasswordUpdate}>
            <label className="block text-sm text-zinc-300">
              Nieuw wachtwoord
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value)
                  setPasswordChangeMessage('')
                }}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-emerald-400/80 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Min. 10 tekens, hoofd-/kleine letter…"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              Bevestig wachtwoord
              <input
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(event) => {
                  setConfirmNewPassword(event.target.value)
                  setPasswordChangeMessage('')
                }}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-emerald-400/80 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Herhaal wachtwoord"
              />
            </label>
            <button
              type="submit"
              disabled={passwordChangeBusy || !newPassword.trim() || !confirmNewPassword.trim()}
              className="w-full rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/65 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {passwordChangeBusy ? 'Bezig…' : 'Wachtwoord opslaan'}
            </button>
            {passwordChangeMessage && (
              <p className="text-xs text-zinc-300">{passwordChangeMessage}</p>
            )}
          </form>
        </article>
      )}

      <article className="rounded-3xl border border-white/10 bg-zinc-900/65 p-4 shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-6">
          <button
            type="button"
            onClick={() => setRelationView('followers')}
            className="text-left"
          >
            <p className="text-lg font-semibold text-white">{followers.length}</p>
            <p className="text-xs text-zinc-400">Volgers</p>
          </button>
          <button
            type="button"
            onClick={() => setRelationView('following')}
            className="text-left"
          >
            <p className="text-lg font-semibold text-white">{following.length}</p>
            <p className="text-xs text-zinc-400">Volgend</p>
          </button>
          <button
            type="button"
            onClick={() => setRelationView('checkins')}
            className="text-left"
          >
            <p className="text-lg font-semibold text-white">{checkIns.length}</p>
            <p className="text-xs text-zinc-400">Check-ins</p>
          </button>
        </div>
        <p className="text-xs text-zinc-500">Klik op Volgers, Volgend of Check-ins om te openen.</p>
      </article>

      <article className="rounded-3xl border border-cyan-300/20 bg-zinc-900/65 p-4 shadow-lg shadow-cyan-500/10 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Vrienden zoeken</h3>
          <p className="text-xs text-zinc-400">{friendSearchResults.length} resultaten</p>
        </div>
        <input
          value={friendSearchQuery}
          onChange={(event) => setFriendSearchQuery(event.target.value)}
          placeholder="Zoek op naam of @username"
          className="w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
        />
        <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
          {friendSearchResults.map((friend) => {
            const isFollowingFriend = followingIds.includes(friend.id)
            return (
              <div
                key={`search-friend-${friend.id}`}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2"
              >
                <button type="button" onClick={() => setSelectedFriendId(friend.id)} className="text-left">
                  <p className="text-sm font-semibold text-white">{friend.displayName}</p>
                  <p className="text-xs text-zinc-400">@{friend.username}</p>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFollow(friend.id)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                    isFollowingFriend
                      ? 'border-white/20 text-zinc-300 hover:border-white/35'
                      : 'border-cyan-300/40 text-cyan-200 hover:border-cyan-300/60'
                  }`}
                >
                  {isFollowingFriend ? 'Volgend' : 'Volgen'}
                </button>
              </div>
            )
          })}
          {friendSearchResults.length === 0 && (
            <p className="text-xs text-zinc-500">Geen vrienden gevonden voor deze zoekterm.</p>
          )}
        </div>
      </article>

      <article className="rounded-3xl border border-cyan-300/20 bg-zinc-900/65 p-4 shadow-lg shadow-cyan-500/10 backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Badges</h3>
          <p className="text-xs text-zinc-400">
            {badges.filter((badge) => badge.unlocked).length}/{badges.length}
          </p>
        </div>
        <div className="space-y-2">
          {compactBadgeCards.map(({ group, displayBadge, unlockedInGroup, totalInGroup }) => {
            const completion = Math.min(
              100,
              Math.round((displayBadge.progress / Math.max(1, displayBadge.threshold)) * 100)
            )
            return (
              <button
                key={`compact-badge-${group}`}
                type="button"
                onClick={() => setBadgeDetailGroup(group)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  displayBadge.unlocked
                    ? 'border-emerald-300/35 bg-gradient-to-r from-emerald-500/12 to-cyan-500/12'
                    : 'border-white/10 bg-zinc-950/60 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">
                    <span className="mr-1.5" aria-hidden="true">
                      {getBadgeEmoji(displayBadge.id)}
                    </span>
                    {getBadgeGroupLabel(group)}
                  </p>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                    {unlockedInGroup}/{totalInGroup}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-300">
                  Volgende: <span className="font-semibold">{displayBadge.name}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-500">{displayBadge.description}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400/80 to-fuchsia-400/80"
                    style={{ width: `${completion}%` }}
                  />
                </div>
              </button>
            )
          })}
          {compactBadgeCards.length === 0 && <p className="text-xs text-zinc-500">Nog geen badges berekend.</p>}
        </div>
      </article>

      {selectedFriend && friendStats && (
        <article className="space-y-3 rounded-3xl border border-sky-400/20 bg-zinc-900/65 p-4 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">{selectedFriend.displayName}</h3>
              <p className="text-xs text-zinc-400">@{selectedFriend.username}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFriendId('')}
              className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
            >
              Sluiten
            </button>
          </div>

          <p className="text-sm text-zinc-300">{selectedFriend.bio}</p>
          <ProfileTasteReadout
            favoriteGenres={selectedFriend.favoriteGenres}
            favoriteArtists={selectedFriend.favoriteArtists}
            className="mt-2"
          />
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-white">{friendStats.total}</p>
              <p className="text-[11px] text-zinc-400">Check-ins</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-white">{friendStats.uniqueArtists}</p>
              <p className="text-[11px] text-zinc-400">Artiesten</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-white">{friendStats.uniquePlaces}</p>
              <p className="text-[11px] text-zinc-400">Plekken</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-center">
              <p className="text-sm font-semibold text-rose-300">{friendStats.average}</p>
              <p className="text-[11px] text-zinc-400">Gemiddeld</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-200">Timeline</p>
            <div className="max-h-[50svh] space-y-3 overflow-y-auto pr-1">
              {(selectedFriend.checkIns ?? [])
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60">
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{item.artist}</p>
                          <p className="text-xs text-zinc-400">{item.venue}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleDateString('nl-NL', {
                                  day: 'numeric',
                                  month: 'short',
                                })
                              : 'Net toegevoegd'}
                          </p>
                        </div>
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300">
                          {item.rating.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-300">{item.note}</p>
                    </div>
                    <div className="border-t border-white/10 p-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleLike(item.id)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                            getInteraction(item.id).likedByMe
                              ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-200'
                              : 'border-white/15 bg-zinc-900/80 text-zinc-300 hover:border-white/30'
                          }`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
                            <path
                              d="M12 20.5s-6.5-3.9-9.1-8C1.2 9.7 2.2 6.5 5.4 5.6c2-.5 3.8.3 4.9 2 1.1-1.7 2.9-2.5 4.9-2 3.2.9 4.2 4.1 2.5 6.9-2.6 4.1-9.1 8-9.1 8z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill={getInteraction(item.id).likedByMe ? 'currentColor' : 'none'}
                            />
                          </svg>
                          {getInteraction(item.id).likeCount}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCommentPanel(item.id)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                            openComments[item.id]
                              ? 'border-sky-300/55 bg-sky-500/20 text-sky-200'
                              : 'border-white/15 bg-zinc-900/80 text-zinc-300 hover:border-white/30'
                          }`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                            <path
                              d="M7 10h10M7 14h6m-5 7l-4 2 1-5a8 8 0 1 1 2.3 2.3z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {getInteraction(item.id).comments.length}
                        </button>
                      </div>
                      {openComments[item.id] && (
                        <div className="mt-3 space-y-2">
                          <div className="space-y-1.5">
                            {getInteraction(item.id).comments.length === 0 && (
                              <p className="text-xs text-zinc-500">Nog geen reacties. Wees de eerste.</p>
                            )}
                            {getInteraction(item.id).comments.map((comment) => (
                              <p key={comment.id} className="text-xs text-zinc-300">
                                <span className="font-semibold text-white">{comment.user}:</span> {comment.text}
                              </p>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              value={commentDrafts[item.id] ?? ''}
                              onChange={(event) =>
                                setCommentDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))
                              }
                              placeholder="Plaats een reactie..."
                              className="w-full rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                            />
                            <button
                              type="button"
                              onClick={() => addComment(item.id)}
                              className="rounded-xl border border-sky-400/35 bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-200 hover:border-sky-300/60"
                            >
                              Plaats
                            </button>
                          </div>
                          {commentErrors[item.id] && <p className="text-xs text-amber-300">{commentErrors[item.id]}</p>}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              {(selectedFriend.checkIns ?? []).length === 0 && (
                <p className="text-xs text-zinc-500">Nog geen check-ins van deze gebruiker.</p>
              )}
            </div>
          </div>
        </article>
      )}

      {badgeDetailGroup && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm">
          <article className="flex max-h-[78svh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/15 bg-zinc-900/95 shadow-2xl shadow-fuchsia-500/20">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="text-lg font-semibold text-white">{getBadgeGroupLabel(badgeDetailGroup)}</h3>
              <button
                type="button"
                onClick={() => setBadgeDetailGroup('')}
                className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
              >
                Sluiten
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {(groupedBadges.find((item) => item.group === badgeDetailGroup)?.badges ?? []).map((badge) => {
                const percent = globalBadgePercentages[badge.id] ?? localBadgePercentages[badge.id] ?? 0
                const progressPercent = Math.min(100, Math.round((badge.progress / Math.max(1, badge.threshold)) * 100))
                return (
                  <div
                    key={`badge-detail-${badge.id}`}
                    className={`rounded-xl border p-3 ${
                      badge.unlocked
                        ? 'border-emerald-300/35 bg-gradient-to-r from-emerald-500/12 to-cyan-500/12'
                        : 'border-white/10 bg-zinc-950/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">
                        <span className="mr-1.5" aria-hidden="true">
                          {getBadgeEmoji(badge.id)}
                        </span>
                        {badge.name}
                      </p>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                        {badge.unlocked ? 'Unlocked' : `${badge.progress}/${badge.threshold}`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">{badge.description}</p>
                    <p className="mt-1 text-[11px] text-cyan-200">Ongeveer {percent}% van zichtbare Lyyve-gebruikers heeft deze badge.</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400/80 to-fuchsia-400/80"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
        </div>
      )}

      {relationView && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm">
          <article className="flex max-h-[78svh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/15 bg-zinc-900/95 shadow-2xl shadow-fuchsia-500/20">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="text-lg font-semibold text-white">
                {relationView === 'followers' ? 'Volgers' : relationView === 'following' ? 'Volgend' : 'Mijn check-ins'}
              </h3>
              <button
                type="button"
                onClick={() => setRelationView('')}
                className="rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-white/30"
              >
                Sluiten
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {(relationView === 'followers' || relationView === 'following') && (
                <input
                  value={relationSearchQuery}
                  onChange={(event) => setRelationSearchQuery(event.target.value)}
                  placeholder="Zoek vriend..."
                  className="mb-2 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs text-white outline-none ring-sky-400 placeholder:text-zinc-500 focus:ring-2"
                />
              )}
              {relationView === 'checkins'
                ? checkIns.map((item) => (
                    <div
                      key={`my-checkin-${item.id}`}
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-white">{item.artist}</p>
                      <p className="text-xs text-zinc-400">{item.venue}</p>
                    </div>
                  ))
                : (relationView === 'followers' ? followers : following)
                    .filter((person) => {
                      const query = relationSearchQuery.trim().toLowerCase()
                      if (!query) return true
                      return (
                        person.displayName.toLowerCase().includes(query) ||
                        person.username.toLowerCase().includes(query)
                      )
                    })
                    .map((person) => (
                    <button
                      key={`${relationView}-${person.id}`}
                      type="button"
                      onClick={() => {
                        setSelectedFriendId(person.id)
                        setRelationView('')
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-left hover:border-white/20"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{person.displayName}</p>
                        <p className="text-xs text-zinc-400">@{person.username}</p>
                      </div>
                      <span className="text-xs text-zinc-500">{person.city}</span>
                    </button>
                  ))}
            </div>
          </article>
        </div>
      )}

    </section>
  )
}
