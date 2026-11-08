import { AnimatePresence, motion } from 'framer-motion'
import { tr } from '../lib/i18n'
import { ArrowLeft, Loader2, Rocket, Search } from '../lib/icons'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../lib/api'
import type { GameSession, RoomDetail, RoomListItem } from '../lib/types'
import { plural } from '../lib/utils'
import { useAuth } from '../store/auth'
import { useGame } from '../store/game'
import { useUI } from '../store/ui'
import FormatBadge from './FormatBadge'
import Modal from './Modal'

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function StartGameModal() {
  const { startModal, startRoom, closeStart } = useUI()
  const startGame = useGame((s) => s.start)
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2>(1)
  const [room, setRoom] = useState<RoomListItem | null>(null)
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [rooms, setRooms] = useState<RoomListItem[]>([])
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  // Сброс при открытии: имя по умолчанию — логин игрока
  useEffect(() => {
    if (!startModal) return
    setName(user?.username ?? '')
    setError('')
    setSearch('')
    if (startRoom) {
      setRoom(startRoom)
      setStep(2)
    } else {
      setRoom(null)
      setStep(1)
    }
  }, [startModal, startRoom])

  useEffect(() => {
    if (!startModal || step !== 1) return
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
  }, [startModal, step, q])


  const begin = async () => {
    if (!room) return
    setStarting(true)
    setError('')
    try {
      const [{ data: detail }, { data: session }] = await Promise.all([
        api.get<RoomDetail>(`/rooms/${room.id}/`),
        api.post<GameSession>('/game/start/', {
          room_id: room.id,
          mode: 'solo',
          teams: [{ name: name.trim() || (user?.username ?? tr('Игрок')), color: '#10B981' }],
        }),
      ])
      startGame(session.id, detail, session.teams, 'solo', null, false)
      // Чистим прогресс предыдущей игры
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('ao_progress'))
        .forEach((k) => sessionStorage.removeItem(k))
      closeStart()
      navigate('/game/solo')
    } catch (err) {
      setError(errorMessage(err, tr('Не удалось начать игру.')))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Modal
      open={startModal}
      onClose={closeStart}
      size="lg"
      title={
        <div className="flex items-center gap-3">
          {step === 2 && !startRoom && (
            <button onClick={() => setStep(1)} className="rounded-full p-1.5 text-muted hover:bg-fg/10 hover:text-fg" aria-label={tr('Назад')}>
              <ArrowLeft size={18} />
            </button>
          )}
          <span>{step === 1 ? tr('Выберите игру') : tr('Одиночная игра')}</span>
        </div>
      }
    >
      <div className="mb-5 flex gap-2">
        {[1, 2].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step >= s ? 'bg-green' : 'bg-line'}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div key="s1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="relative mb-4">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input pl-10"
                placeholder={tr('Поиск комнаты по названию…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="scrollbar-thin -mx-1 max-h-[50vh] space-y-2 overflow-y-auto px-1">
              {loadingRooms && !rooms.length ? (
                <div className="flex justify-center py-10 text-muted">
                  <Loader2 className="animate-spin" />
                </div>
              ) : rooms.length === 0 ? (
                <div className="py-10 text-center text-muted">{tr('Комнаты не найдены')}</div>
              ) : (
                rooms.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRoom(r)
                      setStep(2)
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-fg/[0.02] p-4 text-left transition hover:border-green/60 hover:bg-green/5"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.title}</div>
                      <div className="mt-1 text-xs text-muted">
                        @{r.author.username} · {r.questions_count} {plural(r.questions_count, tr('вопрос'), tr('вопроса'), tr('вопросов'))}
                      </div>
                    </div>
                    <FormatBadge format={r.format} compact />
                  </button>
                ))
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            {room && (
              <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-green/30 bg-green/10 p-4">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-widest text-muted">{tr('Играем')}</div>
                  <div className="truncate font-bold">{room.title}</div>
                </div>
                <FormatBadge format={room.format} compact />
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-muted">{tr('Ваше имя')}</span>
              <input
                className="input py-3.5 text-lg"
                placeholder={tr('Как вас записать в итогах')}
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void begin()}
                autoFocus
              />
            </label>

            <div className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              {tr('Вы проходите игру в одиночку: открываете любой вопрос, вводите ответ — сайт')} <b className="text-fg">{tr('сразу проверяет')}</b> {tr('его и начисляет баллы. В конце — итог и работа над ошибками.')}
              <div className="mt-2">
                {tr('Собрать команды и сыграть с ведущим можно в разделе')} <b className="text-fg">{tr('«Доска»')}</b>.
              </div>
            </div>

            {error && <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}

            <button onClick={begin} disabled={starting} className="btn btn-primary mt-5 w-full py-3.5 text-base">
              {starting ? <Loader2 size={20} className="animate-spin" /> : <Rocket size={20} />} {tr('Играть')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
