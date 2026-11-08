import { motion } from 'framer-motion'
import { tr } from '../lib/i18n'
import { BookOpen, Home, Info, LogIn, Monitor, Moon, Puzzle, QrCode, Sun, User as UserIcon } from '../lib/icons'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import Avatar from './Avatar'
import FloatingEmojis from './FloatingEmojis'
import LangToggle from './LangToggle'
import Logo from './Logo'

function ThemeToggle({ withLabel }: { withLabel?: boolean }) {
  const { theme, toggleTheme } = useUI()
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted transition hover:bg-fg/5 hover:text-fg"
      aria-label={tr('Сменить тему')}
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      {withLabel && <span className="text-sm">{theme === 'dark' ? tr('Светлая тема') : tr('Тёмная тема')}</span>}
    </button>
  )
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition ${
    isActive ? 'bg-green/15 text-green' : 'text-muted hover:bg-fg/5 hover:text-fg'
  }`

/**
 * Плавно прокручивает главную к разделу «Что такое Акыл Ордо?».
 *
 * Вызывается и с самой главной, и с других страниц сразу после перехода — тогда раздела
 * в DOM ещё нет, поэтому ждём его появления. Прокрутку повторяем: переход на страницу
 * может сбросить её в начало уже после нашего вызова.
 */
export function scrollToAbout() {
  scrollToSection('about')
}

/** Прокрутка к разделу главной: «Об игре АО» — к описанию, «Инфо» — к футеру */
export function scrollToSection(id: 'about' | 'info') {
  let tries = 0
  const go = () => {
    const el = document.getElementById(id)
    // Переход с другой страницы: раздела ещё нет в DOM — ждём, пока отрисуется
    if (!el) {
      if (tries++ < 40) setTimeout(go, 50)
      return
    }
    el.scrollIntoView({ behavior: 'smooth' })
    setTimeout(() => {
      // Судим по результату: раздел должен оказаться у верха экрана
      const top = el.getBoundingClientRect().top
      if (top >= -4 && top < window.innerHeight * 0.6) return
      // Не доехали (браузер не анимирует прокрутку или страница дорисовалась позже):
      // пробуем ещё раз, а на последней попытке переходим рывком
      if (tries++ < 4) go()
      else el.scrollIntoView()
    }, 400)
  }
  go()
}

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const openAuth = useUI((s) => s.openAuth)

  // «AO Studio» и «Об игре АО» → на главную и плавный скролл к описанию
  const onLogo = () => {
    if (location.pathname !== '/') navigate('/')
    scrollToAbout()
  }

  // «Инфо» — на главную, к футеру с контактами
  const goInfo = () => {
    if (location.pathname !== '/') navigate('/')
    scrollToSection('info')
  }

  return (
    <div className="relative min-h-screen">
      <div className="bg-aurora" />
      <FloatingEmojis />

      {/* Sidebar — десктоп */}
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-64 flex-col rounded-none border-y-0 border-l-0 p-4 md:flex">
        <button onClick={onLogo} className="mb-8 flex items-center gap-3 rounded-xl p-2 text-left transition hover:bg-fg/5">
          <Logo />
          <div>
            <div className="text-lg font-extrabold leading-tight">AO Studio</div>
            <div className="text-xs text-muted">{tr('Акыл Ордо')}</div>
          </div>
        </button>

        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={navCls}>
            <Home size={20} /> {tr('Главная')}
          </NavLink>
          <button onClick={onLogo} className={navCls({ isActive: false })}>
            <BookOpen size={20} /> {tr('Об игре АО')}
          </button>
          <NavLink to="/rooms" className={navCls}>
            <Puzzle size={20} /> {tr('AO комнаты')}
          </NavLink>
          <NavLink to="/board" className={navCls}>
            <Monitor size={20} /> {tr('Доска')}
          </NavLink>
          <NavLink to="/connect" className={navCls}>
            <QrCode size={20} /> {tr('Присоединиться')}
          </NavLink>
          <button onClick={goInfo} className={navCls({ isActive: false })}>
            <Info size={20} /> {tr('Инфо')}
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-1">
          <LangToggle />
          <ThemeToggle withLabel />
          {user ? (
            <NavLink to="/profile" className={navCls}>
              <Avatar name={user.username} src={user.avatar} size={30} />
              <span className="truncate">{user.username}</span>
            </NavLink>
          ) : (
            <button onClick={() => openAuth('login')} className={navCls({ isActive: false })}>
              <LogIn size={20} /> {tr('Войти')}
            </button>
          )}
        </div>
      </aside>

      {/* Верхняя панель — мобильные */}
      <header className="glass sticky top-0 z-30 flex items-center justify-between rounded-none border-x-0 border-t-0 px-4 py-2.5 md:hidden">
        <button onClick={onLogo} className="flex items-center gap-2">
          <Logo size={30} />
          <span className="font-extrabold">AO Studio</span>
        </button>
        <div className="flex items-center gap-1">
          <LangToggle compact />
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 pb-24 md:ml-64 md:pb-0">
        {/* Анимация входа при каждой смене страницы */}
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Bottom navigation — мобильные */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden">
        {[
          { to: '/', icon: Home, label: tr('Главная'), end: true },
          { to: '/rooms', icon: Puzzle, label: tr('Комнаты') },
          { to: '/board', icon: Monitor, label: tr('Доска') },
          { to: '/connect', icon: QrCode, label: tr('Код') },
        ].map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${isActive ? 'text-green' : 'text-muted'}`
            }
          >
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
        {user ? (
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-green' : 'text-muted'}`
            }
          >
            <Avatar name={user.username} src={user.avatar} size={22} />
            {tr('Профиль')}
          </NavLink>
        ) : (
          <button onClick={() => openAuth('login')} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted">
            <UserIcon size={22} />
            {tr('Войти')}
          </button>
        )}
      </nav>
    </div>
  )
}
