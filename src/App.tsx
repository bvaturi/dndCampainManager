import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import HomebrewScope from './components/HomebrewScope'
import Layout from './components/Layout'
import { useAuth } from './lib/auth'
import AdminPage from './pages/AdminPage'
import CampaignPage from './pages/CampaignPage'
import CharacterPage from './pages/CharacterPage'
import CharacterWizard from './pages/CharacterWizard'
import CombatPage from './pages/CombatPage'
import Dashboard from './pages/Dashboard'
import ImportCharacterPage from './pages/ImportCharacterPage'
import InvitePage from './pages/InvitePage'
import LoginPage from './pages/LoginPage'
import SpellsPage from './pages/SpellsPage'

function RequireUser({ children }: { children: JSX.Element }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return children
}

export default function App() {
  const { isAdmin } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:cid/:token" element={<InvitePage />} />
      <Route element={<RequireUser><Layout /></RequireUser>}>
        <Route index element={<Dashboard />} />
        <Route path="admin/*" element={isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
        <Route path="spells" element={<SpellsPage />} />
        <Route path="campaign/:cid" element={<HomebrewScope />}>
          <Route index element={<CampaignPage />} />
          <Route path="new-character" element={<CharacterWizard />} />
          <Route path="import" element={<ImportCharacterPage />} />
          <Route path="combat" element={<CombatPage />} />
          <Route path="character/:chid" element={<CharacterPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
