import { Loader2 } from './lib/icons'
import { tr } from './lib/i18n'
import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import AuthModal from './components/AuthModal'
import BoardStartModal from './components/BoardStartModal'
import Layout from './components/Layout'
import StartGameModal from './components/StartGameModal'
import { ADMIN_URL, setUnauthorizedHandler } from './lib/api'
import Board from './pages/Board'
import Connect from './pages/Connect'
import CreateRoom from './pages/CreateRoom'
import Random from './pages/game/Random'
import Classic from './pages/game/Classic'
import Lobby from './pages/game/Lobby'
import Solo from './pages/game/Solo'
import Results from './pages/game/Results'
import Join from './pages/play/Join'
import Play from './pages/play/Play'
import Strategic from './pages/game/Strategic'
import Home from './pages/Home'
import Profile from './pages/Profile'
import Rooms from './pages/Rooms'
import { useAuth } from './store/auth'
import { useUI } from './store/ui'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div className="flex justify-center py-32 text-muted">
        <Loader2 className="animate-spin" />
      </div>
    )
  }
  return user ? children : <Navigate to="/login" replace />
}

/** /login — главная с открытой модалкой входа */
function LoginRoute() {
  const openAuth = useUI((s) => s.openAuth)
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  useEffect(() => {
    if (user) navigate('/profile', { replace: true })
    else openAuth('login', () => navigate('/profile'))
  }, [user, openAuth, navigate])
  return <Home />
}

const isAdminPath = (path: string) => /\/admin\/?$/.test(path)

export default function App() {
  const init = useAuth((s) => s.init)
  const clear = useAuth((s) => s.clear)
  const lang = useUI((s) => s.lang)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Любая страница + /admin (например /rooms/admin) → админка Django
  useEffect(() => {
    if (isAdminPath(pathname)) window.location.replace(ADMIN_URL)
  }, [pathname])

  useEffect(() => {
    void init()
  }, [init])

  // 401 после неудачного обновления токена → разлогин и /login
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear()
      navigate('/login')
    })
  }, [clear, navigate])

  if (isAdminPath(pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-muted">
        <Loader2 className="animate-spin" /> {tr('Открываем админку…')}
      </div>
    )
  }

  return (
    // Ключ по языку: смена языка пересобирает дерево страниц целиком. Так строки
    // берутся из нового словаря без подписки на язык в каждом компоненте
    <div key={lang} className="contents">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/board" element={<Board />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/create" element={<RequireAuth><CreateRoom /></RequireAuth>} />
          <Route path="/rooms/:id/edit" element={<RequireAuth><CreateRoom /></RequireAuth>} />
        </Route>
        <Route path="/game/classic" element={<RequireAuth><Classic /></RequireAuth>} />
        <Route path="/game/strategic" element={<RequireAuth><Strategic /></RequireAuth>} />
        <Route path="/game/random" element={<RequireAuth><Random /></RequireAuth>} />
        <Route path="/game/results" element={<Results />} />
        <Route path="/game/lobby" element={<RequireAuth><Lobby /></RequireAuth>} />
        <Route path="/game/solo" element={<RequireAuth><Solo /></RequireAuth>} />
        {/* Онлайн-режим: устройства команд (без аккаунта) */}
        <Route path="/join" element={<Join />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/play/:code" element={<Play />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AuthModal />
      <StartGameModal />
      <BoardStartModal />
    </div>
  )
}
