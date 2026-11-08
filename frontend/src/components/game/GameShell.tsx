import { AnimatePresence, motion } from 'framer-motion'
import { tr } from '../../lib/i18n'
import { Flag, Keyboard, LogOut, Maximize, Minimize, MonitorPlay } from '../../lib/icons'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHotkeys } from '../../hooks/useGameHooks'
import { useGame } from '../../store/game'
import FormatBadge from '../FormatBadge'
import Logo from '../Logo'
import Modal from '../Modal'
import AnticheatPanel from './AnticheatPanel'

interface Props {
  children: ReactNode
  hotkeys: { key: string; label: string }[]
  onFinish: () => void
}

/**
 * Каркас игровой страницы: шапка, режим проектора (F) — скрывает элементы с классом `host-only`.
 */
export default function GameShell({ children, hotkeys, onFinish }: Props) {
  const room = useGame((s) => s.room)
  const code = useGame((s) => (s.mode === 'online' ? s.code : null))
  const navigate = useNavigate()
  const [projector, setProjector] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)

  const toggleProjector = () => {
    setProjector((p) => {
      const next = !p
      if (next) document.documentElement.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      return next
    })
  }

  // Выход из полноэкранного режима браузерной кнопкой — выключаем проектор
  useEffect(() => {
    const onFs = () => !document.fullscreenElement && setProjector(false)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useHotkeys({ f: toggleProjector })

  // Класс на <html>, чтобы скрывать host-only и внутри модалок (они в портале)
  useEffect(() => {
    document.documentElement.classList.toggle('projector', projector)
    return () => document.documentElement.classList.remove('projector')
  }, [projector])

  if (!room) return null

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="bg-aurora" />

      <header className="glass relative z-20 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-2.5 sm:px-6">
        <Logo size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold leading-tight">{room.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <FormatBadge format={room.format} compact />
            {code && (
              <span className="rounded-lg border border-green/40 bg-green/10 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-green" title={tr('Код для входа команд')}>
                {code}
              </span>
            )}
          </div>
        </div>

        <div className="host-only hidden items-center gap-2 text-xs text-muted lg:flex">
          <Keyboard size={14} />
          {hotkeys.map((h) => (
            <span key={h.key}>
              <kbd>{h.key}</kbd> {h.label}
            </span>
          ))}
          <span>
            <kbd>F</kbd> {tr('проектор')}
          </span>
        </div>

        <button onClick={toggleProjector} className="btn btn-ghost px-3 py-2 text-sm" title={tr('Режим проектора (F)')}>
          {projector ? <Minimize size={16} /> : <Maximize size={16} />}
          <span className="hidden sm:inline">{projector ? tr('Выйти') : tr('Проектор')}</span>
        </button>
        <button onClick={() => setFinishOpen(true)} className="host-only btn btn-ghost px-3 py-2 text-sm" title={tr('Завершить игру')}>
          <Flag size={16} /> <span className="hidden sm:inline">{tr('Финиш')}</span>
        </button>
        <button onClick={() => setExitOpen(true)} className="host-only rounded-lg p-2 text-muted hover:bg-fg/10 hover:text-fg" title={tr('Выйти')}>
          <LogOut size={18} />
        </button>
      </header>

      <AnimatePresence>
        {projector && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed left-1/2 top-20 z-40 -translate-x-1/2"
          >
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 2, duration: 0.6 }}
              className="glass-strong flex items-center gap-2 rounded-full px-4 py-2 text-sm"
            >
              <MonitorPlay size={16} className="text-green" /> {tr('Режим проектора · горячие клавиши работают')}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 flex flex-1 flex-col">{children}</main>

      {/* Античит: нарушения команд и дисквалификации (только онлайн-игра с защитой) */}
      <AnticheatPanel />

      <Modal open={exitOpen} onClose={() => setExitOpen(false)} title={tr('Выйти из игры?')} size="sm">
        <p className="text-muted">{tr('Прогресс текущей игры будет потерян.')}</p>
        <div className="mt-6 flex gap-3">
          <button onClick={() => setExitOpen(false)} className="btn btn-ghost flex-1">
            {tr('Остаться')}
          </button>
          <button onClick={() => navigate('/')} className="btn btn-danger flex-1">
            {tr('Выйти')}
          </button>
        </div>
      </Modal>

      <Modal open={finishOpen} onClose={() => setFinishOpen(false)} title={tr('Завершить игру?')} size="sm">
        <p className="text-muted">{tr('Игра закончится досрочно, и вы перейдёте к итогам с текущими баллами.')}</p>
        <div className="mt-6 flex gap-3">
          <button onClick={() => setFinishOpen(false)} className="btn btn-ghost flex-1">
            {tr('Продолжить')}
          </button>
          <button
            onClick={() => {
              setFinishOpen(false)
              onFinish()
            }}
            className="btn btn-primary flex-1"
          >
            {tr('К итогам')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
