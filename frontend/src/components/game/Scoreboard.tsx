import { tr } from '../../lib/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import { Ban, Crown, Minus, Plus } from '../../lib/icons'
import type { Team } from '../../lib/types'

interface Props {
  teams: Team[]
  activeId?: number | null
  onAdjust?: (teamId: number, delta: number) => void
  compact?: boolean
}

/** Табло команд — сортируется по очкам, с анимацией перестановок */
export default function Scoreboard({ teams, activeId, onAdjust, compact }: Props) {
  // Дисквалифицированные — в конце табло и вне зачёта
  const sorted = [...teams].sort(
    (a, b) => Number(!!a.disqualified) - Number(!!b.disqualified) || b.score - a.score,
  )
  const max = Math.max(1, ...teams.map((t) => t.score))

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {sorted.map((t, i) => {
          const active = t.id === activeId
          return (
            <motion.div
              key={t.id}
              layout
              transition={{ type: 'spring', damping: 22, stiffness: 260 }}
              className={`relative overflow-hidden rounded-xl border p-3 transition-colors ${
                t.disqualified
                  ? 'border-red-400/40 bg-red-400/5 opacity-70'
                  : active
                    ? 'border-green bg-green/10 shadow-[0_0_24px_rgba(16,185,129,0.25)]'
                    : 'border-line bg-fg/[0.03]'
              }`}
            >
              <motion.div
                className="absolute inset-y-0 left-0 opacity-15"
                style={{ background: t.color }}
                animate={{ width: `${(Math.max(0, t.score) / max) * 100}%` }}
                transition={{ duration: 0.6 }}
              />
              <div className="relative flex items-center gap-3">
                <span className="w-5 text-center text-sm font-bold text-muted">
                  {t.disqualified ? (
                    <span title={tr('Команде бан')}>
                      <Ban size={14} className="mx-auto text-red-400" />
                    </span>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: t.color, boxShadow: `0 0 10px ${t.color}` }} />
                <span className={`min-w-0 flex-1 truncate font-semibold ${compact ? 'text-sm' : ''}`}>
                  {active && !t.disqualified && <Crown size={16} className="mr-1 inline -translate-y-0.5 text-yellow-400" fill="currentColor" />}
                  {t.name}
                  {t.disqualified && <span className="ml-1.5 text-xs font-semibold text-red-400">{tr('бан')}</span>}
                </span>
                {onAdjust && !t.disqualified && (
                  <div className="host-only flex gap-0.5">
                    <button onClick={() => onAdjust(t.id, -1)} className="rounded-md p-1 text-muted hover:bg-fg/10 hover:text-fg" aria-label={tr('Минус балл')}>
                      <Minus size={14} />
                    </button>
                    <button onClick={() => onAdjust(t.id, 1)} className="rounded-md p-1 text-muted hover:bg-fg/10 hover:text-fg" aria-label={tr('Плюс балл')}>
                      <Plus size={14} />
                    </button>
                  </div>
                )}
                <motion.span
                  key={t.score}
                  initial={{ scale: 1.6, color: '#34D399' }}
                  animate={{ scale: 1, color: 'var(--fg)' }}
                  className={`min-w-[2ch] text-right font-extrabold tabular-nums ${compact ? 'text-lg' : 'text-2xl'} ${
                    t.disqualified ? 'line-through opacity-60' : ''
                  }`}
                >
                  {t.score}
                </motion.span>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
