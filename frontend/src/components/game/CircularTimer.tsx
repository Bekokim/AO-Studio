import { motion } from 'framer-motion'
import { tr } from '../../lib/i18n'
import { Pause, Play, RotateCcw } from '../../lib/icons'

interface Props {
  left: number
  total: number
  /** Точный остаток в секундах (дробный): по нему рисуется круг, если передан */
  exact?: number
  size?: number
  running?: boolean
  onToggle?: () => void
  onReset?: () => void
  showControls?: boolean
}

/** Круговой таймер: зелёный → жёлтый → красный */
export default function CircularTimer({ left, total, exact, size = 140, running, onToggle, onReset, showControls = true }: Props) {
  const stroke = size * 0.08
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = total > 0 ? Math.min(1, Math.max(0, (exact ?? left) / total)) : 0
  const color = frac > 0.5 ? '#10B981' : frac > 0.2 ? '#EAB308' : '#EF4444'
  const urgent = left <= 10 && left > 0

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        className="relative"
        style={{ width: size, height: size }}
        animate={urgent && running ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={{ duration: 1, repeat: urgent && running ? Infinity : 0 }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-fg/10" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            style={{
              // С точным остатком круг идёт плавно сам — переход только у цвета
              transition: exact === undefined ? 'stroke-dashoffset 1s linear, stroke 0.5s' : 'stroke 0.5s',
              filter: `drop-shadow(0 0 ${size * 0.06}px ${color}88)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-extrabold tabular-nums" style={{ fontSize: size * 0.3, color: left === 0 ? '#EF4444' : undefined }}>
            {left}
          </span>
          {left === 0 && <span className="text-xs font-bold uppercase text-red-500">{tr('Время!')}</span>}
        </div>
      </motion.div>
      {showControls && (onToggle || onReset) && (
        <div className="flex gap-1">
          {onToggle && (
            <button onClick={onToggle} className="rounded-lg p-2 text-muted hover:bg-fg/10 hover:text-fg" aria-label={running ? tr('Пауза') : tr('Старт')}>
              {running ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )}
          {onReset && (
            <button onClick={onReset} className="rounded-lg p-2 text-muted hover:bg-fg/10 hover:text-fg" aria-label={tr('Сбросить таймер')}>
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
