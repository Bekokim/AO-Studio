import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { tr } from '../lib/i18n'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, motion } from 'framer-motion'
import { GripVertical, ImagePlus, Plus, Trash2, X } from '../lib/icons'
import { useRef } from 'react'
import { uid } from '../lib/utils'

export interface QDraft {
  key: string
  id?: number
  text: string
  answer: string
  /** Ещё принимаемые формулировки: засчитываются наравне с основным ответом */
  altAnswers: string[]
  points: number
  photoFile: File | null
  photoUrl: string | null
  removePhoto: boolean
}

export function newQuestion(points = 1): QDraft {
  return { key: uid(), text: '', answer: '', altAnswers: [], points, photoFile: null, photoUrl: null, removePhoto: false }
}

interface CardProps {
  q: QDraft
  index: number
  showErrors: boolean
  onChange: (q: QDraft) => void
  onDelete: () => void
  canDelete: boolean
  /** Баллы задаются только в стратегическом формате; в классике и рандоме вопрос всегда стоит 1 балл */
  withPoints?: boolean
}

function QuestionCard({ q, index, showErrors, onChange, onDelete, canDelete, withPoints }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.key })
  const fileRef = useRef<HTMLInputElement>(null)

  const pickPhoto = (f: File | undefined) => {
    if (!f || !f.type.startsWith('image/')) return
    if (f.size > 8 * 1024 * 1024) {
      alert(tr('Фото больше 8 МБ'))
      return
    }
    onChange({ ...q, photoFile: f, photoUrl: URL.createObjectURL(f), removePhoto: false })
  }

  const textErr = showErrors && !q.text.trim()
  const ansErr = showErrors && !q.answer.trim()

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-2xl border bg-fg/[0.02] p-4 transition-shadow ${
        isDragging ? 'relative z-20 border-green shadow-[0_12px_40px_rgba(16,185,129,0.25)]' : 'border-line'
      }`}
    >
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none rounded-lg p-1 text-muted hover:bg-fg/5 hover:text-fg active:cursor-grabbing"
            aria-label={tr('Перетащить вопрос')}
          >
            <GripVertical size={18} />
          </button>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green/15 text-xs font-bold text-green">{index + 1}</span>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <textarea
            className={`input min-h-[76px] resize-y ${textErr ? 'invalid' : ''}`}
            placeholder={tr('Текст вопроса')}
            value={q.text}
            onChange={(e) => onChange({ ...q, text: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              className={`input ${ansErr ? 'invalid' : ''}`}
              placeholder={tr('Правильный ответ')}
              value={q.answer}
              maxLength={500}
              onChange={(e) => onChange({ ...q, answer: e.target.value })}
            />
            {withPoints ? (
              <label className="flex items-center gap-2">
                <span className="text-sm text-muted">{tr('Баллы')}</span>
                <select className="input w-20" value={q.points} onChange={(e) => onChange({ ...q, points: Number(e.target.value) })}>
                  {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="flex items-center text-sm text-muted">{tr('1 балл')}</span>
            )}
          </div>

          {/* Другие формулировки того же ответа — чтобы в игре не спорили, засчитывать или нет */}
          <div className="space-y-2">
            {q.altAnswers.map((alt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="input"
                  placeholder={tr('Ещё вариант ответа')}
                  value={alt}
                  maxLength={500}
                  onChange={(e) => {
                    const next = [...q.altAnswers]
                    next[i] = e.target.value
                    onChange({ ...q, altAnswers: next })
                  }}
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...q, altAnswers: q.altAnswers.filter((_, j) => j !== i) })}
                  className="btn btn-ghost shrink-0 px-3"
                  aria-label={tr('Убрать вариант')}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {q.altAnswers.length < 10 && (
              <button
                type="button"
                onClick={() => onChange({ ...q, altAnswers: [...q.altAnswers, ''] })}
                className="text-sm text-green hover:underline"
              >
                {tr('+ Добавить вариант ответа')}
              </button>
            )}
            {q.altAnswers.length === 0 && (
              <p className="text-xs text-muted">
                {tr('Можно добавить другие формулировки — например «Бишкек» и «город Бишкек». Засчитываются все.')}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {q.photoUrl ? (
              <div className="relative">
                <img src={q.photoUrl} alt="" className="h-24 w-auto max-w-[200px] rounded-xl border border-line object-cover" />
                <button
                  type="button"
                  onClick={() => onChange({ ...q, photoFile: null, photoUrl: null, removePhoto: !!q.id })}
                  className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow"
                  aria-label={tr('Удалить фото')}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-ghost px-3 py-2 text-sm">
                <ImagePlus size={16} /> {tr('Добавить фото')}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
            <div className="flex-1" />
            <button
              type="button"
              onClick={onDelete}
              disabled={!canDelete}
              className="rounded-lg p-2 text-muted transition hover:bg-red-400/10 hover:text-red-400 disabled:opacity-30"
              aria-label={tr('Удалить вопрос')}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ListProps {
  questions: QDraft[]
  onChange: (qs: QDraft[]) => void
  showErrors: boolean
  /** Баллы задаются только в стратегическом формате */
  withPoints?: boolean
  /** Можно ли удалить последний вопрос в списке */
  allowEmpty?: boolean
}

/** Сортируемый (drag & drop) список вопросов */
export default function QuestionList({ questions, onChange, showErrors, allowEmpty, withPoints }: ListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = questions.findIndex((q) => q.key === active.id)
    const to = questions.findIndex((q) => q.key === over.id)
    onChange(arrayMove(questions, from, to))
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={questions.map((q) => q.key)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {questions.map((q, i) => (
              <motion.div key={q.key} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                <QuestionCard
                  q={q}
                  index={i}
                  showErrors={showErrors}
                  canDelete={allowEmpty || questions.length > 1}
                  onChange={(nq) => onChange(questions.map((x) => (x.key === q.key ? nq : x)))}
                  withPoints={withPoints}
                  onDelete={() => onChange(questions.filter((x) => x.key !== q.key))}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() => onChange([...questions, newQuestion(withPoints ? Math.min(5, (questions.at(-1)?.points ?? 0) + 1) : 1)])}
        className="btn btn-ghost w-full border-dashed"
      >
        <Plus size={18} /> {tr('Добавить вопрос')}
      </button>
    </div>
  )
}
