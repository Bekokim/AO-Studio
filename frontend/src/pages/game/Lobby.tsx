import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Loader2, LogOut, Rocket, ShieldCheck, Sparkles, Users, X } from '../../lib/icons'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import FormatBadge from '../../components/FormatBadge'
import Logo from '../../components/Logo'
import { api, errorMessage } from '../../lib/api'
import type { GameSession } from '../../lib/types'
import { plural } from '../../lib/utils'
import { useGame } from '../../store/game'

/** Лобби онлайн-игры: ведущий показывает код/QR, команды подключаются со своих устройств */
export default function Lobby() {
  const { sessionId, room, code, mode, anticheat, setTeams, teams } = useGame()
  const navigate = useNavigate()
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [session, setSession] = useState<GameSession | null>(null)

  const joinUrl = code ? `${window.location.origin}/join/${code}` : ''

  useEffect(() => {
    if (!joinUrl) return
    QRCode.toDataURL(joinUrl, { width: 360, margin: 1, color: { dark: '#0a0f1e', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''))
  }, [joinUrl])

  // Опрос: кто уже подключился. Если собрались все команды, сервер стартует игру сам —
  // ловим это здесь и уводим ведущего на игровой экран
  useEffect(() => {
    if (!sessionId) return
    let stop = false
    const load = () =>
      api
        .get<GameSession>(`/game/${sessionId}/`)
        .then(({ data }) => {
          if (stop) return
          setTeams(data.teams)
          setSession(data)
          if (data.status === 'active') {
            stop = true
            navigate(`/game/${room?.format ?? 'classic'}`, { replace: true })
          }
        })
        .catch(() => {})
    load()
    const t = setInterval(load, 1500)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [sessionId, setTeams, navigate, room?.format])

  if (!room || !sessionId || mode !== 'online' || !code) return <Navigate to="/rooms" replace />

  const expected = session?.expected_teams ?? 0
  const teamSize = session?.team_size ?? 0

  const kick = async (teamId: number) => {
    setTeams(teams.filter((t) => t.id !== teamId))
    await api.delete(`/game/${sessionId}/teams/${teamId}/`).catch(() => {})
  }

  const begin = async () => {
    setStarting(true)
    setError('')
    try {
      const { data } = await api.patch<GameSession>(`/game/${sessionId}/begin/`)
      setTeams(data.teams)
      navigate(`/game/${room.format}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Не удалось начать игру.'))
    } finally {
      setStarting(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* буфер обмена недоступен */
    }
  }

  return (
    <div className="relative min-h-screen px-4 py-6 sm:px-8">
      <div className="bg-aurora" />
      <div className="relative z-10 mx-auto max-w-6xl">
        <header className="mb-8 flex items-center gap-3">
          <Logo size={38} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{room.title}</div>
            <FormatBadge format={room.format} compact />
          </div>
          <button onClick={() => navigate('/rooms')} className="btn btn-ghost px-3 py-2 text-sm" title="Выйти">
            <LogOut size={16} /> <span className="hidden sm:inline">Выйти</span>
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* Код и QR */}
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass flex flex-col items-center rounded-3xl p-6 text-center sm:p-10">
            <div className="text-sm font-semibold uppercase tracking-widest text-muted">Откройте на телефоне или компьютере</div>
            <div className="mt-2 break-all text-lg font-bold text-green sm:text-2xl">{window.location.host}/join</div>
            <div className="mt-6 text-sm font-semibold uppercase tracking-widest text-muted">и введите код</div>
            <div className="mt-2 select-all font-mono text-6xl font-extrabold tracking-[0.2em] sm:text-8xl">{code}</div>

            {qr && (
              <div className="mt-8 rounded-2xl bg-white p-3 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                <img src={qr} alt="QR-код для входа в игру" className="h-48 w-48 sm:h-56 sm:w-56" />
              </div>
            )}
            <div className="mt-3 text-sm text-muted">или наведите камеру на QR-код</div>

            <button onClick={copy} className="btn btn-ghost mt-5 px-4 py-2 text-sm">
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Скопировано' : 'Скопировать ссылку'}
            </button>

            {anticheat && (
              <div className="mt-6 w-full rounded-2xl border border-green/40 bg-green/10 p-4 text-left text-sm">
                <div className="flex items-center gap-2 font-bold text-green">
                  <ShieldCheck size={16} /> Защита от списывания включена
                </div>
                <p className="mt-1.5 text-muted">
                  Объявите командам правила: одно устройство на команду, игра раскрывается на весь экран. Свернуть игру
                  или открыть другую вкладку — предупреждение, второй раз — <b className="text-fg">дисквалификация</b>.
                  Нарушения вы увидите на игровом экране и сможете простить команду.
                </p>
              </div>
            )}
          </motion.section>

          {/* Команды */}
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass flex flex-col rounded-3xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Users size={22} className="text-green" /> Команды
              </h2>
              <span className="rounded-full bg-green/15 px-3 py-1 text-sm font-semibold text-green">
                {expected ? `${teams.length} из ${expected}` : `${teams.length} ${plural(teams.length, 'команда', 'команды', 'команд')}`}
              </span>
            </div>

            {expected > 0 && (
              <div className="mb-4">
                <div className="h-2 overflow-hidden rounded-full bg-fg/10">
                  <motion.div
                    className="h-full rounded-full bg-green"
                    animate={{ width: `${Math.min(100, (teams.length / expected) * 100)}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                  {session?.autostart ? (
                    <>
                      <Sparkles size={14} className="shrink-0 text-green" />
                      {teams.length >= expected
                        ? 'Все собрались — начинаем…'
                        : `Игра начнётся сама, когда подключатся все ${expected}`}
                    </>
                  ) : (
                    <>Ждём {expected} {plural(expected, 'команду', 'команды', 'команд')}</>
                  )}
                  {teamSize > 0 && <span className="ml-auto shrink-0">по {teamSize} {plural(teamSize, 'игроку', 'игрока', 'игроков')}</span>}
                </div>
              </div>
            )}

            <div className="scrollbar-thin min-h-[200px] flex-1 space-y-2 overflow-y-auto">
              {teams.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-muted">
                  <Loader2 className="animate-spin" />
                  Ждём, когда команды подключатся…
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {teams.map((t, i) => (
                    <motion.div
                      key={t.id}
                      layout
                      initial={{ opacity: 0, x: -20, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-3 rounded-xl border border-line bg-fg/[0.03] p-3"
                    >
                      {/* Номер — он же очередь хода: команды ходят строго по этому порядку */}
                      <span className="w-5 shrink-0 text-center text-sm font-bold text-muted tabular-nums">{i + 1}</span>
                      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: t.color, boxShadow: `0 0 10px ${t.color}` }} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                      <button onClick={() => kick(t.id)} className="rounded-lg p-1.5 text-muted hover:bg-red-400/10 hover:text-red-400" title="Убрать команду">
                        <X size={16} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {error && <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}

            <button onClick={begin} disabled={starting || !teams.length} className="btn btn-primary mt-5 w-full py-4 text-base">
              {starting ? <Loader2 size={20} className="animate-spin" /> : <Rocket size={20} />} Начать игру
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              Ход пойдёт по номерам — от первой команды к последней и снова по кругу. После старта новые команды
              подключиться не смогут
            </p>
          </motion.section>
        </div>
      </div>
    </div>
  )
}
