import { tr } from '../lib/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import { Bookmark, Camera, Clock, FolderOpen, Loader2, LogOut, Mail, Pencil, Plus, Puzzle, Trash2, Trophy, type IconProps } from '../lib/icons'
import { useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import ActivityCalendar from '../components/ActivityCalendar'
import Avatar from '../components/Avatar'
import GameHistory from '../components/GameHistory'
import Modal from '../components/Modal'
import RoomCard from '../components/RoomCard'
import { api, errorMessage, fieldErrors } from '../lib/api'
import type { Activity, GameHistoryItem, RoomListItem, User } from '../lib/types'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'

function EditProfileModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: User }) {
  const setUser = useAuth((s) => s.setUser)
  const [username, setUsername] = useState(user.username)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(user.avatar)
  const [removed, setRemoved] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setUsername(user.username)
      setFile(null)
      setPreview(user.avatar)
      setRemoved(false)
      setError('')
    }
  }, [open, user])

  const pick = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError(tr('Выберите изображение'))
    if (f.size > 5 * 1024 * 1024) return setError(tr('Файл больше 5 МБ'))
    setFile(f)
    setRemoved(false)
    setPreview(URL.createObjectURL(f))
    setError('')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return setError(tr('Введите логин'))
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('username', username.trim())
      if (file) fd.append('avatar', file)
      if (removed) fd.append('remove_avatar', 'true')
      const { data } = await api.patch<User>('/auth/me/update/', fd)
      setUser(data)
      onClose()
    } catch (err) {
      const fe = fieldErrors(err)
      setError(fe.username || fe.avatar || errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={tr('Редактировать профиль')} size="sm">
      <form onSubmit={save} className="space-y-5">
        <div className="flex flex-col items-center gap-3">
          <button type="button" onClick={() => inputRef.current?.click()} className="group relative">
            <Avatar name={username || user.username} src={preview} size={104} />
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100">
              <Camera size={26} />
            </div>
          </button>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="flex gap-3 text-sm">
            <button type="button" onClick={() => inputRef.current?.click()} className="text-green hover:underline">
              {tr('Загрузить фото')}
            </button>
            {preview && (
              <button
                type="button"
                onClick={() => {
                  setPreview(null)
                  setFile(null)
                  setRemoved(true)
                }}
                className="text-red-400 hover:underline"
              >
                {tr('Удалить')}
              </button>
            )}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">{tr('Логин')}</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={150} />
        </label>
        {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}
        <button disabled={saving} className="btn btn-primary w-full">
          {saving && <Loader2 size={18} className="animate-spin" />} {tr('Сохранить')}
        </button>
      </form>
    </Modal>
  )
}

function DeleteAccountModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: User }) {
  const clear = useAuth((s) => s.clear)
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setValue('')
      setError('')
    }
  }, [open])

  const confirm = async () => {
    setLoading(true)
    try {
      await api.delete('/auth/me/delete/', { data: { username: value } })
      onClose()
      // Сначала уходим со защищённой страницы, иначе RequireAuth перекинет на /login
      navigate('/', { replace: true })
      clear()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={tr('Удалить аккаунт')} size="sm">
      <div className="space-y-4">
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
          {tr('Это действие')} <b>{tr('нельзя отменить')}</b>{tr('. Будут удалены ваш аккаунт, все AO комнаты, вопросы и история игр.')}
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted">
            {tr('Для подтверждения введите ваш логин:')} <b className="text-fg">{user.username}</b>
          </span>
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </label>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-ghost flex-1">
            {tr('Отмена')}
          </button>
          <button
            onClick={confirm}
            disabled={value !== user.username || loading}
            className="btn flex-1 bg-red-500 text-white hover:bg-red-600"
          >
            {loading && <Loader2 size={18} className="animate-spin" />} {tr('Удалить навсегда')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Функция, а не константа: tr() на уровне модуля не переживёт смену языка
const monthsGenitive = () => [
  tr('января'), tr('февраля'), tr('марта'), tr('апреля'), tr('мая'), tr('июня'),
  tr('июля'), tr('августа'), tr('сентября'), tr('октября'), tr('ноября'), tr('декабря'),
]

/** Заголовок раздела правой колонки — с числом и, при необходимости, кнопкой справа */
function Section({
  title,
  count,
  action,
  hint,
  children,
}: {
  title: string
  count?: number
  action?: ReactNode
  hint?: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-green/15 px-2.5 py-0.5 text-sm font-semibold text-green tabular-nums">{count}</span>
          )}
        </h2>
        {action}
      </div>
      {hint && <p className="-mt-2 mb-4 text-sm text-muted">{hint}</p>}
      {children}
    </section>
  )
}

/** Строка характеристики в левой колонке: значок, число, подпись */
function Stat({ icon: Icon, value, label }: { icon: ComponentType<IconProps>; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Icon size={16} className="shrink-0 text-muted" />
      <span className="font-bold tabular-nums">{value}</span>
      <span className="truncate text-muted">{label}</span>
    </div>
  )
}

/**
 * Профиль: слева — кто это, справа — что он сделал.
 *
 * Раскладка как на GitHub: карточка человека стоит на месте, а длинная лента справа
 * прокручивается. На узком экране колонки складываются в одну, и шапка становится
 * обычной строкой «аватар — имя»: аватар в 240 px занял бы весь первый экран телефона.
 */
export default function Profile() {
  const { user, logout, refreshMe } = useAuth()
  const openStart = useUI((s) => s.openStart)
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null)
  const [saved, setSaved] = useState<RoomListItem[] | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [history, setHistory] = useState<GameHistoryItem[] | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    api.get<RoomListItem[]>('/rooms/my/').then(({ data }) => setRooms(data)).catch(() => setRooms([]))
    api.get<RoomListItem[]>('/rooms/saved/').then(({ data }) => setSaved(data)).catch(() => setSaved([]))
    api.get<Activity>('/auth/me/activity/').then(({ data }) => setActivity(data)).catch(() => {})
    api.get<GameHistoryItem[]>('/game/history/').then(({ data }) => setHistory(data)).catch(() => setHistory([]))
    refreshMe().catch(() => {})
  }, [refreshMe])

  if (!user) return null

  const doLogout = () => {
    navigate('/', { replace: true })
    void logout()
  }

  // «с ноября 2026», а не «с ноябрь 2026 г.»: Intl даёт месяц в именительном падеже
  const d = new Date(user.created_at)
  const since = `${monthsGenitive()[d.getMonth()]} ${d.getFullYear()}`

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr] lg:gap-10">
        {/* Карточка человека */}
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:sticky lg:top-8 lg:self-start"
        >
          <div className="flex items-center gap-4 lg:block">
            <div className="shrink-0 lg:hidden">
              <Avatar name={user.username} src={user.avatar} size={88} className="ring-4 ring-green/20" />
            </div>
            <div className="hidden lg:block">
              <Avatar name={user.username} src={user.avatar} size={240} className="ring-4 ring-green/20" />
            </div>

            <div className="min-w-0 flex-1 lg:mt-4">
              <h1 className="truncate text-2xl font-extrabold leading-tight">{user.username}</h1>
              <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted">
                <Mail size={14} className="shrink-0" />
                <span className="truncate">{user.email}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={() => setEditOpen(true)} className="btn btn-ghost flex-1 py-2">
              <Pencil size={15} /> {tr('Редактировать')}
            </button>
            <button onClick={doLogout} className="btn btn-ghost py-2" title={tr('Выйти')} aria-label={tr('Выйти')}>
              <LogOut size={15} />
            </button>
          </div>

          <div className="mt-5 space-y-2 border-t border-line pt-5">
            <Stat icon={Puzzle} value={user.rooms_count} label={tr('создано AO комнат')} />
            <Stat icon={Trophy} value={user.games_played} label={tr('сыграно игр')} />
            <Stat icon={Bookmark} value={saved?.length ?? 0} label={tr('сохранено у себя')} />
            <div className="flex items-center gap-2.5 pt-1 text-sm text-muted">
              <Clock size={16} className="shrink-0" />
              <span className="truncate">{tr('На сайте с')} {since}</span>
            </div>
          </div>

          <button onClick={() => navigate('/create')} className="btn btn-primary mt-5 w-full py-2.5">
            <Plus size={17} /> {tr('Создать АО')}
          </button>
        </motion.aside>

        {/* Лента: что человек сделал */}
        <div className="min-w-0 space-y-12">
          <Section
            title={tr('Созданные AO комнаты')}
            count={rooms?.length}
            action={
              rooms && rooms.length > 0 ? (
                <button onClick={() => navigate('/create')} className="btn btn-ghost px-3 py-1.5 text-sm">
                  <Plus size={15} /> {tr('Создать')}
                </button>
              ) : undefined
            }
          >
            {rooms === null ? (
              <div className="flex justify-center py-12 text-muted">
                <Loader2 className="animate-spin" />
              </div>
            ) : rooms.length === 0 ? (
              <div className="glass rounded-2xl py-12 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green/10">
                  <FolderOpen size={26} className="text-green" />
                </span>
                <h3 className="mt-3 font-bold">{tr('Пока ни одной комнаты')}</h3>
                <p className="mt-1 text-sm text-muted">{tr('Создайте первую игру — это займёт пару минут')}</p>
                <button onClick={() => navigate('/create')} className="btn btn-primary mt-5">
                  {tr('Создать АО')}
                </button>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <AnimatePresence>
                  {rooms.map((r, i) => (
                    <RoomCard
                      key={r.id}
                      room={r}
                      index={i}
                      showPrivacy
                      showAuthor={false}
                      onClick={() => navigate(`/rooms/${r.id}/edit`)}
                      onPlay={() => openStart(r)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </Section>

          {/* Сохранённые — личные копии чужих игр: правятся как свои, у автора не меняются */}
          {saved !== null && saved.length > 0 && (
            <Section
              title={tr('Сохранённые AO комнаты')}
              count={saved.length}
              hint={tr('Это ваши копии чужих игр — меняйте вопросы и категории как хотите, у автора ничего не изменится.')}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <AnimatePresence>
                  {saved.map((r, i) => (
                    <RoomCard
                      key={r.id}
                      room={r}
                      index={i}
                      showPrivacy
                      showAuthor={false}
                      onClick={() => navigate(`/rooms/${r.id}/edit`)}
                      onPlay={() => openStart(r)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </Section>
          )}

          {activity && (
            <Section title={tr('Активность')}>
              <div className="glass rounded-2xl p-4 sm:p-5">
                <ActivityCalendar data={activity} />
              </div>
            </Section>
          )}

          <Section title={tr('История игр')} count={history?.length}>
            {history === null ? (
              <div className="flex justify-center py-12 text-muted">
                <Loader2 className="animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="glass rounded-2xl py-12 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green/10">
                  <Trophy size={26} className="text-green" />
                </span>
                <h3 className="mt-3 font-bold">{tr('Игр ещё не было')}</h3>
                <p className="mt-1 text-sm text-muted">{tr('Запустите любую комнату — игра появится здесь')}</p>
              </div>
            ) : (
              <GameHistory items={history} />
            )}
          </Section>

          <div className="border-t border-line pt-8">
            <h3 className="font-bold text-red-400">{tr('Опасная зона')}</h3>
            <p className="mt-1 text-sm text-muted">{tr('Удаление аккаунта необратимо.')}</p>
            <button onClick={() => setDeleteOpen(true)} className="btn btn-danger mt-4">
              <Trash2 size={16} /> {tr('Удалить аккаунт')}
            </button>
          </div>
        </div>
      </div>

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} user={user} />
      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} user={user} />
    </div>
  )
}
