import confetti from 'canvas-confetti'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Ban, Check, CheckCircle2, Crown, Loader2, Lock, LockKeyhole, LogOut, Pencil, Send, ShieldCheck, Trophy, Users, Wifi, WifiOff, X } from '../../lib/icons'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import CircularTimer from '../../components/game/CircularTimer'
import Logo from '../../components/Logo'
import { useAnticheat } from '../../hooks/useAnticheat'
import { getPlayerToken, playerAuth, playerTokenKey, useLiveState, useServerTimer } from '../../hooks/useLive'
import { api, errorMessage } from '../../lib/api'
import { sounds } from '../../lib/sounds'
import type { LiveCell, LivePayload, Participant, Team } from '../../lib/types'
import { plural } from '../../lib/utils'

function TeamChip({ team, big }: { team: Team; big?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold ${big ? 'text-lg' : ''}`}>
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: team.color, boxShadow: `0 0 8px ${team.color}` }} />
      <span className="truncate">{team.name}</span>
    </span>
  )
}

function Standings({ teams, meId }: { teams: Team[]; meId?: number }) {
  // Дисквалифицированные — вне зачёта, в конце списка и без номера места
  const ranked = [...teams].sort(
    (a, b) => Number(!!a.disqualified) - Number(!!b.disqualified) || b.score - a.score,
  )
  return (
    <div className="space-y-1.5">
      {ranked.map((t, i) => (
        <motion.div
          layout
          key={t.id}
          className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
            t.disqualified
              ? 'border-red-400/30 bg-red-400/5 opacity-60'
              : t.id === meId
                ? 'border-green bg-green/10'
                : 'border-line bg-fg/[0.03]'
          }`}
        >
          <span className="w-5 text-center text-sm font-bold text-muted">
            {t.disqualified ? <Ban size={14} className="mx-auto text-red-400" /> : i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <TeamChip team={t} />
            {t.disqualified && <span className="ml-1.5 text-xs font-semibold text-red-400">вне зачёта</span>}
          </span>
          <span className={`text-lg font-extrabold tabular-nums ${t.disqualified ? 'text-muted line-through' : ''}`}>{t.score}</span>
        </motion.div>
      ))}
    </div>
  )
}

