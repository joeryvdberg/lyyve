import { useEffect, useMemo, useState } from 'react'
import { Turnstile } from 'react-turnstile'
import { getCatalogEntries } from '../../lib/db'
import { hasSupabaseConfig, supabase } from '../../lib/supabase'

function validatePassword(value) {
  const minLength = value.length >= 10
  const hasLower = /[a-z]/.test(value)
  const hasUpper = /[A-Z]/.test(value)
  const hasNumber = /\d/.test(value)
  const hasSpecial = /[^A-Za-z0-9]/.test(value)
  const hasNoWhitespace = !/\s/.test(value)
  const valid = minLength && hasLower && hasUpper && hasNumber && hasSpecial && hasNoWhitespace
  return { valid, minLength, hasLower, hasUpper, hasNumber, hasSpecial, hasNoWhitespace }
}

function getAuthRedirectUrl() {
  const fallbackPath = import.meta.env.BASE_URL && import.meta.env.BASE_URL !== './'
    ? import.meta.env.BASE_URL
    : window.location.pathname
  return new URL(fallbackPath, window.location.origin).toString()
}

function getAuthMessageFromUrl() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  const hashParams = new URLSearchParams(hash)
  const searchParams = new URLSearchParams(window.location.search)
  const errorCode = hashParams.get('error_code') || searchParams.get('error_code') || ''
  const errorDescription = hashParams.get('error_description') || searchParams.get('error_description') || ''

  if (!errorCode && !errorDescription) return ''

  const normalized = `${errorCode} ${errorDescription}`.toLowerCase()
  if (normalized.includes('otp_expired') || normalized.includes('expired')) {
    return 'Deze link is verlopen. Vraag een nieuwe reset- of bevestigingsmail aan.'
  }
  if (normalized.includes('already') || normalized.includes('used')) {
    return 'Deze link is al gebruikt. Vraag een nieuwe link aan als dat nodig is.'
  }
  if (normalized.includes('invalid')) {
    return 'De link is ongeldig. Probeer opnieuw of vraag een nieuwe mail aan.'
  }
  return 'De authenticatielink kon niet verwerkt worden. Probeer opnieuw.'
}

function mapAuthErrorMessage(error, fallbackMessage = 'Inloggen mislukt.') {
  const raw = String(error?.message || '').toLowerCase()
  const status =
    typeof error?.status === 'number'
      ? error.status
      : typeof error?.code === 'number'
        ? error.code
        : null
  if (
    raw.includes('user already registered') ||
    raw.includes('already registered') ||
    raw.includes('already exists') ||
    raw.includes('email address is already in use')
  ) {
    return 'Dit e-mailadres is al in gebruik. Gebruik inloggen of wachtwoord vergeten.'
  }
  if (
    raw.includes('invalid login credentials') ||
    raw.includes('invalid grant') ||
    raw.includes('invalid_credentials')
  ) {
    return 'Onjuiste inloggegevens. Tip: kopieer e-mail en wachtwoord zonder extra spaties. Account via Google? Gebruik “Ga verder met Google”: dan gebruik je geen wachtwoord voor dit e‑mail loginveld.'
  }
  if (
    raw.includes('too many requests') ||
    raw.includes('rate limit') ||
    raw.includes('over_email_send_rate_limit') ||
    raw.includes('over_request_rate_limit') ||
    raw.includes('email rate limit') ||
    status === 429
  ) {
    return (
      'Te veel e-mailverzoeken in korte tijd (limiet bij Supabase of je SMTP). ' +
      'Wacht zo’n 30–60 minuten en vraag daarna nog één keer een mail aan. ' +
      'Kijk ook in spam/promoties.'
    )
  }
  if (raw.includes('email not confirmed') || raw.includes('email_not_confirmed')) {
    return 'Je e-mailadres is nog niet bevestigd. Check je inbox of klik op resend confirmation.'
  }
  if (raw.includes('captcha')) {
    return 'Captcha verificatie mislukt. Probeer opnieuw.'
  }
  if (raw.includes('smtp') || raw.includes('delivery') || raw.includes('mail_provider')) {
    return 'Kon de mail tijdelijk niet versturen. Probeer het later opnieuw; bij aanhouden: controleer Supabase Auth‑logs en je SMTP‑instellingen.'
  }
  if (error?.message && String(error.message).trim()) return error.message
  return fallbackMessage
}

function normalizeUsername(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '')
}

