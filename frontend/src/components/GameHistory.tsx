import { useState } from 'react'
import { tr } from '../lib/i18n'
import { Crown, Trophy, User as UserIcon, Users } from '../lib/icons'
import type { GameHistoryItem } from '../lib/types'
import { FORMATS, plural } from '../lib/utils'
import FormatIcon from './FormatIcon'

const SHOWN = 8

/** «вчера, 21:40» для свежих игр и «7 ноября 2026» для старых — так список читается глазами */
function when(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (days < 1 && d.getDate() === new Date().getDate()) return tr('сегодня, {time}', { time })
  if (days < 2) return tr('вчера, {time}', { time })
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function GameHistory({ items }: { items: GameHistoryItem[] }) {
  const [all, setAll] = useState(false)
  const list = all ? items : items.slice(0, SHOWN)

  return (
    <div className="glass overflow-hidden rounded-2xl">
      {list.map((g, i) => {
        const solo = g.mode === 'solo'
        const top = g.teams[0]
        return (
          <div key={g.id} className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${i ? 'border-t border-line' : ''}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green/10 text-green">
              <FormatIcon format={g.room.format} size={18} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{g.room.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                <span>{when(g.created_at)}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  {solo ? <UserIcon size={12} /> : <Users size={12} />}
                  {solo ? tr('Одиночная') : `${g.teams.length} ${plural(g.teams.length, tr('команда'), tr('команды'), tr('команд'))}`}
                </span>
                <span>·</span>
                <span>{FORMATS[g.room.format].short}</span>
                {g.status === 'active' && <span className="text-yellow-400">{tr('· не доиграна')}</span>}
              </div>
            </div>

            <div className="shrink-0 text-right">
              {g.winner ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  <Crown size={14} className="text-yellow-400" fill="currentColor" />
                  <span className="max-w-[9rem] truncate">{g.winner}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                  <Trophy size={14} />
                  {top ? top.score : 0}
                </span>
              )}
              {g.winner && top && <div className="text-xs text-muted tabular-nums">{top.score}</div>}
            </div>
          </div>
        )
      })}

      {items.length > SHOWN && (
        <button
          onClick={() => setAll((v) => !v)}
          className="w-full border-t border-line py-2.5 text-sm font-semibold text-green transition hover:bg-fg/5"
        >
          {all ? tr('Свернуть') : tr('Показать все ({n})', { n: items.length })}
        </button>
      )}
    </div>
  )
}
