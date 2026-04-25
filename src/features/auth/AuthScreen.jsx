import { useState } from 'react'
import { hasSupabaseConfig, supabase } from '../../lib/supabase'

export default function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!hasSupabaseConfig || !supabase) return

    setLoading(true)
    setMessage('')
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Account aangemaakt. Je bent nu ingelogd of ontvangt een bevestiging via mail.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        setMessage('Welkom terug.')
      }
    } catch (error) {
      setMessage(error?.message || 'Inloggen mislukt.')
    } finally {
      setLoading(false)
    }
  }

  async function handleOAuthSignIn(provider) {
    if (!hasSupabaseConfig || !supabase) return

    setLoading(true)
    setMessage('')
    try {
      const redirectTo = window.location.origin + import.meta.env.BASE_URL
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

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#05020f] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#fb718544,transparent_42%),radial-gradient(circle_at_70%_20%,#8b5cf666,transparent_48%),radial-gradient(circle_at_20%_80%,#22d3ee33,transparent_44%)]" />
      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-14">
        <img src={`${import.meta.env.BASE_URL}lyyve-logo-white-blue.png`} alt="Lyyve logo" className="mx-auto w-44" />
        <article className="mt-8 rounded-3xl border border-white/10 bg-zinc-900/70 p-5 shadow-2xl shadow-fuchsia-500/10 backdrop-blur-xl">
          <h1 className="text-2xl font-semibold text-white">
            {mode === 'signup' ? 'Maak je account' : 'Log in'}<span className="text-cyan-300">.</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Je check-ins, likes en profiel worden veilig opgeslagen.</p>

          {!hasSupabaseConfig && (
            <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Voeg `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` toe aan je `.env`.
            </p>
          )}

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
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
            <button
              type="submit"
              disabled={loading || !hasSupabaseConfig}
              className="w-full rounded-xl bg-gradient-to-r from-rose-500 via-fuchsia-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? 'Bezig...' : mode === 'signup' ? 'Account maken' : 'Inloggen'}
            </button>
          </form>

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

          <button
            type="button"
            onClick={() => {
              setMode((prev) => (prev === 'signup' ? 'login' : 'signup'))
              setMessage('')
            }}
            className="mt-3 text-xs text-cyan-300 hover:text-cyan-200"
          >
            {mode === 'signup' ? 'Al een account? Log in' : 'Nog geen account? Maak er een'}
          </button>

          {message && <p className="mt-3 text-xs text-zinc-300">{message}</p>}
        </article>
      </div>
    </div>
  )
}
