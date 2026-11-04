import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Clock, Loader2, Minus, Monitor, Plus, Search, ShieldCheck, Sparkles, Users } from '../lib/icons'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../lib/api'
import type { GameSession, RoomDetail, RoomListItem } from '../lib/types'
import { plural } from '../lib/utils'
import { useGame } from '../store/game'
import { useUI } from '../store/ui'
import FormatBadge from './FormatBadge'
import Modal from './Modal'

/**
 * Запуск игры с умной доски.
 *
 * Отличается от обычного запуска: ведущий заранее задаёт состав (сколько команд ждём и сколько
 * игроков в команде) и время на вопрос, а игра может начаться сама, как только все команды
 * соберутся по QR-коду. Кнопка «Начать игру» в лобби при этом остаётся — на всякий случай.
 */

// Одинаковый набор во всех форматах и режимах
const TIMERS = [30, 45, 60]

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Счётчик «− N +» для состава команд */
function Counter({
  value,
  min,
  max,
  onChange,
  hint,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  hint: string
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="btn btn-ghost h-10 w-10 shrink-0 p-0 disabled:opacity-30"
        aria-label="Меньше"
      >
        <Minus size={16} />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <div className="text-2xl font-extrabold tabular-nums">{value}</div>
        <div className="text-[11px] text-muted">{hint}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="btn btn-ghost h-10 w-10 shrink-0 p-0 disabled:opacity-30"
        aria-label="Больше"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

export default function BoardStartModal() {
  const { boardModal, boardRoom, closeBoard } = useUI()
  const startGame = useGame((s) => s.start)
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2>(1)
  const [room, setRoom] = useState<RoomListItem | null>(null)
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [rooms, setRooms] = useState<RoomListItem[]>([])
  const [loadingRooms, setLoadingRooms] = useState(false)

  const [teams, setTeams] = useState(4)
  const [timer, setTimer] = useState(60)
  const [autostart, setAutostart] = useState(true)
  const [anticheat, setAnticheat] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  // Сброс при открытии: если комнату выбрали заранее — сразу к настройкам
  useEffect(() => {
    if (!boardModal) return
    setError('')
    setSearch('')
    setStarting(false)
    if (boardRoom) {
      setRoom(boardRoom)
      setTimer(TIMERS.includes(boardRoom.timer_duration) ? boardRoom.timer_duration : 60)
      setStep(2)
    } else {
      setRoom(null)
      setStep(1)
    }
  }, [boardModal, boardRoom])

  // Поиск игр — только те, что можно запустить
  useEffect(() => {
    if (!boardModal || step !== 1) return
    let cancelled = false
    setLoadingRooms(true)
    api
      .get<RoomListItem[]>('/rooms/', { params: { show: 'available', search: q || undefined } })
      .then(({ data }) => !cancelled && setRooms(data))
      .catch(() => !cancelled && setRooms([]))
      .finally(() => !cancelled && setLoadingRooms(false))
    return () => {
      cancelled = true
    }
  }, [boardModal, step, q])

  const pick = (r: RoomListItem) => {
    setRoom(r)
    setTimer(TIMERS.includes(r.timer_duration) ? r.timer_duration : 60)
    setStep(2)
  }

  const launch = async () => {
    if (!room) return
    setStarting(true)
    setError('')
    try {
      const [{ data: detail }, { data: session }] = await Promise.all([
        api.get<RoomDetail>(`/rooms/${room.id}/`),
        api.post<GameSession>('/game/start/', {
          room_id: room.id,
          mode: 'online',
          board: true,
          anticheat,
          expected_teams: teams,
          autostart,
          timer_duration: timer,
          teams: [],
        }),
      ])
      // Время, выбранное для этой игры, важнее записанного в комнате
      startGame(
        session.id,
        { ...detail, timer_duration: session.timer_duration ?? detail.timer_duration },
        session.teams,
        'online',
        session.code,
        session.anticheat,
        session.board,
      )
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('ao_progress'))
        .forEach((k) => sessionStorage.removeItem(k))
      closeBoard()
      navigate('/game/lobby')
    } catch (err) {
      setError(errorMessage(err, 'Не удалось запустить игру.'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Modal
      open={boardModal}
      onClose={closeBoard}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Monitor size={20} className="text-green" /> Запуск с доски
        </span>
      }
    >
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div key="pick" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
            <p className="mb-4 text-sm text-muted">Выберите игру, которую проведёте на доске.</p>

            <div className="relative mb-4">
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input pl-11"
                placeholder="Поиск по названию"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="scrollbar-thin max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {loadingRooms ? (
                <div className="flex justify-center py-10 text-muted">
                  <Loader2 className="animate-spin" />
                </div>
              ) : rooms.length === 0 ? (
                <p className="py-10 text-center text-muted">Ничего не нашлось. Попробуйте другое название.</p>
              ) : (
                rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pick(r)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left transition hover:border-green/50 hover:bg-green/5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{r.title}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {r.questions_count} {plural(r.questions_count, 'вопрос', 'вопроса', 'вопросов')}
                      </div>
                    </div>
                    <FormatBadge format={r.format} compact />
                  </button>
                ))
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="setup" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
            {room && (
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-fg/[0.03] p-3">
                {!boardRoom && (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-lg p-1.5 text-muted transition hover:bg-fg/10 hover:text-fg"
                    aria-label="Выбрать другую игру"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-widest text-muted">Играем</div>
                  <div className="truncate font-bold">{room.title}</div>
                </div>
                <FormatBadge format={room.format} compact />
              </div>
            )}

            {/* Сколько команд ждём: каждая играет с одного устройства */}
            <div className="rounded-xl border border-line p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Users size={16} className="text-green" /> Команд в игре
              </div>
              <Counter value={teams} min={1} max={40} onChange={setTeams} hint={plural(teams, 'команда', 'команды', 'команд')} />
              <p className="mt-3 text-xs text-muted">
                Команда играет с одного устройства — подключается кто-то один за всю команду.
              </p>
            </div>

            {/* Время на вопрос */}
            <div className="mt-4 rounded-xl border border-line p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Clock size={16} className="text-green" /> Время на вопрос
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {TIMERS.map((t) => (
                  <button key={t} type="button" onClick={() => setTimer(t)} className={`chip ${timer === t ? 'active' : ''}`}>
                    {t} сек
                  </button>
                ))}
              </div>
            </div>

            {/* Автостарт по сбору всех команд */}
            <button
              type="button"
              onClick={() => setAutostart((v) => !v)}
              className={`mt-3 flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                autostart ? 'border-green bg-green/10' : 'border-line hover:border-green/40'
              }`}
            >
              <Sparkles size={20} className={`mt-0.5 shrink-0 ${autostart ? 'text-green' : 'text-muted'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 font-semibold">
                  Начать автоматически
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${autostart ? 'bg-green text-white' : 'bg-fg/10 text-muted'}`}
                  >
                    {autostart ? 'Вкл' : 'Выкл'}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-muted">
                  Как только соберутся все {teams} {plural(teams, 'команда', 'команды', 'команд')} — игра начнётся
                  сама. Кнопка «Начать игру» в лобби всё равно останется.
                </span>
              </span>
            </button>

            {/* Защита от списывания */}
            <button
              type="button"
              onClick={() => setAnticheat((v) => !v)}
              className={`mt-3 flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                anticheat ? 'border-green bg-green/10' : 'border-line hover:border-green/40'
              }`}
            >
              <ShieldCheck size={20} className={`mt-0.5 shrink-0 ${anticheat ? 'text-green' : 'text-muted'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 font-semibold">
                  Защита от списывания
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${anticheat ? 'bg-green text-white' : 'bg-fg/10 text-muted'}`}
                  >
                    {anticheat ? 'Вкл' : 'Выкл'}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-muted">
                  Телефон каждого игрока держит игру на весь экран. Свернул или открыл другую вкладку —
                  предупреждение, второй раз — бан.
                </span>
              </span>
            </button>

            {error && <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}

            <button onClick={launch} disabled={starting} className="btn btn-primary mt-5 w-full py-3.5 text-base">
              {starting ? <Loader2 size={20} className="animate-spin" /> : <Monitor size={20} />} Показать код и QR
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              На доске появится код и QR-код — команды сканируют его со своих телефонов
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
