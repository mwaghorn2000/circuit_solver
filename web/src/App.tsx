import { useState } from 'react'
import Home from './pages/Home'
import Practice from './pages/Practice'
import WipPage from './pages/WipPage'
import './App.css'

type Page = 'home' | 'practice' | 'ranks' | 'online'

const NAV: { page: Page; label: string }[] = [
  { page: 'home', label: 'Home' },
  { page: 'practice', label: 'Practice' },
  { page: 'ranks', label: 'Ranks' },
  { page: 'online', label: 'Online Battles' },
]

function App() {
  const [page, setPage] = useState<Page>('home')
  const [practiceVisit, setPracticeVisit] = useState(0)

  return (
    <>
      <nav className="top-nav">
        <span className="brand">[ CIRCUIT_SOLVER ]</span>
        <div className="nav-links">
          {NAV.map(({ page: p, label }) => (
            <button
              key={p}
              type="button"
              className={page === p ? 'nav-link active' : 'nav-link'}
              onClick={() => { setPage(p); if (p === 'practice') setPracticeVisit(visit => visit + 1) }}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className={page === 'practice' ? 'page practice-page' : 'page'}>
        {page === 'home' && <Home onNavigate={setPage} />}
        {page === 'practice' && <Practice key={practiceVisit} />}
        {page === 'ranks' && <WipPage title="Ranks" />}
        {page === 'online' && <WipPage title="Online Battles" />}
      </main>
    </>
  )
}

export default App
