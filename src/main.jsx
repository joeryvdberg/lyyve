import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