const GENRE_OPTIONS = [
  'House',
  'Techno',
  'Indie Dance',
  'Drum & Bass',
  'Hip-Hop',
  'Pop',
  'Rock',
  'Afro',
  'Trance',
  'Hardstyle',
  'Disco',
  'Latin',
  'R&B',
  'Soul',
  'Ambient',
  'Jazz',
  'Funk',
  'Afrobeats',
  'UK Garage',
  'Melodic Techno',
]

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getArtistLabel(value) {
  return typeof value === 'string' ? value : value?.name ?? ''
}

function mergeArtistsByName(primary, secondary) {
  const map = new Map()
  for (const item of [...primary, ...secondary]) {
    const name = getArtistLabel(item).trim()
    if (!name) continue
    const key = normalizeText(name)
    if (!map.has(key)) {
      map.set(key, item)
    }
  }
  return [...map.values()]
}

export default function AuthScreen({ forceReset = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [city, setCity] = useState('')
  const [favoriteGenres, setFavoriteGenres] = useState('')
  const [favoriteArtists, setFavoriteArtists] = useState('')
  const [mode, setMode] = useState(forceReset ? 'reset' : 'login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('')
  const [artistPool, setArtistPool] = useState([])
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaWidgetNonce, setCaptchaWidgetNonce] = useState(0)
  const urlAuthMessage = getAuthMessageFromUrl()
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
  const captchaEnabled = Boolean(turnstileSiteKey)
  const favoriteArtistSuggestions = useMemo(() => {
    if (mode !== 'signup') return []
    const raw = String(favoriteArtists || '')
    const segments = raw.split(',')
    const token = normalizeText(segments[segments.length - 1] || '')
    if (!token) return []

    const selected = new Set(segments.map((entry) => normalizeText(entry)).filter(Boolean))
    return artistPool
      .map((item) => getArtistLabel(item).trim())
      .filter(Boolean)
      .filter((name) => normalizeText(name).includes(token))
      .filter((name) => !selected.has(normalizeText(name)))
      .slice(0, 8)
  }, [artistPool, favoriteArtists, mode])

  useEffect(() => {
    let mounted = true
    async function loadArtistPool() {
      if (mode !== 'signup') return
      try {
        const [response, communityArtists] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}artists.json`),
          getCatalogEntries('artist'),
        ])
        if (!response.ok || !mounted) return
        const data = await response.json()
        const baseArtists = Array.isArray(data.artists) ? data.artists : []
        if (mounted) setArtistPool(mergeArtistsByName(communityArtists, baseArtists))
      } catch {
        // Keep signup usable when artist dataset fails.
      }
    }
    loadArtistPool()
    return () => {
      mounted = false
    }
  }, [mode])

  useEffect(() => {
    if (!forceReset) return
    setMode('reset')
    setPendingVerificationEmail('')
    setPasswordError('')
  }, [forceReset])

  function consumeCaptchaToken() {
    setCaptchaToken('')
    setCaptchaWidgetNonce((prev) => prev + 1)
  }

  function getCaptchaTokenOrThrow(actionLabel) {
    if (!captchaEnabled) return ''
    if (captchaToken) return captchaToken
    throw new Error(`Bevestig eerst de captcha om ${actionLabel}.`)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!hasSupabaseConfig || !supabase) return

    setLoading(true)
    setMessage('')
    setPasswordError('')
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const normalizedUsername = normalizeUsername(username)
      const redirectTo = getAuthRedirectUrl()
      const captchaTokenForRequest =
        mode === 'reset' ? '' : getCaptchaTokenOrThrow(mode === 'signup' ? 'je account aan te maken' : 'in te loggen')
      if (mode === 'signup' || mode === 'reset') {
        const ruleCheck = validatePassword(password)
        if (!ruleCheck.valid) {
          setPasswordError(
            'Wachtwoord moet min. 10 tekens hebben, met hoofdletter, kleine letter, cijfer, symbool en zonder spaties.'
          )
          setLoading(false)
          return
        }
        if (password !== confirmPassword) {
          setPasswordError('Wachtwoorden komen niet overeen.')
          setLoading(false)
          return
        }
      }

      if (mode === 'signup') {
        if (displayName.trim().length < 2) {
          setMessage('Vul een weergavenaam in van minimaal 2 tekens.')
          setLoading(false)
          return
        }
        if (normalizedUsername.length < 3) {
          setMessage('Kies een gebruikersnaam van minimaal 3 tekens.')
          setLoading(false)
          return
        }
      }

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            captchaToken: captchaTokenForRequest,
            emailRedirectTo: redirectTo,
            data: {
              username: normalizedUsername,
              display_name: displayName.trim(),
              city: city.trim(),
              favorite_genres: favoriteGenres.trim(),
              favorite_artists: favoriteArtists.trim(),
            },
          },
        })
        if (error) throw error
        setPendingVerificationEmail(normalizedEmail)
        setPassword('')
        setConfirmPassword('')
        setDisplayName('')
        setUsername('')
        setCity('')
        setFavoriteGenres('')
        setFavoriteArtists('')
        setMessage('')
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        await supabase.auth.signOut()
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setMessage('Wachtwoord aangepast. Log nu opnieuw in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
          options: { captchaToken: captchaTokenForRequest },
        })
        if (error) throw error
        setMessage('Welkom terug.')
      }
      if (captchaEnabled && mode !== 'reset') {
        consumeCaptchaToken()
      }
    } catch (error) {
      setMessage(mapAuthErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!hasSupabaseConfig || !supabase) return
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setMessage('Vul eerst je e-mail in en klik daarna opnieuw op wachtwoord vergeten.')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const redirectTo = getAuthRedirectUrl()
      const captchaTokenForRequest = getCaptchaTokenOrThrow('een resetmail te versturen')
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo,
        captchaToken: captchaTokenForRequest,
      })
      if (error) throw error
      setMessage(
        'Staat bij dit adres een account met wachtwoord? Dan wordt een resetmail gestuurd (kan een paar minuten duren); check ook spam/promoties. ' +
          'Alleen via Google gemeld? Probeer eerst “Ga verder met Google”. Meerdere mails achter elkaar? Er geldt een limiet—wacht 30–60 min en probeer opnieuw.'
      )
      if (captchaEnabled) {
        consumeCaptchaToken()
      }
    } catch (error) {
      setMessage(mapAuthErrorMessage(error, 'Resetmail versturen mislukt.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleOAuthSignIn(provider) {
    if (!hasSupabaseConfig || !supabase) return

    setLoading(true)
    setMessage('')
    try {
      const redirectTo = getAuthRedirectUrl()
      const captchaTokenForRequest = getCaptchaTokenOrThrow('door te gaan met Google')
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, captchaToken: captchaTokenForRequest },
      })
      if (error) throw error
      if (captchaEnabled) {
        consumeCaptchaToken()
      }
    } catch (error) {
      setMessage(error?.message || 'OAuth inloggen mislukt.')
      setLoading(false)
    }
  }

  async function handleResendConfirmation() {
    if (!hasSupabaseConfig || !supabase) return
    const trimmedEmail = (pendingVerificationEmail || email).trim()
    if (!trimmedEmail) {
      setMessage('Vul eerst je e-mail in en klik daarna opnieuw op resend confirmation.')
      return
    }

    setResendLoading(true)
    setMessage('')
    try {
      const emailRedirectTo = getAuthRedirectUrl()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: trimmedEmail,
        options: { emailRedirectTo },
      })
      if (error) throw error
      setMessage('Bevestigingsmail opnieuw verstuurd. Check je inbox en spamfolder.')
    } catch (error) {
      setMessage(mapAuthErrorMessage(error, 'Bevestigingsmail opnieuw versturen mislukt.'))
    } finally {
      setResendLoading(false)
    }
  }

  function toggleGenre(genre) {
    setFavoriteGenres((prev) => {
      const parsed = prev
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      const exists = parsed.some((item) => item.toLowerCase() === genre.toLowerCase())
      if (exists) {
        return parsed.filter((item) => item.toLowerCase() !== genre.toLowerCase()).join(', ')
      }
      return [...parsed, genre].join(', ')
    })
  }

  function applyFavoriteArtistSuggestion(artistName) {
    setFavoriteArtists((prev) => {
      const raw = String(prev || '')
      const segments = raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
      if (!segments.length) return artistName
      segments[segments.length - 1] = artistName
      return `${segments.join(', ')}, `
    })
  }

  if (pendingVerificationEmail) {
    return (
      <div className="relative min-h-svh overflow-hidden bg-[#05020f] text-zinc-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#fb718544,transparent_42%),radial-gradient(circle_at_70%_20%,#8b5cf666,transparent_48%),radial-gradient(circle_at_20%_80%,#22d3ee33,transparent_44%)]" />
        <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-14">
          <img src={`${import.meta.env.BASE_URL}lyyve-logo-white-blue.png`} alt="Lyyve logo" className="mx-auto w-44" />
          <article className="mt-8 rounded-3xl border border-white/10 bg-zinc-900/70 p-5 shadow-2xl shadow-fuchsia-500/10 backdrop-blur-xl">
            <h1 className="text-2xl font-semibold text-white">
              Verifieer je e-mail<span className="text-cyan-300">.</span>
            </h1>
            <p className="mt-3 text-sm text-zinc-300">
              We hebben een verificatielink gestuurd naar <span className="font-semibold text-white">{pendingVerificationEmail}</span>.
              Open je mail en klik op de link om je account te activeren.
            </p>
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resendLoading || !hasSupabaseConfig}
                className="w-full rounded-xl border border-cyan-300/35 bg-cyan-500/20 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/70 disabled:opacity-60"
              >
                {resendLoading ? 'Bevestigingsmail versturen...' : 'Stuur verificatielink opnieuw'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingVerificationEmail('')
                  setMode('login')
                  setMessage('')
                }}
                className="w-full rounded-xl border border-white/15 bg-zinc-950/70 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              >
                Terug naar inloggen
              </button>
            </div>
            {message && <p className="mt-3 text-xs text-zinc-300">{message}</p>}
          </article>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#05020f] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#fb718544,transparent_42%),radial-gradient(circle_at_70%_20%,#8b5cf666,transparent_48%),radial-gradient(circle_at_20%_80%,#22d3ee33,transparent_44%)]" />
      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-14">
        <img src={`${import.meta.env.BASE_URL}lyyve-logo-white-blue.png`} alt="Lyyve logo" className="mx-auto w-44" />
        <article className="mt-8 rounded-3xl border border-white/10 bg-zinc-900/70 p-5 shadow-2xl shadow-fuchsia-500/10 backdrop-blur-xl">
          <h1 className="text-2xl font-semibold text-white">
            {mode === 'signup' ? 'Maak je account' : mode === 'reset' ? 'Nieuw wachtwoord' : 'Log in'}
            <span className="text-cyan-300">.</span>
          </h1>
          {mode === 'signup' && (
            <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950/60 p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-zinc-400">
                <span>Stap 1 van 2</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-rose-500 via-fuchsia-500 to-sky-500" />
              </div>
            </div>
          )}
          <p className="mt-2 text-sm text-zinc-400">
            {mode === 'reset'
              ? 'Kies een veilig nieuw wachtwoord om weer in te loggen.'
              : 'Je check-ins, likes en profiel worden veilig opgeslagen.'}
          </p>

          {!hasSupabaseConfig && (
            <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Voeg `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` toe aan je `.env`.
            </p>
          )}

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            {mode !== 'reset' && (
              <label className="block text-sm text-zinc-300">
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                  placeholder="jij@email.com"
                  required
                />
              </label>
            )}
            {mode === 'signup' && (
              <>
                <label className="block text-sm text-zinc-300">
                  Weergavenaam
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                    placeholder="Bijv. Alex de Vries"
                    required
                  />
                </label>
                <label className="block text-sm text-zinc-300">
                  Gebruikersnaam
                  <input
                    value={username}
                    onChange={(event) => setUsername(normalizeUsername(event.target.value))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                    placeholder="Bijv. alexbeats"
                    autoCapitalize="off"
                    autoCorrect="off"
                    required
                  />
                </label>
                <label className="block text-sm text-zinc-300">
                  Stad
                  <input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                    placeholder="Bijv. Amsterdam"
                  />
                  <p className="mt-1 text-xs text-zinc-500">Optioneel - gebruiken we om events in jouw buurt te tonen.</p>
                </label>
                <label className="block text-sm text-zinc-300">
                  Favoriete genres
                  <input
                    value={favoriteGenres}
                    onChange={(event) => setFavoriteGenres(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                    placeholder="Bijv. House, Techno"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {GENRE_OPTIONS.map((genre) => {
                      const isActive = favoriteGenres
                        .split(',')
                        .map((item) => item.trim().toLowerCase())
                        .includes(genre.toLowerCase())
                      return (
                        <button
                          key={`genre-option-${genre}`}
                          type="button"
                          onClick={() => toggleGenre(genre)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                            isActive
                              ? 'border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                              : 'border-white/10 bg-zinc-950 text-zinc-300 hover:border-cyan-300/40'
                          }`}
                        >
                          {genre}
                        </button>
                      )
                    })}
                  </div>
                </label>
                <label className="block text-sm text-zinc-300">
                  Favoriete artiesten
                  <input
                    value={favoriteArtists}
                    onChange={(event) => setFavoriteArtists(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                    placeholder="Bijv. BICEP, Fred again.."
                  />
                  {favoriteArtistSuggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {favoriteArtistSuggestions.map((artist) => (
                        <button
                          key={`signup-artist-suggestion-${artist}`}
                          type="button"
                          onClick={() => applyFavoriteArtistSuggestion(artist)}
                          className="rounded-full border border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-cyan-300/40 hover:text-cyan-100"
                        >
                          {artist}
                        </button>
                      ))}
                    </div>
                  )}
                </label>
              </>
            )}
            <label className="block text-sm text-zinc-300">
              Wachtwoord
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                placeholder="Minimaal 10 tekens"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={10}
                pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])(?=\S+$).{10,}$"
                title="Minimaal 10 tekens, met hoofdletter, kleine letter, cijfer, symbool en zonder spaties."
                spellCheck={false}
                required
              />
            </label>
            {(mode === 'signup' || mode === 'reset') && (
              <>
                <label className="block text-sm text-zinc-300">
                  Herhaal wachtwoord
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                    placeholder="Herhaal je wachtwoord"
                    autoComplete="new-password"
                    minLength={10}
                    pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])(?=\S+$).{10,}$"
                    title="Minimaal 10 tekens, met hoofdletter, kleine letter, cijfer, symbool en zonder spaties."
                    required
                  />
                </label>
                <p className="text-xs text-zinc-500">
                  Gebruik minimaal 10 tekens met hoofdletter, kleine letter, cijfer, symbool en zonder spaties.
                </p>
              </>
            )}
            {passwordError && <p className="text-xs text-amber-300">{passwordError}</p>}
            {mode === 'signup' && (
              <p className="text-xs text-zinc-500">Per e-mailadres is maar 1 account toegestaan.</p>
            )}
            {captchaEnabled && mode !== 'reset' && (
              <div className="space-y-1">
                <Turnstile
                  key={`turnstile-${mode}-${captchaWidgetNonce}`}
                  sitekey={turnstileSiteKey}
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken('')}
                  onError={() => setCaptchaToken('')}
                  theme="dark"
                />
                <p className="text-[11px] text-zinc-500">Bevestig captcha voordat je doorgaat.</p>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !hasSupabaseConfig || (captchaEnabled && mode !== 'reset' && !captchaToken)}
              className="w-full rounded-xl bg-gradient-to-r from-rose-500 via-fuchsia-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? 'Bezig...' : mode === 'signup' ? 'Account maken' : mode === 'reset' ? 'Wachtwoord opslaan' : 'Inloggen'}
            </button>
          </form>

          {mode !== 'reset' && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Of ga verder met Google</p>
              <button
                type="button"
                onClick={() => handleOAuthSignIn('google')}
                disabled={loading || !hasSupabaseConfig || (captchaEnabled && !captchaToken)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-zinc-950/70 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-white/30 disabled:opacity-60"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-zinc-900">
                  G
                </span>
                Google
              </button>
            </div>
          )}

          {mode !== 'reset' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode((prev) => (prev === 'signup' ? 'login' : 'signup'))
                  setMessage('')
                  setPasswordError('')
                }}
                className="mt-3 text-xs text-cyan-300 hover:text-cyan-200"
              >
                {mode === 'signup' ? 'Al een account? Log in' : 'Nog geen account? Maak er een'}
              </button>

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading || (captchaEnabled && !captchaToken)}
                  className="ml-3 mt-3 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Wachtwoord vergeten?
                </button>
              )}
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resendLoading || loading || !hasSupabaseConfig}
                  className="ml-3 mt-3 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
                >
                  {resendLoading ? 'Bevestiging versturen...' : 'Resend confirmation'}
                </button>
              )}
            </>
          )}

          {(message || urlAuthMessage) && <p className="mt-3 text-xs text-zinc-300">{message || urlAuthMessage}</p>}
        </article>
      </div>
    </div>
  )
}