/** Состав команды: кто капитан, кто пишет ответы и кто уже вне зачёта */
function Roster({ team, meId }: { team: Team; meId: number }) {
  const list = team.participants ?? []
  return (
    <div className="space-y-1.5">
      {list.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm ${
            p.disqualified ? 'border-red-400/30 bg-red-400/5 opacity-60' : p.id === meId ? 'border-green bg-green/10' : 'border-line'
          }`}
        >
          <span className="min-w-0 flex-1 truncate font-semibold">
            {p.name}
            {p.id === meId && <span className="ml-1.5 text-xs font-normal text-muted">— это вы</span>}
          </span>
          {p.is_captain && (
            <span title="Капитан" className="shrink-0 text-yellow-400">
              <Crown size={14} fill="currentColor" />
            </span>
          )}
          {p.is_answerer && !p.disqualified && (
            <span className="shrink-0 rounded-md bg-green/15 px-1.5 py-0.5 text-[11px] font-bold text-green">отвечает</span>
          )}
          {p.disqualified && <Ban size={14} className="shrink-0 text-red-400" />}
        </div>
      ))}
      {team.size ? (
        <div className="pt-1 text-center text-xs text-muted">
          {list.length} из {team.size} {plural(team.size, 'участника', 'участников', 'участников')} на месте
        </div>
      ) : null}
    </div>
  )
}

/** Капитан назначает, кто пишет ответы. До старта — это и есть готовность команды */
function AnswererPicker({ code, team, compact, onDone }: { code: string; team: Team; compact?: boolean; onDone?: () => void }) {
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState('')
  const list = (team.participants ?? []).filter((p) => !p.disqualified)

  const choose = async (p: Participant) => {
    setSaving(p.id)
    setError('')
    try {
      await api.post(`/live/${code}/answerer/`, { participant_id: p.id }, { headers: playerAuth(code) })
      onDone?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
        <Pencil size={13} /> {compact ? 'Сменить отвечающего' : 'Кто пишет ответы'}
      </div>
      <div className="space-y-1.5">
        {list.map((p) => (
          <button
            key={p.id}
            onClick={() => choose(p)}
            disabled={saving !== null}
            className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
              p.is_answerer ? 'border-green bg-green/10' : 'border-line hover:border-green/60'
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
            {saving === p.id ? (
              <Loader2 size={15} className="shrink-0 animate-spin text-green" />
            ) : p.is_answerer ? (
              <Check size={15} className="shrink-0 text-green" />
            ) : null}
          </button>
        ))}
      </div>
      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
    </div>
  )
}

/** Экран участника, который сейчас не отвечает: телефон занят игрой */
function LockedScreen({ team, meId, answerer }: { team: Team; meId: number; answerer?: Participant }) {
  return (
    <div className="glass rounded-3xl p-6 text-center">
      <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 2.5 }} className="inline-block">
        <Lock className="text-green" size={46} />
      </motion.div>
      <h1 className="mt-3 text-xl font-extrabold">Телефон занят игрой</h1>
      <p className="mt-2 text-muted">
        {answerer ? (
          <>
            За команду отвечает <b className="text-fg">{answerer.name}</b>. Подсказывайте вслух — а телефон пусть
            остаётся на этом экране.
          </>
        ) : (
          <>Капитан ещё не назначил, кто пишет ответы.</>
        )}
      </p>
      <div className="mt-4 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-3.5 text-left text-sm">
        <div className="flex items-center gap-2 font-bold text-yellow-400">
          <AlertTriangle size={15} /> Не уходите с этого экрана
        </div>
        <p className="mt-1 text-muted">
          Свернуть игру, открыть другую вкладку или погасить экран — нарушение. Экран мы держим включённым сами.
        </p>
      </div>
      <div className="mt-5 text-left">
        <Roster team={team} meId={meId} />
      </div>
    </div>
  )
}

/** Экран входа в защищённый режим. Показывается только в лобби — во время игры он стоил бы команде времени. */
function ArmGate({ warnings, allowed, onArm }: { warnings: number; allowed: number; onArm: () => void }) {
  const returning = warnings > 0
  return (
    <div className="glass rounded-3xl p-6 text-center">
      <LockKeyhole className="mx-auto text-green" size={44} />
      <h1 className="mt-3 text-2xl font-extrabold">{returning ? 'Вернитесь в игру' : 'Защищённый режим'}</h1>
      <p className="mt-2 text-muted">
        Включите его до старта: игра раскроется на весь экран, и вы не потеряете время на вопросах.
      </p>
      <ul className="mt-5 space-y-2 text-left text-sm text-muted">
        <li className="flex gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-yellow-400" />
          Нельзя сворачивать игру, открывать другие вкладки и приложения.
        </li>
        <li className="flex gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-yellow-400" />
          {allowed > 0
            ? 'Первый уход с экрана — предупреждение, следующий — вы вне зачёта.'
            : 'Любой уход с экрана — вы вне зачёта.'}
        </li>
        <li className="flex gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-yellow-400" />
          Двое выбывших из команды — и команда снимается с игры.
        </li>
      </ul>
      {returning && (
        <div className="mt-5 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-sm font-semibold text-yellow-400">
          У вас {warnings} из {allowed + 1} нарушений. Ещё одно — и вы вне зачёта.
        </div>
      )}
      <button onClick={onArm} className="btn btn-primary mt-6 w-full py-3.5 text-base">
        <ShieldCheck size={20} /> {returning ? 'Вернуться в игру' : 'Войти в игру'}
      </button>
    </div>
  )
}

/** Экран выбывшего участника или снятой команды */
function DqScreen({ title, reason, note, teams, meTeamId }: { title: string; reason: string; note: string; teams: Team[]; meTeamId: number }) {
  return (
    <div className="glass rounded-3xl border-red-400/40 p-6 text-center">
      <Ban className="mx-auto text-red-400" size={48} />
      <h1 className="mt-3 text-2xl font-extrabold text-red-400">{title}</h1>
      <p className="mt-2 text-muted">{reason || 'Вы покинули экран игры.'}</p>
      <p className="mt-3 text-sm text-muted">{note}</p>
      <div className="mt-6 text-left">
        <Standings teams={teams} meId={meTeamId} />
      </div>
    </div>
  )
}

/** Поле ответа. После отправки ответ изменить нельзя — поле блокируется. */
function AnswerBox({ code, questionId, current }: { code: string; questionId: number; current: string | null }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(current)

  // Новый вопрос — чистое поле
  useEffect(() => {
    setText('')
    setSent(current)
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId])

  useEffect(() => setSent((s) => s ?? current), [current])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sent) return
    setSending(true)
    setError('')
    try {
      const { data } = await api.post<{ text: string }>(
        `/live/${code}/answer/`,
        { question_id: questionId, text: text.trim() },
        { headers: playerAuth(code) },
      )
      setSent(data.text)
      sounds.flip()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-5 rounded-2xl border border-green/40 bg-green/10 p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-green">
          <Check size={16} /> Ответ отправлен
        </div>
        <div className="mt-1 text-lg font-bold">{sent}</div>
        <div className="mt-1.5 text-xs text-muted">Изменить его уже нельзя — ждём остальных.</div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-5">
      <div className="flex gap-2">
        <input
          className="input py-3.5 text-lg"
          placeholder="Ваш ответ"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" disabled={sending || !text.trim()} className="btn btn-primary px-5">
          {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
        </button>
      </div>
      <div className="mt-2 text-xs text-muted">Ответ отправляется один раз — проверьте перед отправкой.</div>
      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
    </form>
  )
}

function Board({
  cells,
  columns,
  code,
  data,
  myTeamId,
  canPick,
}: {
  cells?: LiveCell[]
  columns?: { name: string; cells: LiveCell[] }[]
  code: string
  data: LivePayload
  myTeamId: number
  canPick: boolean
}) {
  const myTurn = data.state.active_team === myTeamId && canPick
  const [picked, setPicked] = useState<number | null>(null)
  const [error, setError] = useState('')

  const pick = async (id: number) => {
    if (!myTurn) return
    setPicked(id)
    setError('')
    try {
      await api.post(`/live/${code}/pick/`, { question_id: id }, { headers: playerAuth(code) })
    } catch (err) {
      setPicked(null)
      setError(errorMessage(err))
    }
  }

  const cell = (c: LiveCell, label: string | number) => {
    const team = c.team ? data.teams.find((t) => t.id === c.team) : null
    const can = myTurn && !c.used
    return (
      <button
        key={c.id}
        disabled={!can}
        onClick={() => pick(c.id)}
        className={`relative flex aspect-[4/3] items-center justify-center rounded-xl border text-xl font-extrabold transition ${
          c.used
            ? 'border-line bg-fg/5 text-fg/20'
            : picked === c.id
              ? 'border-green bg-green text-white'
              : can
                ? 'border-green/60 bg-green/15 text-green active:scale-95'
                : 'border-line bg-fg/[0.04] text-fg/70'
        }`}
      >
        {label}
        {c.used && team && (
          <span className="absolute bottom-1 right-1.5 flex items-center gap-0.5">
            <span className="h-2 w-2 rounded-full" style={{ background: team.color }} />
            {c.correct ? <Check size={11} className="text-green" /> : <X size={11} className="text-red-400" />}
          </span>
        )}
      </button>
    )
  }

  const activeTeam = data.teams.find((x) => x.id === data.state.active_team)
  return (
    <div>
      <div className={`mb-4 rounded-2xl border p-3 text-center font-bold ${myTurn ? 'border-green bg-green/15 text-green' : 'border-line'}`}>
        {myTurn ? (
          <motion.span animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="inline-block">
            Ваш ход! Выберите {columns ? 'вопрос' : 'карточку'}
          </motion.span>
        ) : data.state.active_team === myTeamId ? (
          <span className="text-muted">Ход вашей команды — выбирает тот, кто пишет ответы</span>
        ) : (
          <span className="text-muted">Выбирает: {activeTeam ? <TeamChip team={activeTeam} /> : '…'}</span>
        )}
      </div>
      {error && <div className="mb-3 text-center text-sm text-red-400">{error}</div>}
      {columns ? (
        <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
          <div className="grid min-w-max gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(76px, 1fr))` }}>
            {columns.map((col) => (
              <div key={col.name} className="flex flex-col gap-2">
                <div className="flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-br from-green to-green-dark p-1.5 text-center text-xs font-bold uppercase text-white">
                  {col.name}
                </div>
                {col.cells.map((c) => cell(c, c.points ?? ''))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">{(cells ?? []).map((c) => cell(c, c.n ?? ''))}</div>
      )}
    </div>
  )
}

export default function Play() {
  const { code = '' } = useParams()
  const upper = code.toUpperCase()
  const navigate = useNavigate()
  const { data, error, fetchedAt, refresh } = useLiveState(upper)
  const timer = useServerTimer(data?.timer, fetchedAt)
  const lastQuestion = useRef<number | null>(null)
  const confettiDone = useRef(false)

  const state = data?.state ?? {}
  const finished = data?.status === 'finished' || state.view === 'results'
  // В лобби времени нет — там защищённый режим включается заслонкой
  const inLobby = data?.status === 'lobby' || state.view === 'lobby'

  // Античит: уход с экрана = нарушение лично этому участнику (см. useAnticheat)
  const ac = useAnticheat({
    code: upper,
    enabled: !!data?.anticheat,
    active: data?.status === 'active' && !finished,
    server: data?.me
      ? { warnings: data.me.warnings ?? 0, disqualified: !!data.me.disqualified, dq_reason: data.me.dq_reason ?? '' }
      : null,
  })

  // Игра закончилась — отпускаем телефон
  useEffect(() => {
    if (finished && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [finished])

  // Звук на новый вопрос, конфетти в конце
  useEffect(() => {
    const qid = state.view === 'question' ? state.question?.id ?? null : null
    if (qid && qid !== lastQuestion.current) sounds.flip()
    lastQuestion.current = qid
  }, [state.view, state.question?.id])

  useEffect(() => {
    if (finished && !confettiDone.current) {
      confettiDone.current = true
      sounds.fanfare()
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.4 }, colors: ['#10B981', '#34D399', '#FBBF24', '#ffffff'] })
    }
  }, [finished])

  if (!getPlayerToken(upper)) return <Navigate to={`/join/${upper}`} replace />

  if (error === 'not_found') {
    return (
      <Centered>
        <div className="text-5xl">🔍</div>
        <h1 className="mt-3 text-xl font-bold">Игра не найдена</h1>
        <p className="mt-1 text-muted">Проверьте код у ведущего</p>
        <Link to="/join" className="btn btn-primary mt-6">Ввести другой код</Link>
      </Centered>
    )
  }

  if (!data) {
    return (
      <Centered>
        <Loader2 className="animate-spin text-green" size={32} />
        <p className="mt-3 text-muted">Подключаемся к игре…</p>
      </Centered>
    )
  }

  // Ведущий убрал команду (или токен от другой игры)
  if (!data.me) {
    localStorage.removeItem(playerTokenKey(upper))
    return (
      <Centered>
        <div className="text-5xl">🚪</div>
        <h1 className="mt-3 text-xl font-bold">Вы не в этой игре</h1>
        <p className="mt-1 text-muted">Возможно, ведущий убрал вашу команду из списка.</p>
        {data.status === 'lobby' && (
          <button onClick={() => navigate(`/join/${upper}`)} className="btn btn-primary mt-6">Присоединиться снова</button>
        )}
      </Centered>
    )
  }

  const me = data.me
  const myTeam = data.my_team ?? data.teams.find((t) => t.id === me.team_id)
  if (!myTeam) {
    return (
      <Centered>
        <Loader2 className="animate-spin text-green" size={32} />
      </Centered>
    )
  }

  const answerer = (myTeam.participants ?? []).find((p) => p.is_answerer)
  const place = [...data.teams].sort((a, b) => b.score - a.score).findIndex((t) => t.id === myTeam.id) + 1
  const q = state.question
  const answeringTeam = state.answer_team ? data.teams.find((t) => t.id === state.answer_team) : null
  const canAnswer =
    me.is_answerer && state.view === 'question' && state.accepting && q && (!state.answer_team || state.answer_team === myTeam.id)
  const teamDq = !!myTeam.disqualified && !ac.disqualified
  // Отвечающего капитан меняет между вопросами: пока вопрос открыт, это был бы способ тянуть время
  const canSwitchAnswerer = me.is_captain && !finished && state.view !== 'question' && !myTeam.disqualified

  return (
    <div className="relative min-h-screen pb-10">
      <div className="bg-aurora" />

      {/* Шапка: игра, моя команда и моя роль */}
      <header className="glass sticky top-0 z-20 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-2.5">
        <Logo size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-muted">
            {me.name}
            {me.is_captain && ' · капитан'}
            {me.is_answerer && ' · отвечает'}
          </div>
          <TeamChip team={myTeam} />
        </div>
        <div className="text-right">
          <div className="text-xl font-extrabold leading-none tabular-nums">{myTeam.score}</div>
          <div className="text-[10px] text-muted">{place} место</div>
        </div>
        <span title={error ? 'Нет связи' : 'Онлайн'} className={error ? 'text-red-400' : 'text-green'}>
          {error ? <WifiOff size={16} /> : <Wifi size={16} />}
        </span>
        {data.anticheat && !finished && (
          <span
            title={
              ac.disqualified
                ? 'Вы вне зачёта'
                : ac.warnings > 0
                  ? `Нарушений: ${ac.warnings} из ${(data.warnings_allowed ?? 1) + 1}`
                  : 'Защищённый режим включён'
            }
            className={ac.disqualified ? 'text-red-400' : ac.warnings > 0 ? 'text-yellow-400' : 'text-green'}
          >
            {ac.disqualified ? <Ban size={16} /> : ac.warnings > 0 ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
          </span>
        )}
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-4 pt-5">
        {/* Предупреждение после первого ухода с экрана */}
        <AnimatePresence>
          {ac.lastWarning && !ac.disqualified && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 flex items-start gap-3 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4"
            >
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-yellow-400" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-bold text-yellow-400">Предупреждение {ac.warnings} из {(data.warnings_allowed ?? 1) + 1}</div>
                <div className="mt-0.5 text-muted">{ac.lastWarning}. Ещё одно нарушение — и вы вне зачёта.</div>
              </div>
              <button onClick={ac.dismiss} className="shrink-0 rounded-lg p-1 text-muted hover:text-fg" aria-label="Скрыть">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/*
          Напоминание о полном экране во время игры — полоской, а не заслонкой:
          таймер вопроса общий для всех, и закрытый экран стоил бы команде времени.
        */}
        {!finished && !ac.disqualified && !teamDq && ac.needsArm && !inLobby && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4"
          >
            <ShieldCheck size={20} className="shrink-0 text-yellow-400" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-bold text-yellow-400">Игра идёт не на весь экран</div>
              <div className="mt-0.5 text-muted">Время на вопрос идёт — верните полный экран, не выходя из игры.</div>
            </div>
            <button onClick={ac.arm} className="btn btn-primary shrink-0 px-4 py-2 text-sm">
              Во весь экран
            </button>
          </motion.div>
        )}

        {!finished && ac.disqualified ? (
          <DqScreen
            title="Вы вне зачёта"
            reason={ac.dqReason}
            note="Вы больше не можете отвечать и выбирать вопросы. Команда играет дальше, но если выбудет ещё один участник — её снимут. Если это ошибка, подойдите к ведущему: он может вернуть вас в игру."
            teams={data.teams}
            meTeamId={myTeam.id}
          />
        ) : !finished && teamDq ? (
          <DqScreen
            title="Команда снята с игры"
            reason={myTeam.dq_reason ?? ''}
            note="Ответы больше не принимаются, баллы заморожены. Если это ошибка — подойдите к ведущему: он может вернуть команду в игру."
            teams={data.teams}
            meTeamId={myTeam.id}
          />
        ) : !finished && ac.needsArm && inLobby ? (
          <ArmGate warnings={ac.warnings} allowed={data.warnings_allowed ?? 1} onArm={ac.arm} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${finished ? 'results' : state.view}-${me.is_answerer ? 'a' : 'w'}-${q?.id ?? ''}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {finished ? (
                <div className="glass rounded-3xl p-6 text-center">
                  <Trophy className="mx-auto text-yellow-400" size={44} />
                  <h1 className="mt-3 text-2xl font-extrabold">Игра окончена!</h1>
                  <p className="mt-1 text-muted">
                    Ваша команда — <b className="text-fg">{place} место</b> с {myTeam.score} баллами
                  </p>
                  <div className="mt-6 text-left">
                    <Standings teams={data.teams} meId={myTeam.id} />
                  </div>
                  <Link
                    to="/"
                    onClick={() => localStorage.removeItem(playerTokenKey(upper))}
                    className="btn btn-ghost mt-6"
                  >
                    <LogOut size={16} /> На главную
                  </Link>
                </div>
              ) : inLobby ? (
                /* Комната ожидания: состав собирается, капитан назначает отвечающего */
                <div className="glass rounded-3xl p-6">
                  <div className="text-center">
                    <CheckCircle2 size={48} className="mx-auto text-green" />
                    <h1 className="mt-3 text-2xl font-extrabold">Вы в команде «{myTeam.name}»</h1>
                    <p className="mt-1 text-muted">
                      {myTeam.ready
                        ? 'Команда готова. Ждём остальных и старт от ведущего.'
                        : me.is_captain
                          ? 'Назначьте, кто будет писать ответы, — и команда готова.'
                          : 'Капитан выбирает, кто будет писать ответы.'}
                    </p>
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
                      <Users size={13} /> Состав
                    </div>
                    <Roster team={myTeam} meId={me.id} />
                  </div>

                  {me.is_captain && (
                    <div className="mt-5">
                      <AnswererPicker code={upper} team={myTeam} onDone={refresh} />
                    </div>
                  )}

                  {myTeam.ready && (
                    <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-green/40 bg-green/10 p-3 text-sm font-bold text-green">
                      <CheckCircle2 size={16} /> Команда готова
                    </div>
                  )}

                  {data.anticheat && (
                    <div className="mt-5 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4 text-left text-sm">
                      <div className="flex items-center gap-2 font-bold text-yellow-400">
                        <ShieldCheck size={16} /> Игра идёт в защищённом режиме
                      </div>
                      <p className="mt-1.5 text-muted">
                        После старта игра развернётся на весь экран у каждого. Нельзя сворачивать её, переключаться
                        на другие вкладки и приложения: первый раз — предупреждение, второй — вы вне зачёта. Двое
                        выбывших — и команду снимают с игры. Отключите уведомления и не принимайте звонки.
                      </p>
                    </div>
                  )}

                  <div className="mt-5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
                      Команды ({data.teams.length}
                      {data.expected_teams ? ` из ${data.expected_teams}` : ''})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.teams.map((t) => (
                        <span
                          key={t.id}
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                            t.id === myTeam.id ? 'border-green bg-green/10' : 'border-line'
                          }`}
                        >
                          <TeamChip team={t} />
                          {t.ready && <Check size={13} className="text-green" />}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : !me.is_answerer ? (
                /* Не отвечает — телефон занят заглушкой */
                <div>
                  <LockedScreen team={myTeam} meId={me.id} answerer={answerer} />
                  {canSwitchAnswerer && (
                    <div className="glass mt-4 rounded-3xl p-5">
                      <AnswererPicker code={upper} team={myTeam} compact onDone={refresh} />
                      <p className="mt-2 text-xs text-muted">Поменять можно между вопросами, пока следующий не открыт.</p>
                    </div>
                  )}
                </div>
              ) : state.view === 'question' && q ? (
                <div className="glass rounded-3xl p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {state.category && <div className="text-xs font-semibold uppercase tracking-widest text-green">{state.category}</div>}
                      <div className="mt-1 text-sm text-muted">
                        {state.number && state.total ? `Вопрос ${state.number} из ${state.total} · ` : ''}
                        {q.points ? <b className="text-fg">{q.points} балл.</b> : null}
                      </div>
                    </div>
                    {timer && (
                      <CircularTimer
                        left={timer.left}
                        exact={timer.exact}
                        // Полный круг — время на вопрос, заданное ведущим
                        total={state.duration ?? Math.max(timer.left, 1)}
                        size={76}
                        showControls={false}
                        running={data.timer?.running}
                      />
                    )}
                  </div>

                  {q.photo && <img src={q.photo} alt="" className="mt-4 max-h-[35vh] w-full rounded-2xl border border-line object-contain" />}
                  <p className="mt-4 whitespace-pre-line text-xl font-bold leading-snug sm:text-2xl">{q.text}</p>

                  {state.reveal ? (
                    <div className="mt-5 rounded-2xl border border-green/40 bg-green/10 p-4 text-center">
                      <div className="text-xs uppercase tracking-widest text-muted">Правильный ответ</div>
                      <div className="mt-1 text-xl font-extrabold text-green">{state.reveal}</div>
                      {data.my_answer && <div className="mt-2 text-sm text-muted">Ваш ответ: {data.my_answer}</div>}
                    </div>
                  ) : canAnswer ? (
                    <AnswerBox code={upper} questionId={q.id} current={data.my_answer} />
                  ) : answeringTeam && answeringTeam.id !== myTeam.id ? (
                    <div className="mt-5 rounded-2xl border border-line p-4 text-center text-muted">
                      Отвечает команда <TeamChip team={answeringTeam} />
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-line p-4 text-center text-muted">
                      {data.my_answer ? `Ваш ответ принят: «${data.my_answer}». Ждём ведущего…` : 'Приём ответов закрыт'}
                    </div>
                  )}
                </div>
              ) : state.view === 'review' && state.items ? (
                <div className="glass rounded-3xl p-5">
                  <h2 className="text-xl font-extrabold">Правильные ответы</h2>
                  {state.category && <p className="text-sm text-muted">Категория «{state.category}»</p>}
                  <div className="mt-4 space-y-2.5">
                    {state.items.map((it, i) => {
                      const ok = it.correct.includes(myTeam.id)
                      return (
                        <div key={it.id} className="rounded-2xl border border-line bg-fg/[0.03] p-3.5">
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-xs font-bold text-muted">{i + 1}.</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-muted">{it.text}</p>
                              <p className="font-bold text-green">→ {it.answer}</p>
                            </div>
                            <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${ok ? 'bg-green text-white' : 'bg-fg/5 text-muted'}`}>
                              {ok ? `+${it.points}` : '—'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : state.view === 'grid' ? (
                <Board columns={state.columns} code={upper} data={data} myTeamId={myTeam.id} canPick={me.is_answerer} />
              ) : state.view === 'tiles' ? (
                <Board cells={state.tiles} code={upper} data={data} myTeamId={myTeam.id} canPick={me.is_answerer} />
              ) : (
                <Centered inline>
                  <Loader2 className="animate-spin text-green" size={28} />
                  <p className="mt-3 text-muted">Ведущий готовит следующий вопрос…</p>
                </Centered>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Капитан-отвечающий меняет сменщика, не покидая игрового экрана */}
        {!finished && !inLobby && me.is_answerer && canSwitchAnswerer && !ac.disqualified && (
          <div className="glass mt-4 rounded-3xl p-5">
            <AnswererPicker code={upper} team={myTeam} compact onDone={refresh} />
          </div>
        )}

        {!finished && !inLobby && !ac.disqualified && !teamDq && (
          <section className="mt-6">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
              <Crown size={14} /> Табло
            </div>
            <Standings teams={data.teams} meId={myTeam.id} />
          </section>
        )}
      </main>
    </div>
  )
}

function Centered({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={`relative flex flex-col items-center justify-center px-4 text-center ${inline ? 'py-16' : 'min-h-screen'}`}>
      {!inline && <div className="bg-aurora" />}
      <div className="relative z-10 flex flex-col items-center">{children}</div>
    </div>
  )
}
