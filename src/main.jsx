import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

function renderFatalBootMessage(message) {
  const target = document.getElementById('root')
  if (!target) return
  target.innerHTML = `
    <div style="min-height:100svh;display:flex;align-items:center;justify-content:center;background:#05020f;color:#f4f4f5;padding:24px;font-family:Inter,system-ui,sans-serif;">
      <div style="max-width:540px;border:1px solid rgba(255,255,255,0.14);background:rgba(24,24,27,0.72);border-radius:16px;padding:16px 18px;">
        <h1 style="margin:0 0 8px;font-size:18px;">Lyyve kon niet laden</h1>
        <p style="margin:0;color:#d4d4d8;font-size:13px;line-height:1.45;">Ververs de pagina. Blijft dit terugkomen? Deel deze melding: <code style="color:#67e8f9;">${String(message || 'unknown')}</code></p>
      </div>
    </div>
  `
}

window.addEventListener('error', (event) => {
  const msg = event?.error?.message || event?.message || 'runtime-error'
  renderFatalBootMessage(msg)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason =
    event?.reason?.message || event?.reason?.toString?.() || 'unhandled-promise-rejection'
  renderFatalBootMessage(reason)
})

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'react-render-error' }
  }

  componentDidCatch() {
    // No-op: message is surfaced in fallback UI.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-svh bg-[#05020f] px-6 py-10 text-zinc-100">
          <div className="mx-auto max-w-xl rounded-2xl border border-white/15 bg-zinc-900/70 p-5">
            <h1 className="text-lg font-semibold text-white">Lyyve kon niet laden</h1>
            <p className="mt-2 text-sm text-zinc-300">
              Ververs de pagina. Blijft dit terugkomen? Deel deze melding:
              <code className="ml-1 text-cyan-300">{this.state.message}</code>
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Keep layout stable on mobile by preventing gesture zoom.
document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false })
document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false })

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {
        // Ignore unregister issues.
      })
  })
}

createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <StrictMode>
      <App />
    </StrictMode>
  </RootErrorBoundary>,
)
