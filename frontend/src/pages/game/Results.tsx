import { tr } from '../../lib/i18n'
import confetti from 'canvas-confetti'
import { motion } from 'framer-motion'
import { Home, MedalFirst, MedalSecond, MedalThird, RotateCcw } from '../../lib/icons'
import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Logo from '../../components/Logo'
import { OrnamentDivider } from '../../components/OrnamentFrame'
import { sounds } from '../../lib/sounds'
import { useGame } from '../../store/game'
import { useUI } from '../../store/ui'

// Медали — значки набора, а не смайлы: цвет металла задаём сами, чтобы он не зависел
// от того, как эмодзи рисует система. Серебро взято потемнее: светлое терялось на белом фоне
const PODIUM = [
  { place: 2, height: 'h-32 sm:h-40', Medal: MedalSecond, color: '#94a3b8', delay: 0.6 },
  { place: 1, height: 'h-44 sm:h-56', Medal: MedalFirst, color: '#fbbf24', delay: 1.0 },
  { place: 3, height: 'h-24 sm:h-28', Medal: MedalThird, color: '#d08a52', delay: 0.3 },
]

export default function Results() {
  const { room, teams, reset } = useGame()
  const openStart = useUI((s) => s.openStart)
  const navigate = useNavigate()
  const ranked = [...teams].sort((a, b) => b.score - a.score)

  useEffect(() => {
    if (!teams.length) return
    const t = setTimeout(() => sounds.fanfare(), 900)
    const colors = ['#10B981', '#34D399', '#059669', '#FBBF24', '#ffffff']
    const end = Date.now() + 3500
    let raf = 0
    const frame = () => {
      confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors })
      confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors })
      if (Date.now() < end) raf = requestAnimationFrame(frame)
    }
    const t2 = setTimeout(() => {
      confetti({ particleCount: 160, spread: 100, origin: { y: 0.45 }, colors })
      frame()
    }, 1100)
    return () => {
      clearTimeout(t)
      clearTimeout(t2)
      cancelAnimationFrame(raf)
      confetti.reset()
    }
  }, [teams.length])

  if (!room || !teams.length) return <Navigate to="/" replace />

  const leave = (to: 'home' | 'new') => {
    const r = room
    navigate(to === 'home' ? '/' : '/rooms')
    setTimeout(() => {
      reset()
      if (to === 'new') {
        const count = r.questions.length + r.categories.reduce((n, c) => n + c.questions.length, 0)
        openStart({ ...r, categories: r.categories.map((c) => c.name), questions_count: count })
      }
    }, 300)
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10">
      <div className="bg-aurora" />
      <div className="relative z-10 mx-auto max-w-4xl">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center">
          <Logo size={48} />
          <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">{tr('Итоги игры')}</h1>
          <p className="mt-2 text-muted">{room.title}</p>
          <OrnamentDivider className="mt-5" />
        </motion.div>

        {/* Пьедестал */}
        <div className="mt-12 flex items-end justify-center gap-3 sm:gap-5">
          {PODIUM.map(({ place, height, Medal, color, delay }) => {
            const t = ranked[place - 1]
            if (!t) return <div key={place} className="w-28 sm:w-40" />
            return (
              <div key={place} className="flex w-28 flex-col items-center sm:w-40">
                <motion.div
                  initial={{ opacity: 0, y: -30, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: delay + 0.4, type: 'spring', damping: 10 }}
                  className="mb-3 flex flex-col items-center"
                >
                  <Medal
                    size={place === 1 ? 56 : 46}
                    style={{ color }}
                    className="drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
                  />
                  <span className="mt-2 line-clamp-2 text-center font-bold" style={{ color: t.color }}>
                    {t.name}
                  </span>
                  <span className="text-2xl font-extrabold">{t.score}</span>
                </motion.div>
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay, duration: 0.6, ease: 'easeOut' }}
                  style={{ originY: 1, background: `linear-gradient(180deg, ${t.color}, ${t.color}55)` }}
                  className={`${height} flex w-full items-start justify-center rounded-t-2xl pt-3 text-4xl font-extrabold text-white/90 shadow-[0_0_40px_rgba(16,185,129,0.25)]`}
                >
                  {place}
                </motion.div>
              </div>
            )
          })}
        </div>

        {/* Полная таблица */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }} className="glass mt-10 overflow-hidden rounded-3xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
                <th className="px-5 py-3">{tr('Место')}</th>
                <th className="px-5 py-3">{tr('Команда')}</th>
                <th className="px-5 py-3 text-right">{tr('Баллы')}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((t, i) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 font-bold text-muted">{i + 1}</td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2.5 font-semibold">
                      <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                      {t.name}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-xl font-extrabold">{t.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }} className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={() => leave('new')} className="btn btn-primary px-8 py-3.5">
            <RotateCcw size={18} /> {tr('Новая игра')}
          </button>
          <button onClick={() => leave('home')} className="btn btn-ghost px-8 py-3.5">
            <Home size={18} /> {tr('На главную')}
          </button>
        </motion.div>
      </div>
    </div>
  )
}
