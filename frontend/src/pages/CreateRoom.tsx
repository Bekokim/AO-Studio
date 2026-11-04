import FormatIcon from '../components/FormatIcon'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FolderPlus, Globe, Loader2, Lock, Trash2 } from '../lib/icons'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Modal from '../components/Modal'
import QuestionList, { newQuestion, type QDraft } from '../components/QuestionEditor'
import { api, errorMessage } from '../lib/api'
import type { GameFormat, Question, RoomDetail } from '../lib/types'
import { FORMATS, uid } from '../lib/utils'
import { useAuth } from '../store/auth'

interface CDraft {
  key: string
  id?: number
  name: string
  questions: QDraft[]
}

const STEPS = ['Название и формат', 'Вопросы', 'Настройки']
// Одинаковый набор во всех форматах и режимах
const TIMERS = [30, 45, 60]

function toDraft(q: Question): QDraft {
  return {
    key: uid(),
    id: q.id,
    text: q.text,
    answer: q.answer,
    altAnswers: q.alt_answers ?? [],
    points: q.points,
    photoFile: null,
    photoUrl: q.photo,
    removePhoto: false,
  }
}

function questionPayload(q: QDraft) {
  return {
    ...(q.id ? { id: q.id } : {}),
    text: q.text.trim(),
    answer: q.answer.trim(),
    // Пустые поля в отправку не уходят
    alt_answers: q.altAnswers.map((a) => a.trim()).filter(Boolean),
    points: q.points,
    remove_photo: q.removePhoto,
  }
}

