import { StrictMode } from 'react'
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
  <StrictMode>
    <App />
  </StrictMode>,
)
