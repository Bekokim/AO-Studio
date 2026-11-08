import { motion } from 'framer-motion'
import { tr } from '../lib/i18n'
import { Bookmark, BookmarkCheck, FolderOpen, Globe, HelpCircle, Lock, Play } from '../lib/icons'
import { useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { RoomListItem } from '../lib/types'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import Avatar from './Avatar'
import FormatBadge from './FormatBadge'

interface Props {
  room: RoomListItem
  onClick?: () => void
  onPlay?: () => void
  onSaveChange?: (room: RoomListItem) => void
  showPrivacy?: boolean
  showAuthor?: boolean
  index?: number
}

export default function RoomCard({ room, onClick, onPlay, onSaveChange, showPrivacy, showAuthor = true, index = 0 }: Props) {
  const user = useAuth((s) => s.user)
  const openAuth = useUI((s) => s.openAuth)
  const navigate = useNavigate()
  const [saved, setSaved] = useState(room.is_saved)
  const [copyId, setCopyId] = useState(room.my_copy_id)
  const [saves, setSaves] = useState(room.saves_count)
  const [busy, setBusy] = useState(false)
  const [pop, setPop] = useState(false)

  // Свою комнату сохранять незачем — она и так в профиле
  const isMine = !!user && room.author.id === user.id

  /**
   * Сохранить — значит сделать личную копию: её можно править, оригинал автора не меняется.
   * Если копия уже есть, кнопка ведёт на её редактирование, а не создаёт вторую.
   */
  const onSave = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!user) return openAuth('login')
    if (saved && copyId) return navigate(`/rooms/${copyId}/edit`)
    if (busy) return
    setBusy(true)
    try {
      const { data } = await api.post<{ is_saved: boolean; saves_count: number; copy_id: number }>(
        `/rooms/${room.id}/save/`,
      )
      setSaved(data.is_saved)
      setCopyId(data.copy_id)
      setSaves(data.saves_count)
      setPop(true)
      setTimeout(() => setPop(false), 400)
      onSaveChange?.({ ...room, is_saved: data.is_saved, saves_count: data.saves_count, my_copy_id: data.copy_id })
    } catch {
      /* не сохранилось — состояние кнопки не трогаем */
    } finally {
      setBusy(false)
    }
  }

  const cats = room.format === 'random' ? [] : room.categories

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`glass group flex flex-col rounded-2xl transition-colors hover:border-green/50 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-lg font-bold leading-snug">{room.title}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Своя копия чужой игры: кнопки «сохранить» на ней нет, поэтому её происхождение
                показываем значком — иначе в профиле копия ничем не отличается от своей комнаты */}
            {room.saved_from && (
              <span className="text-green" title={tr('Сохранённая копия')}>
                <BookmarkCheck size={16} />
              </span>
            )}
            {showPrivacy && (
              <span className="text-muted" title={room.is_public ? tr('Публичная') : tr('Приватная')}>
                {room.is_public ? <Globe size={16} /> : <Lock size={16} />}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <FormatBadge format={room.format} />
          {room.format !== 'random' && (
            <span className="inline-flex items-center gap-1">
              <FolderOpen size={14} /> {cats.length} {tr('кат.')}
            </span>
          )}
        </div>

        {room.saved_from && (
          <p className="line-clamp-1 inline-flex items-center gap-1.5 text-xs text-muted">
            <Bookmark size={13} className="shrink-0" />
            {tr('Сохранено из игры')} <span className="text-fg/70">@{room.saved_from.author.username}</span>
          </p>
        )}

        {cats.length > 0 && (
          <p className="line-clamp-1 text-sm text-muted">
            <span className="text-fg/70">{tr('Категории:')}</span> {cats.join(', ')}
          </p>
        )}

        <p className="inline-flex items-center gap-1.5 text-sm text-muted">
          <HelpCircle size={15} /> {tr('Вопросов:')} <span className="font-semibold text-fg">{room.questions_count}</span>
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        {showAuthor ? (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={room.author.username} src={room.author.avatar} size={28} />
            <span className="truncate text-sm text-muted">@{room.author.username}</span>
          </div>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-1">
          {!isMine && (
            <button
              onClick={onSave}
              disabled={busy}
              className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition hover:bg-fg/5 ${saved ? 'text-green' : 'text-muted'}`}
              title={saved ? tr('Открыть мою копию') : tr('Сохранить себе копию — её можно править')}
              aria-label={saved ? tr('Открыть мою копию') : tr('Сохранить себе')}
            >
              <motion.span animate={pop ? { scale: [1, 1.4, 1] } : {}} transition={{ duration: 0.35 }} className="flex">
                {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
              </motion.span>
              {saves > 0 && <span>{saves}</span>}
            </button>
          )}
          {onPlay && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPlay()
              }}
              className="btn btn-primary px-3 py-1.5 text-sm"
            >
              <Play size={14} fill="currentColor" /> {tr('Играть')}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
