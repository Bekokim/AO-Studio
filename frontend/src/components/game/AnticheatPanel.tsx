import { AnimatePresence, motion } from 'framer-motion'
import { Ban, ShieldCheck, Undo2, WifiOff, X } from '../../lib/icons'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { sounds } from '../../lib/sounds'
import type { AnticheatStatus } from '../../lib/types'
import { useGame } from '../../store/game'

const POLL_MS = 2000

/**
 * Панель античита для ведущего (только онлайн-игра с включённой защитой).
 *
 * Опрашивает сервер: нарушения команд, дисквалификации и обрывы связи с устройствами.
 * Флаги уходят в стор игры — там заморожены баллы дисквалифицированных, а табло
 * показывает их вне зачёта. Ведущий может простить команду и вернуть её в игру.
 *
 * В игре с доски это же устройство показывает игру всем, и режим проектора прячет
 * элементы ведущего — поэтому там панель остаётся на экране: иначе снять дисквалификацию
 * было бы неоткуда.
 */
export default function AnticheatPanel() {
  const sessionId = useGame((s) => s.sessionId)
  const enabled = useGame((s) => s.mode === 'online' && s.anticheat)
  const board = useGame((s) => s.board)
  const setTeamFlags = useGame((s) => s.setTeamFlags)

  const [status, setStatus] = useState<AnticheatStatus | null>(null)
  const [open, setOpen] = useState(false)
  // Свежее нарушение — всплывающее уведомление поверх игры
  const [alert, setAlert] = useState<{ team: string; label: string; fatal: boolean } | null>(null)
  const seen = useRef<Set<number>>(new Set())
  const first = useRef(true)

  useEffect(() => {
    if (!enabled || !sessionId) return
    let stop = false
    const load = async () => {
      try {
        const { data } = await api.get<AnticheatStatus>(`/game/${sessionId}/anticheat/`)
        if (stop) return
        setStatus(data)
        setTeamFlags(
          data.teams.map((t) => ({ id: t.id, warnings: t.warnings, disqualified: t.disqualified, dq_reason: t.dq_reason })),
        )
        const fresh = data.violations.filter((v) => !seen.current.has(v.id))
        data.violations.forEach((v) => seen.current.add(v.id))
        // Первый ответ — просто запоминаем, что уже было (страницу могли перезагрузить)
        if (first.current) {
          first.current = false
          return
        }
        const last = fresh[0]
        if (last) {
          setAlert({ team: last.team, label: last.label, fatal: last.fatal })
          if (last.fatal) sounds.alarm()
          else sounds.wrong()
        }
      } catch {
        /* следующий опрос повторит */
      }
    }
    void load()
    const t = setInterval(load, POLL_MS)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [enabled, sessionId, setTeamFlags])

  // Уведомление само уходит через 6 с
  useEffect(() => {
    if (!alert) return
    const t = setTimeout(() => setAlert(null), 6000)
    return () => clearTimeout(t)
  }, [alert])

  const pardon = async (teamId: number) => {
    setStatus((s) =>
      s
        ? { ...s, teams: s.teams.map((t) => (t.id === teamId ? { ...t, disqualified: false, warnings: 0, dq_reason: '' } : t)) }
        : s,
    )
    await api.post(`/game/${sessionId}/teams/${teamId}/pardon/`).catch(() => {})
  }

  if (!enabled || !status) return null

  const dq = status.teams.filter((t) => t.disqualified)
  const warned = status.teams.filter((t) => !t.disqualified && t.warnings > 0)
  const offline = status.teams.filter((t) => t.offline && !t.disqualified)
  const attention = dq.length + warned.length + offline.length

  return (
    <>
      {/* Уведомление о нарушении — видно и в режиме проектора, чтобы ведущий не пропустил */}
      <AnimatePresence>
        {alert && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed left-1/2 top-4 z-50 w-[min(92vw,30rem)] -translate-x-1/2"
          >
            <div
              className={`glass-strong flex items-start gap-3 rounded-2xl border p-4 ${
                alert.fatal ? 'border-red-400/60' : 'border-yellow-400/60'
              }`}
            >
              <Ban size={20} className={`mt-0.5 shrink-0 ${alert.fatal ? 'text-red-400' : 'text-yellow-400'}`} />
              <div className="min-w-0 flex-1 text-sm">
                <div className={`font-bold ${alert.fatal ? 'text-red-400' : 'text-yellow-400'}`}>
                  {alert.fatal ? `«${alert.team}» дисквалифицирована` : `Предупреждение: «${alert.team}»`}
                </div>
                <div className="mt-0.5 text-muted">{alert.label}</div>
              </div>
              <button onClick={() => setAlert(null)} className="shrink-0 rounded-lg p-1 text-muted hover:text-fg" aria-label="Скрыть">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Кнопка и список нарушений. В режиме проектора скрыты — но не в игре с доски:
          там это единственное устройство ведущего */}
      <div className={`fixed bottom-4 left-4 z-40 ${board ? '' : 'host-only'}`}>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              className="glass-strong mb-2 max-h-[60vh] w-[min(88vw,22rem)] overflow-y-auto rounded-2xl p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-bold">
                  <ShieldCheck size={18} className="text-green" /> Защита от списывания
                </h3>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:text-fg" aria-label="Закрыть">
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-muted">
                Прощается нарушений: {status.warnings_allowed}. Дальше команда вне зачёта, её баллы заморожены.
                Дисквалификацию можно снять — команда вернётся в игру с обнулёнными предупреждениями.
              </p>

              {dq.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-400">Дисквалифицированы</div>
                  <div className="space-y-2">
                    {dq.map((t) => (
                      <div key={t.id} className="rounded-xl border border-red-400/40 bg-red-400/5 p-3">
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                          <span className="min-w-0 flex-1 truncate">{t.name}</span>
                          <span className="shrink-0 tabular-nums text-muted">{t.score}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted">{t.dq_reason}</div>
                        <button onClick={() => void pardon(t.id)} className="btn btn-ghost mt-2 w-full px-3 py-1.5 text-xs">
                          <Undo2 size={14} /> Простить и вернуть в игру
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {warned.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-yellow-400">Предупреждены</div>
                  <div className="space-y-1.5">
                    {warned.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 rounded-xl border border-yellow-400/30 bg-yellow-400/5 px-3 py-2 text-sm"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                        <span className="shrink-0 text-xs text-yellow-400">
                          {t.warnings} из {status.warnings_allowed + 1}
                        </span>
                        <button
                          onClick={() => void pardon(t.id)}
                          className="shrink-0 rounded-lg p-1 text-muted hover:text-fg"
                          title="Снять предупреждения"
                        >
                          <Undo2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {offline.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Нет связи с устройством</div>
                  <div className="space-y-1.5">
                    {offline.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                        <WifiOff size={14} className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Журнал нарушений</div>
                {status.violations.length === 0 ? (
                  <p className="text-sm text-muted">Пока чисто — все команды на экране игры.</p>
                ) : (
                  <div className="space-y-1.5">
                    {status.violations.map((v) => (
                      <div key={v.id} className="rounded-xl border border-line bg-fg/[0.03] px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${v.fatal ? 'text-red-400' : 'text-fg'}`}>{v.team}</span>
                          <span className="ml-auto shrink-0 tabular-nums text-muted">
                            {new Date(v.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <div className="mt-0.5 text-muted">
                          {v.label}
                          {v.fatal && <b className="text-red-400"> — дисквалификация</b>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setOpen((v) => !v)}
          className={`glass-strong flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            dq.length > 0 ? 'text-red-400' : attention > 0 ? 'text-yellow-400' : 'text-green'
          }`}
          title="Защита от списывания: нарушения команд"
        >
          {dq.length > 0 ? <Ban size={18} /> : <ShieldCheck size={18} />}
          Защита
          {attention > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-bold text-white ${dq.length > 0 ? 'bg-red-400' : 'bg-yellow-500'}`}
            >
              {attention}
            </span>
          )}
        </button>
      </div>
    </>
  )
}