export default function CreateRoom() {
  const { id } = useParams()
  const editId = id ? Number(id) : null
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<GameFormat | null>(null)
  const [categories, setCategories] = useState<CDraft[]>([])
  const [questions, setQuestions] = useState<QDraft[]>([newQuestion()])
  const [newCat, setNewCat] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [timer, setTimer] = useState(60)
  const [description, setDescription] = useState('')

  // Режим редактирования — загружаем комнату
  useEffect(() => {
    if (!editId) return
    api
      .get<RoomDetail>(`/rooms/${editId}/`)
      .then(({ data }) => {
        if (user && data.author.id !== user.id) {
          navigate('/rooms', { replace: true })
          return
        }
        setTitle(data.title)
        setFormat(data.format)
        setCategories(data.categories.map((c) => ({ key: uid(), id: c.id, name: c.name, questions: c.questions.map(toDraft) })))
        setQuestions(data.questions.length ? data.questions.map(toDraft) : [newQuestion()])
        setIsPublic(data.is_public)
        setTimer(TIMERS.includes(data.timer_duration) ? data.timer_duration : 60)
        setDescription(data.description)
      })
      .catch(() => setError('Не удалось загрузить комнату'))
      .finally(() => setLoading(false))
  }, [editId, user, navigate])

  // Смена формата: переносим вопросы между «категориями» и плоским списком
  const chooseFormat = (f: GameFormat) => {
    if (f === 'random' && format !== 'random' && categories.length) {
      const flat = categories.flatMap((c) => c.questions)
      if (flat.length) setQuestions(flat)
    }
    if (f !== 'random' && format === 'random' && !categories.length) {
      const filled = questions.filter((q) => q.text.trim() || q.answer.trim())
      if (filled.length) setCategories([{ key: uid(), name: 'Общая', questions: filled }])
    }
    setFormat(f)
  }

  const addCategory = (e?: FormEvent) => {
    e?.preventDefault()
    const name = newCat.trim()
    if (!name) return
    setCategories((cs) => [...cs, { key: uid(), name, questions: [newQuestion()] }])
    setNewCat('')
  }

  const allQuestions = format === 'random' ? questions : categories.flatMap((c) => c.questions)

  const stepError = (s: number): string => {
    if (s === 0) {
      if (!title.trim()) return 'Введите название игры'
      if (!format) return 'Выберите формат игры'
    }
    if (s === 1) {
      if (format !== 'random') {
        if (!categories.length) return 'Добавьте хотя бы одну категорию'
        if (categories.some((c) => !c.name.trim())) return 'У всех категорий должно быть название'
      }
      if (!allQuestions.length) return 'Добавьте хотя бы один вопрос'
      if (allQuestions.some((q) => !q.text.trim() || !q.answer.trim())) return 'Заполните текст и ответ у всех вопросов'
    }
    if (s === 2 && (!timer || timer < 5 || timer > 3600)) return 'Таймер: от 5 до 3600 секунд'
    return ''
  }

  const goTo = (s: number) => {
    if (s > step) {
      for (let i = step; i < s; i++) {
        const err = stepError(i)
        if (err) {
          setError(err)
          setShowErrors(true)
          return
        }
      }
    }
    setError('')
    setShowErrors(false)
    setDir(s > step ? 1 : -1)
    setStep(s)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    for (let i = 0; i < 3; i++) {
      const err = stepError(i)
      if (err) {
        setError(err)
        setShowErrors(true)
        if (i !== step) goTo(i)
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        title: title.trim(),
        format,
        timer_duration: timer,
        is_public: isPublic,
        description: description.trim(),
        ...(format === 'random'
          ? { questions: questions.map(questionPayload), categories: [] }
          : {
              categories: categories.map((c) => ({ ...(c.id ? { id: c.id } : {}), name: c.name.trim(), questions: c.questions.map(questionPayload) })),
              questions: [],
            }),
      }
      const { data } = editId
        ? await api.patch<RoomDetail>(`/rooms/${editId}/`, payload)
        : await api.post<RoomDetail>('/rooms/', payload)

      // Загружаем фото: сервер вернул вопросы в том же порядке
      const saved: Question[] = format === 'random' ? data.questions : data.categories.flatMap((c) => c.questions)
      const uploads = allQuestions
        .map((q, i) => ({ q, saved: saved[i] }))
        .filter(({ q, saved }) => q.photoFile && saved)
        .map(({ q, saved }) => {
          const fd = new FormData()
          fd.append('photo', q.photoFile as File)
          return api.patch(`/questions/${saved.id}/`, fd)
        })
      await Promise.all(uploads)
      navigate('/profile')
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить комнату'))
    } finally {
      setSaving(false)
    }
  }

  const deleteRoom = async () => {
    if (!editId) return
    await api.delete(`/rooms/${editId}/`)
    navigate('/profile')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32 text-muted">
        <Loader2 size={32} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 md:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold">{editId ? 'Редактировать АО' : 'Создать АО'}</h1>
        {editId && (
          <button onClick={() => setDeleteOpen(true)} className="btn btn-danger px-3 py-2 text-sm">
            <Trash2 size={16} /> <span className="hidden sm:inline">Удалить</span>
          </button>
        )}
      </div>

      {/* Прогресс-бар */}
      <div className="glass mb-8 rounded-2xl p-3">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <button onClick={() => goTo(i)} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left">
                <motion.span
                  animate={{ scale: step === i ? 1.1 : 1 }}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    i < step ? 'bg-green text-white' : i === step ? 'bg-gradient-to-br from-green to-green-dark text-white shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-fg/10 text-muted'
                  }`}
                >
                  {i < step ? <Check size={18} /> : i + 1}
                </motion.span>
                <span className={`hidden text-sm font-semibold sm:block ${i === step ? 'text-fg' : 'text-muted'}`}>{s}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="mx-2 h-1 flex-1 overflow-hidden rounded-full bg-fg/10">
                  <motion.div className="h-full bg-green" animate={{ width: i < step ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          initial={{ opacity: 0, x: dir * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -40 }}
          transition={{ duration: 0.25 }}
        >
          {step === 0 && (
            <div className="space-y-8">
              <label className="block">
                <span className="mb-2 block font-semibold">Название игры</span>
                <input
                  className={`input py-3.5 text-lg ${showErrors && !title.trim() ? 'invalid' : ''}`}
                  placeholder="Например: Python для начинающих"
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </label>
              <div>
                <span className="mb-3 block font-semibold">Кто увидит игру</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { v: true, icon: Globe, label: 'Публичная', text: 'Видна всем в AO комнатах и в поиске' },
                    {
                      v: false,
                      icon: Lock,
                      label: 'Приватная',
                      text: 'В списке не показывается: её найдут, только набрав название целиком, или откроют по ссылке',
                    },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setIsPublic(o.v)}
                      className={`glass rounded-2xl p-4 text-left transition ${isPublic === o.v ? 'border-green! bg-green/10' : 'hover:border-green/40'}`}
                    >
                      <div className="font-semibold">{o.label}</div>
                      <div className="mt-1 text-xs text-muted">{o.text}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-3 block font-semibold">Формат игры</span>
                <div className="grid gap-4 md:grid-cols-3">
                  {(Object.keys(FORMATS) as GameFormat[]).map((f) => {
                    const on = format === f
                    return (
                      <motion.button
                        key={f}
                        type="button"
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => chooseFormat(f)}
                        className={`glass relative rounded-2xl p-5 text-left transition-colors ${
                          on ? 'border-green! bg-green/10 shadow-[0_0_30px_rgba(16,185,129,0.2)]' : 'hover:border-green/40'
                        } ${showErrors && !format ? 'border-red-400/60' : ''}`}
                      >
                        {on && <CheckCircle2 className="absolute right-4 top-4 text-green" size={22} />}
                        <FormatIcon format={f} size={38} className="text-green" />
                        <div className="mt-3 text-lg font-bold">{FORMATS[f].label}</div>
                        <p className="mt-1.5 text-sm text-muted">{FORMATS[f].description}</p>
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              {format === 'random' ? (
                <div className="glass rounded-2xl p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold">Вопросы для карточек</h2>
                    <span className="text-sm text-muted">{questions.length} шт.</span>
                  </div>
                  <QuestionList questions={questions} onChange={setQuestions} showErrors={showErrors} />
                </div>
              ) : (
                <>
                  <form onSubmit={addCategory} className="glass flex gap-2 rounded-2xl p-3">
                    <input className="input" placeholder="Название категории, например «История»" value={newCat} maxLength={100} onChange={(e) => setNewCat(e.target.value)} />
                    <button type="submit" disabled={!newCat.trim()} className="btn btn-primary">
                      <FolderPlus size={18} /> <span className="hidden sm:inline">Добавить</span>
                    </button>
                  </form>

                  {categories.length === 0 && (
                    <div className={`rounded-2xl border border-dashed py-12 text-center text-muted ${showErrors ? 'border-red-400/60' : 'border-line'}`}>
                      Добавьте первую категорию
                    </div>
                  )}

                  <AnimatePresence initial={false}>
                    {categories.map((c, ci) => (
                      <motion.div
                        key={c.key}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        className="glass rounded-2xl p-5"
                      >
                        <div className="mb-4 flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green to-green-dark font-bold text-white">
                            {ci + 1}
                          </span>
                          <input
                            className={`input border-transparent bg-transparent px-2 text-lg font-bold focus:bg-fg/5 ${showErrors && !c.name.trim() ? 'invalid' : ''}`}
                            value={c.name}
                            maxLength={100}
                            placeholder="Название категории"
                            onChange={(e) => setCategories((cs) => cs.map((x) => (x.key === c.key ? { ...x, name: e.target.value } : x)))}
                          />
                          <span className="hidden shrink-0 text-sm text-muted sm:block">{c.questions.length} вопр.</span>
                          <button
                            type="button"
                            onClick={() => setCategories((cs) => cs.filter((x) => x.key !== c.key))}
                            className="shrink-0 rounded-lg p-2 text-muted hover:bg-red-400/10 hover:text-red-400"
                            aria-label="Удалить категорию"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        <QuestionList
                          withPoints={format === 'strategic'}
                          questions={c.questions}
                          showErrors={showErrors}
                          onChange={(qs) => setCategories((cs) => cs.map((x) => (x.key === c.key ? { ...x, questions: qs } : x)))}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="glass rounded-2xl p-5">
                <span className="mb-3 block font-semibold">⏱️ Таймер на вопрос</span>
                <div className="flex flex-wrap gap-2">
                  {TIMERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTimer(t)}
                      className={`chip px-5 py-2 text-base ${timer === t ? 'active' : ''}`}
                    >
                      {t}с
                    </button>
                  ))}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <span className="mb-3 block font-semibold">
                  Описание комнаты <span className="font-normal text-muted">(необязательно)</span>
                </span>
                <textarea className="input min-h-[100px]" placeholder="О чём эта игра, для какой аудитории…" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="glass rounded-2xl p-5 text-sm">
                <div className="mb-2 font-semibold">Итог</div>
                <div className="grid grid-cols-2 gap-2 text-muted sm:grid-cols-4">
                  <div>
                    Формат: <b className="text-fg">{format && FORMATS[format].label}</b>
                  </div>
                  {format !== 'random' && (
                    <div>
                      Категорий: <b className="text-fg">{categories.length}</b>
                    </div>
                  )}
                  <div>
                    Вопросов: <b className="text-fg">{allQuestions.length}</b>
                  </div>
                  <div>
                    Таймер: <b className="text-fg">{timer}с</b>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sticky bottom-20 z-20 mt-8 flex justify-between gap-3 md:bottom-4">
        <button onClick={() => goTo(step - 1)} disabled={step === 0} className="btn btn-ghost glass-strong">
          <ArrowLeft size={18} /> Назад
        </button>
        {step < 2 ? (
          <button onClick={() => goTo(step + 1)} className="btn btn-primary">
            Далее <ArrowRight size={18} />
          </button>
        ) : (
          <button onClick={submit} disabled={saving} className="btn btn-primary px-6">
            {saving && <Loader2 size={18} className="animate-spin" />}
            {editId ? 'Сохранить изменения' : 'Создать АО'}
          </button>
        )}
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Удалить комнату?" size="sm">
        <p className="text-muted">
          Комната «<b className="text-fg">{title}</b>» и все её вопросы будут удалены без возможности восстановления.
        </p>
        <div className="mt-6 flex gap-3">
          <button onClick={() => setDeleteOpen(false)} className="btn btn-ghost flex-1">
            Отмена
          </button>
          <button onClick={deleteRoom} className="btn flex-1 bg-red-500 text-white hover:bg-red-600">
            Удалить
          </button>
        </div>
      </Modal>
    </div>
  )
}
