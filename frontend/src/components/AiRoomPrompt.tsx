import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Sparkles } from '../lib/icons'
import { useState } from 'react'
import { api, errorMessage } from '../lib/api'
import type { AiRoomDraft } from '../lib/types'

const EXAMPLES = [
  'Комната «Бокс» на 6 вопросов, формат рандом',
  'Своя игра про космос: три категории по пять вопросов, цены от 1 до 5',
  '1. Кто такой Майк Тайсон? Ответ: чемпион. Сделай комнату в формате классик и добавь туда этот вопрос',
]

/**
 * Сборка комнаты по описанию.
 *
 * Готовая заготовка не сохраняется, а попадает в редактор: ведущий видит каждый вопрос,
 * правит что нужно и сохраняет сам. Так ошибка модели не превращается в испорченную игру.
 */
export default function AiRoomPrompt({ maxQuestions, onDraft }: { maxQuestions: number; onDraft: (d: AiRoomDraft) => void }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    if (prompt.trim().length < 5) return setError('Опишите, какая нужна игра: тема, сколько вопросов, формат')
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post<AiRoomDraft>('/rooms/generate/', { prompt: prompt.trim() })
      onDraft(data)
    } catch (err) {
      setError(errorMessage(err, 'Не удалось собрать игру. Попробуйте ещё раз.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass rounded-2xl border-green/40 bg-green/[0.06] p-5">
      <div className="flex items-center gap-2 font-bold text-green">
        <Sparkles size={18} /> Собрать игру по описанию
      </div>
      <p className="mt-1.5 text-sm text-muted">
        Напишите, что нужно, — ИИ соберёт заготовку, а вы её проверите и поправите перед сохранением. Свои вопросы
        можно вписать прямо в описание, их перенесут дословно. За раз не больше {maxQuestions} вопросов.
      </p>

      <textarea
        className="input mt-4 min-h-[96px] resize-y"
        placeholder="Например: комната «Бокс» на 6 вопросов, формат рандом"
        value={prompt}
        maxLength={2000}
        disabled={loading}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            disabled={loading}
            onClick={() => {
              setPrompt(e)
              setError('')
            }}
            className="rounded-full border border-line px-2.5 py-1 text-left text-xs text-muted transition hover:border-green/60 hover:text-fg"
          >
            {e.length > 54 ? `${e.slice(0, 54)}…` : e}
          </button>
        ))}
      </div>

      {error && <div className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}

      <button onClick={generate} disabled={loading} className="btn btn-primary mt-4 w-full py-3">
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
        {loading ? 'Собираю игру…' : 'Собрать'}
      </button>

      <AnimatePresence>
        {loading && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-center text-xs text-muted"
          >
            Это занимает до минуты — ИИ придумывает вопросы и проверяет ответы.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
