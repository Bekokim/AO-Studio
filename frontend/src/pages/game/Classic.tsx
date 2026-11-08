import { AnimatePresence, motion } from 'framer-motion'
import { tr } from '../../lib/i18n'
import { ArrowRight, Check, ChevronRight, Eye, Sparkles, Users } from '../../lib/icons'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import CircularTimer from '../../components/game/CircularTimer'
import GameShell from '../../components/game/GameShell'
import Scoreboard from '../../components/game/Scoreboard'
import { useCountdown, useHotkeys, usePersistentState } from '../../hooks/useGameHooks'
import { useLiveAnswers, usePublishState } from '../../hooks/useLive'
import { checkAnswer } from '../../lib/answers'
import { sounds } from '../../lib/sounds'
import type { LiveState } from '../../lib/types'
import { useGame } from '../../store/game'

type Phase = 'question' | 'reveal' | 'review'

// Сколько показывать правильный ответ, прежде чем сам выйдет следующий вопрос
const REVEAL_MS = 5000

export default function Classic() {
  const { room, teams, addScore, finish, sessionId } = useGame()
  const navigate = useNavigate()

  const cats = (room?.categories ?? []).filter((c) => c.questions.length)
  const [catIdx, setCatIdx] = usePersistentState(`classic_${sessionId}_cat`, 0)
  const [qIdx, setQIdx] = usePersistentState(`classic_${sessionId}_q`, 0)
  const [phase, setPhase] = usePersistentState<Phase>(`classic_${sessionId}_phase`, 'question')
  // Отметки правильных ответов: questionId → [teamId]
  const [marks, setMarks] = usePersistentState<Record<number, number[]>>(`classic_${sessionId}_marks`, {})
  const [running, setRunning] = useState(true)

  const cat = cats[catIdx]
  const q = cat?.questions[qIdx]
  const duration = room?.timer_duration ?? 60
  const { left, reset } = useCountdown(duration, running && phase === 'question', `${catIdx}-${qIdx}-${phase}`)

  useEffect(() => {
    setRunning(true)
  }, [catIdx, qIdx, phase])

  const isLastQ = cat && qIdx >= cat.questions.length - 1
  const isLastCat = catIdx >= cats.length - 1

  const end = async () => {
    await finish()
    navigate('/game/results')
  }

  const next = () => {
    if (phase === 'question' || phase === 'reveal') {
      if (isLastQ) setPhase('review')
      else {
        setQIdx(qIdx + 1)
        setPhase('question')
      }
    } else if (isLastCat) {
      void end()
    } else {
      setCatIdx(catIdx + 1)
      setQIdx(0)
      setPhase('question')
    }
  }

  const toggleMark = (questionId: number, points: number, teamId: number) => {
    const cur = marks[questionId] ?? []
    const on = cur.includes(teamId)
    setMarks({ ...marks, [questionId]: on ? cur.filter((t) => t !== teamId) : [...cur, teamId] })
    addScore(teamId, on ? -points : points)
    if (on) sounds.wrong()
    else sounds.correct()
  }

  useHotkeys({ space: next, p: () => setRunning((r) => !r) })

  // ---------- Онлайн: что видят команды и их ответы ----------
  const liveState: LiveState | null = !cat
    ? null
    : (phase === 'question' || phase === 'reveal') && q
      ? {
          view: 'question',
          category: cat.name,
          number: qIdx + 1,
          total: cat.questions.length,
          duration,
          question: { id: q.id, text: q.text, photo: q.photo, points: q.points },
          // Во время показа ответа приём закрыт
          accepting: phase === 'question',
          reveal: phase === 'reveal' ? q.answer : null,
        }
      : {
          view: 'review',
          category: cat.name,
          accepting: false,
          items: cat.questions.map((cq) => ({
            id: cq.id,
            text: cq.text,
            answer: cq.answer,
            points: cq.points,
            correct: marks[cq.id] ?? [],
          })),
        }
  usePublishState(liveState, phase === 'question' ? { left, running } : null)
  const { answers, online } = useLiveAnswers(cat ? cat.questions.map((x) => x.id) : [])
  const answeredNow = q ? Object.keys(answers[q.id] ?? {}).length : 0

  // Отметить все ответы, совпавшие с правильным (ведущий может поправить вручную)
  const markMatches = () => {
    if (!cat) return
    const next = { ...marks }
    let added = 0
    for (const cq of cat.questions) {
      for (const t of teams) {
        const a = answers[cq.id]?.[t.id]
        const cur = next[cq.id] ?? []
        if (a?.matches && !cur.includes(t.id)) {
          next[cq.id] = [...cur, t.id]
          addScore(t.id, cq.points)
          added++
        }
      }
    }
    setMarks(next)
    if (added) sounds.correct()
  }

  // Каждую пару «вопрос-команда» засчитываем один раз
  const autoChecked = useRef<Set<string>>(new Set())

  // Засчитываем совпавшие ответы на вопрос. Каждую пару «вопрос-команда» проверяем один раз,
  // чтобы ручная правка ведущего не перезаписывалась при следующем опросе.
  const awardQuestion = (questionId: number, points: number) => {
    const cur = marks[questionId] ?? []
    const add: number[] = []
    for (const t of teams) {
      const key = `${questionId}-${t.id}`
      if (autoChecked.current.has(key)) continue
      autoChecked.current.add(key)
      const a = answers[questionId]?.[t.id]
      if (a?.matches && !cur.includes(t.id)) {
        add.push(t.id)
        addScore(t.id, points)
      }
    }
    if (add.length) {
      setMarks({ ...marks, [questionId]: [...cur, ...add] })
      sounds.correct()
    }
  }

  // ---------- Время вышло: показываем ответ, считаем баллы и сами идём дальше ----------
  // Ведущий ждёт только на разборе категории — между вопросами игра движется сама.
  //
  // Отсчёт сбрасывается на следующем кадре после смены вопроса, поэтому сразу после перехода
  // `left` ещё равен нулю от прошлого вопроса. Ждём, пока отсчёт для этого вопроса реально
  // начнётся, иначе игра пролетит все вопросы подряд.
  const questionKey = `${catIdx}-${qIdx}`
  const timerStarted = useRef<string | null>(null)
  const timedOut = useRef<string | null>(null)
  useEffect(() => {
    if (phase !== 'question' || !q) return
    if (left >= duration) timerStarted.current = questionKey
    if (left === 0 && timerStarted.current === questionKey && timedOut.current !== questionKey) {
      timedOut.current = questionKey
      setPhase('reveal')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase, questionKey, duration])

  useEffect(() => {
    if (phase !== 'reveal' || !q) return
    // Ответы команд могли прийти последним опросом — пересчитываем на каждом обновлении
    awardQuestion(q.id, q.points)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q?.id, answers])

  useEffect(() => {
    if (phase !== 'reveal') return
    const t = setTimeout(next, REVEAL_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q?.id])

  // ---------- Автопроверка ----------
  // Онлайн: на разборе совпавшие ответы засчитываются сами. Каждую пару «вопрос-команда» проверяем один раз,
  // чтобы ручная правка ведущего не перезаписывалась при следующем опросе.
  useEffect(() => {
    if (!online || phase !== 'review' || !cat) return
    const next = { ...marks }
    let added = 0
    for (const cq of cat.questions) {
      for (const t of teams) {
        const a = answers[cq.id]?.[t.id]
        const key = `${cq.id}-${t.id}`
        if (!a || autoChecked.current.has(key)) continue
        autoChecked.current.add(key)
        const cur = next[cq.id] ?? []
        if (a.matches && !cur.includes(t.id)) {
          next[cq.id] = [...cur, t.id]
          addScore(t.id, cq.points)
          added++
        }
      }
    }
    if (added) {
      setMarks(next)
      sounds.correct()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, phase, cat?.id, answers])

  // На одном экране: ведущий вписывает ответ команды — проверка и отметка сразу
  const [typed, setTyped] = useState<Record<string, { text: string; result?: boolean }>>({})
  const checkTyped = (questionId: number, points: number, answer: string, altAnswers: string[], teamId: number) => {
    const key = `${questionId}-${teamId}`
    const text = typed[key]?.text ?? ''
    if (!text.trim()) return
    const ok = checkAnswer(text, answer, altAnswers)
    setTyped((m) => ({ ...m, [key]: { text, result: ok } }))
    const on = (marks[questionId] ?? []).includes(teamId)
    if (ok !== on) toggleMark(questionId, points, teamId)
    else if (ok) sounds.correct()
    else sounds.wrong()
  }

  if (!room || room.format !== 'classic') return <Navigate to="/rooms" replace />
  if (!cat) return <Navigate to="/game/results" replace />

  return (
    <GameShell onFinish={end} hotkeys={[{ key: 'Space', label: tr('далее') }, { key: 'P', label: tr('пауза') }]}>
      <div className="grid flex-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_340px]">
        {/* Левая часть — вопрос / разбор */}
        <section className="flex min-h-[60vh] flex-col">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {cats.map((c, i) => (
              <span
                key={c.id}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  i === catIdx ? 'bg-green text-white' : i < catIdx ? 'bg-green/15 text-green' : 'bg-fg/5 text-muted'
                }`}
              >
                {c.name}
              </span>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {(phase === 'question' || phase === 'reveal') && q ? (
              <motion.div
                key={`q-${q.id}`}
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ duration: 0.35 }}
                className="glass flex flex-1 flex-col rounded-3xl p-6 sm:p-10"
              >
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-widest text-green">{cat.name}</div>
                    <div className="mt-1 text-muted">
                      {tr('Вопрос')} {qIdx + 1} {tr('из')} {cat.questions.length} · <b className="text-fg">{q.points}</b> {tr('балл.')}
                    </div>
                  </div>
                  <CircularTimer
                    left={left}
                    total={duration}
                    size={110}
                    running={running}
                    onToggle={() => setRunning((r) => !r)}
                    onReset={() => {
                      reset()
                      setRunning(true)
                    }}
                  />
                </div>

                <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
                  {q.photo && <img src={q.photo} alt="" className="max-h-[40vh] max-w-full rounded-2xl border border-line object-contain" />}
                  <p className="max-w-4xl whitespace-pre-line text-2xl font-bold leading-snug sm:text-4xl">{q.text}</p>
                  <AnimatePresence>
                    {phase === 'reveal' && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-2xl border border-green/40 bg-green/10 px-6 py-4"
                      >
                        <div className="text-xs uppercase tracking-widest text-muted">{tr('Правильный ответ')}</div>
                        <div className="mt-1 text-2xl font-extrabold text-green sm:text-3xl">{q.answer}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="host-only mt-8 flex items-center justify-end gap-4">
                  {online && (
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <Users size={16} /> {tr('Ответили:')} <b className="text-fg">{answeredNow}</b> {tr('из')} {teams.length}
                    </span>
                  )}
                  <span className="text-sm text-muted">
                    {phase === 'reveal'
                      ? isLastQ
                        ? tr('Дальше — разбор категории')
                        : tr('Следующий вопрос выйдет сам')
                      : tr('Когда время выйдет — ответ и баллы появятся сами')}
                  </span>
                  <button onClick={next} className="btn btn-primary px-6 py-3">
                    {isLastQ ? (
                      <>
                        <Eye size={18} /> {tr('К разбору категории')}
                      </>
                    ) : (
                      <>
                        {phase === 'reveal' ? tr('Дальше') : tr('Следующий вопрос')} <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`r-${cat.id}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                className="glass flex flex-1 flex-col rounded-3xl p-5 sm:p-8"
              >
                <h2 className="text-2xl font-extrabold sm:text-3xl">{tr('Правильные ответы')}</h2>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted">
                    {tr('Категория «')}{cat.name}». <span className="host-only">{tr('Отметьте команды, ответившие верно.')}</span>
                  </p>
                  {online && (
                    <button onClick={markMatches} className="host-only btn btn-ghost px-3 py-2 text-sm" title={tr('Отметить ответы, совпавшие с правильным')}>
                      <Sparkles size={16} /> {tr('Отметить совпавшие')}
                    </button>
                  )}
                </div>

                <div className="scrollbar-thin mt-6 flex-1 space-y-3 overflow-y-auto">
                  {cat.questions.map((cq, i) => (
                    <motion.div
                      key={cq.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="rounded-2xl border border-line bg-fg/[0.03] p-4"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green/15 text-xs font-bold text-green">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-muted">{cq.text}</p>
                          <p className="mt-1 text-lg font-bold text-green">→ {cq.answer}</p>
                        </div>
                        <span className="shrink-0 rounded-lg bg-fg/5 px-2 py-1 text-xs font-bold">{cq.points} {tr('б.')}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 pl-10">
                        {teams.map((t) => {
                          const on = (marks[cq.id] ?? []).includes(t.id)
                          const a = answers[cq.id]?.[t.id]
                          return (
                            <motion.button
                              key={t.id}
                              whileTap={{ scale: 0.92 }}
                              onClick={() => toggleMark(cq.id, cq.points, t.id)}
                              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                                on ? 'text-white' : 'border-line text-muted hover:text-fg'
                              }`}
                              style={on ? { background: t.color, borderColor: t.color } : undefined}
                              title={a ? tr('Ответ: {text}', { text: a.text }) : undefined}
                            >
                              {on ? <Check size={14} strokeWidth={3} /> : <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />}
                              {t.name}
                              {online && (
                                <span className={`max-w-[160px] truncate rounded-md px-1.5 text-xs ${on ? 'bg-white/20' : a?.matches ? 'bg-green/15 text-green' : 'bg-fg/5'}`}>
                                  {a ? a.text : '—'}
                                </span>
                              )}
                            </motion.button>
                          )
                        })}
                      </div>
                      {!online && (
                        <div className="host-only mt-2 grid gap-2 pl-10 sm:grid-cols-2 lg:grid-cols-3">
                          {teams.map((t) => {
                            const key = `${cq.id}-${t.id}`
                            const entry = typed[key]
                            return (
                              <form
                                key={t.id}
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  checkTyped(cq.id, cq.points, cq.answer, cq.alt_answers, t.id)
                                }}
                              >
                                <input
                                  className={`input py-1.5 text-sm ${
                                    entry?.result === true ? 'border-green!' : entry?.result === false ? 'invalid' : ''
                                  }`}
                                  placeholder={tr('Ответ «{team}» + Enter', { team: t.name })}
                                  value={entry?.text ?? ''}
                                  onChange={(e) => setTyped((m) => ({ ...m, [key]: { text: e.target.value } }))}
                                  autoComplete="off"
                                />
                              </form>
                            )
                          })}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                <div className="host-only mt-6 flex justify-end">
                  <button onClick={next} className="btn btn-primary px-6 py-3">
                    {isLastCat ? tr('Завершить игру') : (
                      <>
                        {tr('Следующая категория')} <ChevronRight size={18} />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Правая часть — табло */}
        <aside className="glass h-fit rounded-3xl p-4 lg:sticky lg:top-4">
          <h3 className="mb-3 px-1 text-sm font-semibold uppercase tracking-widest text-muted">{tr('Табло')}</h3>
          <Scoreboard teams={teams} onAdjust={addScore} />
        </aside>
      </div>
    </GameShell>
  )
}
