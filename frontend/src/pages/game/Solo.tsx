import confetti from 'canvas-confetti'
import PatternBackground from '../../components/PatternBackground'
import { tr } from '../../lib/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, CheckCircle2, Flag, HelpCircle, Home, MinusCircle, Rocket, RotateCcw, Send, Target, Trophy, X, XCircle } from '../../lib/icons'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import CircularTimer from '../../components/game/CircularTimer'
import FormatBadge from '../../components/FormatBadge'
import Logo from '../../components/Logo'
import Modal from '../../components/Modal'
import { useCountdown, usePersistentState } from '../../hooks/useGameHooks'
import { checkAnswer } from '../../lib/answers'
import { sounds } from '../../lib/sounds'
import type { Question } from '../../lib/types'
import { plural, shuffle } from '../../lib/utils'
import { useGame } from '../../store/game'
import { useUI } from '../../store/ui'

interface SoloResult {
  given: string
  correct: boolean
}

interface Cell {
  q: Question
  label: string | number
  points: number
  category?: string
}

/** «Один»: игрок сам выбирает вопросы, вводит ответы, сайт проверяет и считает баллы */
export default function Solo() {
  const { room, teams, sessionId, addScore, finish, reset } = useGame()
  const openStart = useUI((s) => s.openStart)
  const navigate = useNavigate()
  const me = teams[0]

  const [results, setResults] = usePersistentState<Record<number, SoloResult>>(`solo_${sessionId}_results`, {})
  const randomOrder = useMemo(
    () => (room?.format === 'random' ? shuffle(room.questions.map((q) => q.id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room?.id],
  )
  const [order] = usePersistentState<number[]>(`solo_${sessionId}_order`, randomOrder)

  // Поле вопросов: колонки по категориям (классический/стратегический) или карточки (слепой)
  const { columns, tiles, all } = useMemo(() => {
    if (!room) return { columns: [], tiles: [] as Cell[], all: [] as Cell[] }
    if (room.format === 'random') {
      const byId = new Map(room.questions.map((q) => [q.id, q]))
      const tiles = order
        .map((id, i) => byId.get(id) && { q: byId.get(id)!, label: i + 1, points: 1 })
        .filter(Boolean) as Cell[]
      return { columns: [], tiles, all: tiles }
    }
    const columns = room.categories
      .filter((c) => c.questions.length)
      .map((c) => ({
        name: c.name,
        cells: [...c.questions]
          .sort((a, b) => (room.format === 'strategic' ? a.points - b.points : 0) || a.order - b.order)
          .map((q) => ({ q, label: q.points, points: q.points, category: c.name })),
      }))
    return { columns, tiles: [] as Cell[], all: columns.flatMap((c) => c.cells) }
  }, [room, order])

  const [openId, setOpenId] = useState<number | null>(null)
  const current = all.find((c) => c.q.id === openId) ?? null
  const answered = Object.keys(results).length
  const correctCount = Object.values(results).filter((r) => r.correct).length
  const done = all.length > 0 && answered >= all.length
  const [finishedEarly, setFinishedEarly] = usePersistentState(`solo_${sessionId}_finished`, false)
  const finished = done || finishedEarly

  // Конец игры — фиксируем на сервере, фанфары
  const celebrated = useRef(false)
  useEffect(() => {
    if (!finished || celebrated.current) return
    celebrated.current = true
    void finish()
    if (correctCount > 0) {
      sounds.fanfare()
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.4 }, colors: ['#10B981', '#34D399', '#FBBF24', '#ffffff'] })
    }
  }, [finished, correctCount, finish])

  if (!room || !me) return <Navigate to="/rooms" replace />

  const submit = (cell: Cell, given: string) => {
    if (results[cell.q.id]) return
    const correct = checkAnswer(given, cell.q.answer, cell.q.alt_answers)
    setResults({ ...results, [cell.q.id]: { given: given.trim(), correct } })
    if (correct) {
      addScore(me.id, cell.points)
      sounds.correct()
    } else sounds.wrong()
  }

  const playAgain = () => {
    const r = room
    navigate('/rooms')
    setTimeout(() => {
      reset()
      const count = r.questions.length + r.categories.reduce((n, c) => n + c.questions.length, 0)
      openStart({ ...r, categories: r.categories.map((c) => c.name), questions_count: count })
    }, 300)
  }

  const cellButton = (c: Cell, i: number) => {
    const res = results[c.q.id]
    return (
      <motion.button
        key={c.q.id}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: Math.min(i * 0.02, 0.4) }}
        whileHover={res ? {} : { y: -3, scale: 1.03 }}
        whileTap={res ? {} : { scale: 0.95 }}
        disabled={!!res}
        onClick={() => setOpenId(c.q.id)}
        className={`relative flex aspect-[4/3] items-center justify-center rounded-2xl border text-2xl font-extrabold transition-colors sm:text-3xl ${
          res
            ? res.correct
              ? 'border-green/50 bg-green/15 text-green'
              : 'border-red-400/40 bg-red-400/10 text-red-400'
            : 'glass text-fg hover:border-green hover:text-green'
        }`}
      >
        {res ? (res.correct ? <Check size={28} strokeWidth={3} /> : <X size={28} strokeWidth={3} />) : c.label}
        {!res && room.format === 'random' && <span className="absolute right-2 top-1.5 text-sm opacity-50">?</span>}
      </motion.button>
    )
  }

  const score = me.score

  return (
    <div className="relative min-h-screen pb-12">
      <PatternBackground />

      <header className="glass sticky top-0 z-20 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-2.5 sm:px-6">
        <Logo size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold leading-tight">{room.title}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <FormatBadge format={room.format} compact />
            <span className="text-xs text-muted">{tr('Одиночная игра')}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold leading-none tabular-nums text-green">{score}</div>
          <div className="text-[11px] text-muted">{plural(score, tr('балл'), tr('балла'), tr('баллов'))}</div>
        </div>
        {!finished && (
          <button onClick={() => setFinishedEarly(true)} className="btn btn-ghost px-3 py-2 text-sm" title={tr('Завершить игру')}>
            <Flag size={16} /> <span className="hidden sm:inline">{tr('Завершить')}</span>
          </button>
        )}
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        {finished ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass mx-auto max-w-2xl rounded-3xl p-6 text-center sm:p-10">
            {/* Значок по результату: кубок за полный проход, мишень за половину и больше,
                ракета, когда есть куда расти. Цвет задаём сами — у смайлов он свой в каждой системе */}
            {(() => {
              const perfect = correctCount === all.length
              const good = correctCount >= all.length / 2
              const Icon = perfect ? Trophy : good ? Target : Rocket
              return (
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-green/10">
                  <Icon size={40} style={{ color: perfect ? '#fbbf24' : 'var(--green)' }} />
                </span>
              )
            })()}
            <h1 className="mt-4 text-3xl font-extrabold">{tr('Игра окончена!')}</h1>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { v: score, l: plural(score, tr('балл'), tr('балла'), tr('баллов')) },
                { v: `${correctCount}/${all.length}`, l: tr('верных ответов') },
                { v: `${all.length ? Math.round((correctCount / all.length) * 100) : 0}%`, l: tr('точность') },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-line bg-fg/[0.03] p-4">
                  <div className="text-gradient text-3xl font-extrabold">{s.v}</div>
                  <div className="mt-1 text-xs text-muted">{s.l}</div>
                </div>
              ))}
            </div>

            {Object.values(results).some((r) => !r.correct) && (
              <div className="mt-8 text-left">
                <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted">{tr('Работа над ошибками')}</div>
                <div className="space-y-2">
                  {all
                    .filter((c) => results[c.q.id] && !results[c.q.id].correct)
                    .map((c) => (
                      <div key={c.q.id} className="rounded-xl border border-line bg-fg/[0.03] p-3 text-sm">
                        <p className="text-muted">{c.q.text}</p>
                        <p className="mt-1">
                          <span className="text-red-400 line-through">{results[c.q.id].given || '—'}</span>{' '}
                          <span className="font-bold text-green">→ {c.q.answer}</span>
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button onClick={playAgain} className="btn btn-primary px-6">
                <RotateCcw size={18} /> {tr('Сыграть ещё раз')}
              </button>
              <button
                onClick={() => {
                  navigate('/')
                  setTimeout(reset, 300)
                }}
                className="btn btn-ghost px-6"
              >
                <Home size={18} /> {tr('На главную')}
              </button>
            </div>
          </motion.div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-muted">
                <Target size={18} className="text-green" /> {tr('Нажмите на любой вопрос и введите ответ')}
              </p>
              <span className="text-sm text-muted">
                {tr('Отвечено')} <b className="text-fg">{answered}</b> {tr('из')} {all.length}
              </span>
            </div>
            <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-fg/10">
              <motion.div className="h-full bg-green" animate={{ width: `${all.length ? (answered / all.length) * 100 : 0}%` }} />
            </div>

            {room.format === 'random' ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">{tiles.map(cellButton)}</div>
            ) : (
              <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-2">
                <div className="grid min-w-max gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
                  {columns.map((col) => (
                    <div key={col.name} className="flex flex-col gap-3">
                      <div className="flex min-h-[56px] items-center justify-center rounded-2xl bg-gradient-to-br from-green to-green-dark p-2 text-center text-sm font-extrabold uppercase tracking-wide text-white">
                        {col.name}
                      </div>
                      {col.cells.map(cellButton)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <QuestionModal
        cell={current}
        result={current ? results[current.q.id] : undefined}
        duration={room.timer_duration}
        onSubmit={submit}
        onClose={() => setOpenId(null)}
      />
    </div>
  )
}

function QuestionModal({
  cell, result, duration, onSubmit, onClose,
}: {
  cell: Cell | null
  result?: SoloResult
  duration: number
  onSubmit: (cell: Cell, given: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [running, setRunning] = useState(true)
  const { left, reset } = useCountdown(duration, !!cell && !result && running, cell?.q.id)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText('')
    setRunning(true)
    reset()
    setTimeout(() => inputRef.current?.focus(), 250)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell?.q.id])

  // Время вышло — отправляем то, что успели написать
  useEffect(() => {
    if (cell && !result && left === 0) onSubmit(cell, text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  const send = (e: FormEvent) => {
    e.preventDefault()
    if (cell && text.trim()) onSubmit(cell, text)
  }

  return (
    <Modal open={!!cell} onClose={onClose} size="lg">
      {cell && (
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              {cell.category && <div className="text-sm font-semibold uppercase tracking-widest text-green">{cell.category}</div>}
              <div className="text-gradient mt-1 text-3xl font-extrabold">
                {cell.points} {plural(cell.points, tr('балл'), tr('балла'), tr('баллов'))}
              </div>
            </div>
            {!result && <CircularTimer left={left} total={duration} size={90} running={running} onToggle={() => setRunning((r) => !r)} />}
          </div>

          {cell.q.photo && <img src={cell.q.photo} alt="" className="max-h-[35vh] w-full rounded-2xl border border-line object-contain" />}
          <p className="whitespace-pre-line text-xl font-bold leading-snug sm:text-2xl">{cell.q.text}</p>

          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`rounded-2xl border p-5 text-center ${result.correct ? 'border-green/50 bg-green/10' : 'border-red-400/40 bg-red-400/10'}`}
              >
                <div className={`text-2xl font-extrabold ${result.correct ? 'text-green' : 'text-red-400'}`}>
                  <span className="inline-flex items-center gap-2">
                    {result.correct ? <CheckCircle2 size={24} /> : result.given ? <XCircle size={24} /> : <MinusCircle size={24} />}
                    {result.correct ? tr('Верно! +{n}', { n: cell.points }) : result.given ? tr('Неверно') : tr('Без ответа')}
                  </span>
                </div>
                {!result.correct && result.given && <div className="mt-2 text-muted">{tr('Ваш ответ:')} {result.given}</div>}
                <div className="mt-3 text-sm uppercase tracking-widest text-muted">{tr('Правильный ответ')}</div>
                <div className="mt-1 text-xl font-bold text-green">{cell.q.answer}</div>
                <button onClick={onClose} className="btn btn-primary mt-5 px-6" autoFocus>
                  {tr('Дальше')} <ArrowRight size={18} />
                </button>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={send} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    className="input py-3.5 text-lg"
                    placeholder={tr('Ваш ответ')}
                    value={text}
                    maxLength={500}
                    autoComplete="off"
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button type="submit" disabled={!text.trim()} className="btn btn-primary px-5">
                    <Send size={20} /> <span className="hidden sm:inline">{tr('Ответить')}</span>
                  </button>
                </div>
                <button type="button" onClick={() => onSubmit(cell, '')} className="mt-3 flex items-center gap-1.5 text-sm text-muted hover:text-fg">
                  <HelpCircle size={15} /> {tr('Не знаю — показать ответ')}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      )}
    </Modal>
  )
}
