import { useState } from 'react'
import { hasSupabaseConfig, supabase } from '../../lib/supabase'

function validatePassword(value) {
  const minLength = value.length >= 8
  const hasLower = /[a-z]/.test(value)
  const hasUpper = /[A-Z]/.test(value)
  const hasNumber = /\d/.test(value)
  const hasSpecial = /[^A-Za-z0-9]/.test(value)
  const valid = minLength && hasLower && hasUpper && hasNumber && hasSpecial
  return { valid, minLength, hasLower, hasUpper, hasNumber, hasSpecial }
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

function mapAuthErrorMessage(error) {
  const raw = String(error?.message || '').toLowerCase()
  if (
    raw.includes('user already registered') ||
    raw.includes('already registered') ||
    raw.includes('already exists') ||
    raw.includes('email address is already in use')
  ) {
    return 'Dit e-mailadres is al in gebruik. Gebruik inloggen of wachtwoord vergeten.'
  }
  if (raw.includes('invalid login credentials')) {
    return 'Onjuiste inloggegevens. Controleer je e-mail en wachtwoord.'
  }
  return error?.message || 'Inloggen mislukt.'
}

function normalizeUsername(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '')
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
  const urlAuthMessage = getAuthMessageFromUrl()

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
      if (mode === 'signup' || mode === 'reset') {
        const ruleCheck = validatePassword(password)
        if (!ruleCheck.valid) {
          setPasswordError('Wachtwoord moet min. 8 tekens hebben, incl. hoofdletter, cijfer en symbool.')
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
        if (city.trim().length < 2) {
          setMessage('Vul je stad in om je profiel direct compleet te maken.')
          setLoading(false)
          return
        }
      }

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
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
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        if (error) throw error
        setMessage('Welkom terug.')
      }
    } catch (error) {
      setMessage(mapAuthErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!hasSupabaseConfig || !supabase) return
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setMessage('Vul eerst je e-mail in en klik daarna opnieuw op wachtwoord vergeten.')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const redirectTo = getAuthRedirectUrl()
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, { redirectTo })
      if (error) throw error
      setMessage('Resetmail verstuurd. Open de link in je mail om een nieuw wachtwoord in te stellen.')
    } catch (error) {
      setMessage(error?.message || 'Resetmail versturen mislukt.')
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      })
      if (error) throw error
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
      setMessage(error?.message || 'Bevestigingsmail opnieuw versturen mislukt.')
    } finally {
      setResendLoading(false)
    }
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
                    placeholder="Bijv. Joery van den Berg"
                    required
                  />
                </label>
                <label className="block text-sm text-zinc-300">
                  Gebruikersnaam
                  <input
                    value={username}
                    onChange={(event) => setUsername(normalizeUsername(event.target.value))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                    placeholder="Bijv. joerylive"
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
                    required
                  />
                </label>
                <label className="block text-sm text-zinc-300">
                  Favoriete genres
                  <input
                    value={favoriteGenres}
                    onChange={(event) => setFavoriteGenres(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                    placeholder="Bijv. House, Techno"
                  />
                </label>
                <label className="block text-sm text-zinc-300">
                  Favoriete artiesten
                  <input
                    value={favoriteArtists}
                    onChange={(event) => setFavoriteArtists(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white outline-none ring-cyan-400 placeholder:text-zinc-500 focus:ring-2"
                    placeholder="Bijv. BICEP, Fred again.."
                  />
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
                placeholder="Minimaal 6 tekens"
                minLength={6}
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
                    minLength={8}
                    required
                  />
                </label>
                <p className="text-xs text-zinc-500">
                  Gebruik minimaal 8 tekens met hoofdletter, kleine letter, cijfer en symbool.
                </p>
              </>
            )}
            {passwordError && <p className="text-xs text-amber-300">{passwordError}</p>}
            {mode === 'signup' && (
              <p className="text-xs text-zinc-500">Per e-mailadres is maar 1 account toegestaan.</p>
            )}
            <button
              type="submit"
              disabled={loading || !hasSupabaseConfig}
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
                disabled={loading || !hasSupabaseConfig}
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
