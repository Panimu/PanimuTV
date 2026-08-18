import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import {
  IconCalendar,
  IconCompass,
  IconGrid,
  IconHome,
  IconTv,
  IconUser,
} from './components/Icons'
import { Toasts } from './components/Toasts'
import { DiscoverPage } from './pages/DiscoverPage'
import { HomePage } from './pages/HomePage'
import { MyShowsPage } from './pages/MyShowsPage'
import { ProfilePage } from './pages/ProfilePage'
import { SchedulePage } from './pages/SchedulePage'
import { ShowPage } from './pages/ShowPage'

const NAV_ITEMS = [
  { to: '/', label: 'Watch Next', icon: IconHome, end: true },
  { to: '/shows', label: 'My Shows', icon: IconGrid, end: false },
  { to: '/schedule', label: 'Schedule', icon: IconCalendar, end: false },
  { to: '/discover', label: 'Discover', icon: IconCompass, end: false },
  { to: '/profile', label: 'Profile', icon: IconUser, end: false },
]

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <nav className="nav" aria-label="Main">
          <NavLink to="/" className="brand" end>
            <span className="brand-mark">
              <IconTv size={22} />
            </span>
            <span className="brand-name">
              Panimu<span className="brand-accent">TV</span>
            </span>
          </NavLink>
          <div className="nav-items">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}
              >
                <Icon size={22} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
          <div className="nav-footer">
            Data by{' '}
            <a href="https://thetvdb.com" target="_blank" rel="noreferrer">
              TheTVDB
            </a>
          </div>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/shows" element={<MyShowsPage />} />
            <Route path="/show/:id" element={<ShowPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Toasts />
      </div>
    </HashRouter>
  )
}
