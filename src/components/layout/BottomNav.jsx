const tabs = [
  { id: 'feed', label: 'Feed' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'explore', label: 'Ontdek' },
  { id: 'stats', label: 'Stats' },
]

function MenuIcon({ tabId }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.9',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'h-[18px] w-[18px] text-white',
    'aria-hidden': true,
  }

  if (tabId === 'feed') {
    return (
      <svg {...commonProps}>
        <path d="M4 19.5V9.5l8-4 8 4v10" />
        <path d="M9.5 19.5v-5h5v5" />
      </svg>
    )
  }

  if (tabId === 'checkin') {
    return (
      <svg {...commonProps}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
        <rect x="4" y="4" width="16" height="16" rx="4" />
      </svg>
    )
  }

  if (tabId === 'stats') {
    return (
      <svg {...commonProps}>
        <path d="M5 19V11" />
        <path d="M12 19V7" />
        <path d="M19 19V14" />
        <path d="M3 19.5h18" />
      </svg>
    )
  }

  if (tabId === 'explore') {
    return (
      <svg {...commonProps}>
        <circle cx="11" cy="11" r="6" />
        <path d="M16 16l4 4" />
      </svg>
    )
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="8" r="3" />
      <path d="M6.5 18.5c.9-2.4 3-3.5 5.5-3.5s4.6 1.1 5.5 3.5" />
    </svg>
  )
}

export default function BottomNav({ activeTab, onChange }) {
  return (
    <nav className="fixed inset-x-0 bottom-6 z-20 mx-auto w-[calc(100%-1rem)] max-w-md rounded-3xl border border-white/15 bg-zinc-900/55 px-2 py-2 shadow-2xl shadow-fuchsia-900/25 backdrop-blur-2xl">
      <ul className="grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                className={`flex w-full flex-col items-center rounded-xl py-2 text-xs transition ${
                  isActive
                    ? 'bg-gradient-to-r from-rose-500/30 via-fuchsia-500/30 to-sky-500/30 text-white shadow-lg shadow-fuchsia-500/20'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className="mb-1 rounded-full border border-white/20 p-1.5">
                  <MenuIcon tabId={tab.id} />
                </span>
                {tab.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
