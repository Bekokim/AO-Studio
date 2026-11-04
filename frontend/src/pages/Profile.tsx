import { AnimatePresence, motion } from 'framer-motion'
import { Camera, FolderOpen, Loader2, LogOut, Mail, Pencil, Plus, Puzzle, Trash2, Trophy } from '../lib/icons'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import RoomCard from '../components/RoomCard'
import { api, errorMessage, fieldErrors } from '../lib/api'
import type { RoomListItem, User } from '../lib/types'
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
    if (!f.type.startsWith('image/')) return setError('Выберите изображение')
    if (f.size > 5 * 1024 * 1024) return setError('Файл больше 5 МБ')
    setFile(f)
    setRemoved(false)
    setPreview(URL.createObjectURL(f))
    setError('')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return setError('Введите логин')
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
    <Modal open={open} onClose={onClose} title="Редактировать профиль" size="sm">
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
              Загрузить фото
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
                Удалить
              </button>
            )}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Логин</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={150} />
        </label>
        {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}
        <button disabled={saving} className="btn btn-primary w-full">
          {saving && <Loader2 size={18} className="animate-spin" />} Сохранить
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
    <Modal open={open} onClose={onClose} title="Удалить аккаунт" size="sm">
      <div className="space-y-4">
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
          Это действие <b>нельзя отменить</b>. Будут удалены ваш аккаунт, все AO комнаты, вопросы и история игр.
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted">
            Для подтверждения введите ваш логин: <b className="text-fg">{user.username}</b>
          </span>
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </label>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-ghost flex-1">
            Отмена
          </button>
          <button
            onClick={confirm}
            disabled={value !== user.username || loading}
            className="btn flex-1 bg-red-500 text-white hover:bg-red-600"
          >
            {loading && <Loader2 size={18} className="animate-spin" />} Удалить навсегда
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Profile() {
  const { user, logout, refreshMe } = useAuth()
  const openStart = useUI((s) => s.openStart)
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null)
  const [saved, setSaved] = useState<RoomListItem[] | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    api.get<RoomListItem[]>('/rooms/my/').then(({ data }) => setRooms(data)).catch(() => setRooms([]))
    api.get<RoomListItem[]>('/rooms/saved/').then(({ data }) => setSaved(data)).catch(() => setSaved([]))
    refreshMe().catch(() => {})
  }, [refreshMe])

  if (!user) return null

  const doLogout = () => {
    navigate('/', { replace: true })
    void logout()
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10">
      {/* Шапка профиля */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass relative overflow-hidden rounded-3xl">
        {/* Обложка — то же мягкое свечение, что и на остальных страницах, а не плоская заливка */}
        <div className="relative h-24 sm:h-28">
          <div className="absolute inset-0 bg-gradient-to-br from-green-dark/45 via-green/25 to-transparent" />
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(420px 170px at 18% 130%, rgba(16,185,129,0.35), transparent 70%)' }}
          />
        </div>

        <div className="px-5 pb-5 sm:px-8 sm:pb-6">
          {/* В строку — только когда места хватает и имени, и обеим кнопкам: на средних
              ширинах имя иначе ужималось до многоточия */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            {/* Аватар заходит на обложку; подложка в цвет карточки, без жёсткого кольца */}
            <div className="-mt-14 w-fit shrink-0 rounded-full p-1 sm:-mt-16"
              style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--line), 0 12px 32px rgba(16,185,129,0.22)' }}
            >
              <Avatar name={user.username} src={user.avatar} size={104} />
            </div>

            <div className="min-w-0 flex-1 lg:pb-1">
              <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{user.username}</h1>
              <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted">
                <Mail size={15} className="shrink-0" />
                <span className="truncate">{user.email}</span>
              </p>
            </div>

            <div className="flex shrink-0 gap-2 lg:pb-1">
              <button onClick={() => setEditOpen(true)} className="btn btn-ghost flex-1 lg:flex-none">
                <Pencil size={16} /> Редактировать
              </button>
              <button onClick={doLogout} className="btn btn-ghost flex-1 lg:flex-none">
                <LogOut size={16} /> Выйти
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-line">
          {[
            { icon: Puzzle, value: user.rooms_count, label: 'создано AO комнат' },
            { icon: Trophy, value: user.games_played, label: 'сыграно игр' },
          ].map(({ icon: Icon, value, label }, i) => (
            <div key={label} className={`flex items-center gap-3 px-5 py-4 sm:px-8 ${i === 0 ? 'border-r border-line' : ''}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green/10">
                <Icon size={18} className="text-green" />
              </span>
              <div className="min-w-0">
                <div className="text-xl font-extrabold leading-none tabular-nums">{value}</div>
                <div className="mt-1 truncate text-xs text-muted">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Сетка комнат */}
      <div className="mb-5 mt-10 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          Мои AO комнаты {rooms && <span className="ml-1 rounded-full bg-green/15 px-2.5 py-0.5 text-sm text-green">{rooms.length}</span>}
        </h2>
        <button onClick={() => navigate('/create')} className="btn btn-primary">
          <Plus size={18} /> <span className="hidden sm:inline">Создать АО</span>
        </button>
      </div>

      {rooms === null ? (
        <div className="flex justify-center py-16 text-muted">
          <Loader2 className="animate-spin" />
        </div>
      ) : rooms.length === 0 ? (
        <div className="glass rounded-3xl py-14 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green/10">
            <FolderOpen size={30} className="text-green" />
          </span>
          <h3 className="mt-4 text-lg font-bold">У вас пока нет AO комнат</h3>
          <p className="mt-1 text-muted">Создайте первую игру — это займёт пару минут</p>
          <button onClick={() => navigate('/create')} className="btn btn-primary mt-6">
            Создать АО
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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

      {/* Сохранённые — личные копии чужих игр, правятся как свои */}
      {saved !== null && saved.length > 0 && (
        <>
          <div className="mb-5 mt-12 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              Сохранённые AO комнаты
              <span className="ml-1 rounded-full bg-green/15 px-2.5 py-0.5 text-sm text-green">{saved.length}</span>
            </h2>
          </div>
          <p className="-mt-2 mb-5 text-sm text-muted">
            Это ваши копии чужих игр — меняйте вопросы и категории как хотите, у автора ничего не изменится.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
        </>
      )}

      <div className="mt-16 border-t border-line pt-8">
        <h3 className="font-bold text-red-400">Опасная зона</h3>
        <p className="mt-1 text-sm text-muted">Удаление аккаунта необратимо.</p>
        <button onClick={() => setDeleteOpen(true)} className="btn btn-danger mt-4">
          <Trash2 size={16} /> Удалить аккаунт
        </button>
      </div>

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} user={user} />
      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} user={user} />
    </div>
  )
}
