import FormatIcon from '../components/FormatIcon'
import { tr } from '../lib/i18n'
import { motion } from 'framer-motion'
import { Loader2, Monitor, QrCode, Search, ShieldCheck, Users } from '../lib/icons'
import { useEffect, useState } from 'react'
import RoomCard from '../components/RoomCard'
import { api } from '../lib/api'
import type { GameFormat, RoomListItem } from '../lib/types'
import { FORMATS } from '../lib/utils'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'

/**
 * Раздел «Доска» — проведение игры с умной доски.
 *
 * Ведущий находит игру, запускает её, и на доске появляется код с QR-кодом: команды
 * подключаются со своих телефонов. Настройки состава и времени — в модалке запуска
 * (BoardStartModal), сам сбор команд — в лобби.
 */
export default function Board() {
  const user = useAuth((s) => s.user)
  const { openAuth, openBoard } = useUI()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [fmt, setFmt] = useState<'' | GameFormat>('')
  const [rooms, setRooms] = useState<RoomListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get<RoomListItem[]>('/rooms/', {
        params: { show: 'available', search: debounced || undefined, fmt: fmt || undefined },
      })
      .then(({ data }) => !cancelled && setRooms(data))
      .catch(() => !cancelled && setRooms([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [debounced, fmt])

  const launch = (room?: RoomListItem) =>
    user ? openBoard(room) : openAuth('login', () => openBoard(room))

  return (
    <div className="px-4 py-8 sm:px-8">
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl">
        <div className="glass rounded-3xl p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="flex items-center gap-3 text-3xl font-extrabold sm:text-4xl">
                <Monitor className="shrink-0 text-green" size={34} /> {tr('Доска')}
              </h1>
              <p className="mt-2 max-w-xl text-muted">
                {tr('Проведите игру на экране или проекторе: выберите игру, задайте состав и время — на доске появятся код и QR-код, команды подключатся со своих телефонов.')}
              </p>
            </div>
            <button onClick={() => launch()} className="btn btn-primary shrink-0 px-5 py-3">
              <Monitor size={18} /> {tr('Запустить на доске')}
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { icon: QrCode, title: tr('Код и QR'), text: tr('Команды сканируют код — аккаунт им не нужен') },
              { icon: Users, title: tr('Состав заранее'), text: tr('Сколько команд и игроков ждём, когда начинать') },
              { icon: ShieldCheck, title: tr('Защита'), text: tr('Уход с экрана телефона — предупреждение и дисквалификация') },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-fg/[0.03] p-4">
                <f.icon size={20} className="text-green" />
                <div className="mt-2 font-bold">{f.title}</div>
                <div className="mt-0.5 text-xs text-muted">{f.text}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.header>

      <div className="mx-auto mt-8 max-w-6xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input pl-11"
              placeholder={tr('Найти игру для доски')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            <button onClick={() => setFmt('')} className={`chip ${fmt === '' ? 'active' : ''}`}>
              {tr('Все')}
            </button>
            {(Object.keys(FORMATS) as GameFormat[]).map((f) => (
              <button key={f} onClick={() => setFmt(f)} className={`chip ${fmt === f ? 'active' : ''}`}>
                <FormatIcon format={f} size={14} /> {FORMATS[f].short}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-muted">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : rooms.length === 0 ? (
          <div className="glass mt-6 rounded-3xl p-10 text-center">
            <div className="text-5xl">🔍</div>
            <p className="mt-3 font-bold">{tr('Игр не нашлось')}</p>
            <p className="mt-1 text-sm text-muted">{tr('Измените поиск или создайте свою игру в разделе «Создать АО».')}</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room, i) => (
              <RoomCard key={room.id} room={room} index={i} onClick={() => launch(room)} onPlay={() => launch(room)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
