import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { LiveAnswer, LivePayload, LiveState } from '../lib/types'
import { useGame } from '../store/game'

const POLL_MS = 1500

// ---------------- Ведущий ----------------

/**
 * Публикует состояние игры для команд (только в онлайн-режиме).
 * Отправляет при изменении состояния, паузе/старте таймера и его сбросе — не каждую секунду.
 */
export function usePublishState(state: LiveState | null, timer: { left: number; running: boolean } | null) {
  const { sessionId, mode } = useGame()
  const leftRef = useRef(timer?.left ?? 0)
  const prevLeft = useRef(timer?.left ?? 0)
  const [resets, setResets] = useState(0)

  // Сброс таймера (оставшееся время выросло) — тоже повод опубликовать
  useEffect(() => {
    const left = timer?.left ?? 0
    if (left > prevLeft.current + 1) setResets((n) => n + 1)
    prevLeft.current = left
    leftRef.current = left
  }, [timer?.left])

  const key = `${JSON.stringify(state)}|${timer ? (timer.running ? 'run' : 'pause') : 'none'}|${resets}`

  useEffect(() => {
    if (mode !== 'online' || !sessionId || !state) return
    const t = setTimeout(() => {
      api
        .patch(`/game/${sessionId}/state/`, {
          state,
          timer: timer ? { left: leftRef.current, running: timer.running } : null,
        })
        .catch(() => {})
    }, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode, sessionId])
}

export type AnswersMap = Record<number, Record<number, { text: string; matches: boolean }>>

export interface TeamPick {
  team_id: number
  question_id: number
  at: string
}

/** Опрос ответов команд на заданные вопросы и выбора клетки командой (онлайн-режим) */
export function useLiveAnswers(questionIds: number[], enabled = true) {
  const { sessionId, mode } = useGame()
  const [answers, setAnswers] = useState<AnswersMap>({})
  const [pick, setPick] = useState<TeamPick | null>(null)
  const ids = questionIds.join(',')

  useEffect(() => {
    if (mode !== 'online' || !sessionId || !enabled) return
    let stop = false
    const load = async () => {
      try {
        const { data } = await api.get<{ answers: LiveAnswer[]; pick: TeamPick | null }>(
          `/game/${sessionId}/answers/`,
          { params: { questions: ids } },
        )
        if (stop) return
        const map: AnswersMap = {}
        for (const a of data.answers) (map[a.question_id] ??= {})[a.team_id] = { text: a.text, matches: a.matches }
        setAnswers(map)
        setPick(data.pick)
      } catch {
        /* следующий опрос повторит */
      }
    }
    void load()
    const t = setInterval(load, POLL_MS)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [mode, sessionId, ids, enabled])

  return { answers, pick, online: mode === 'online' }
}

// ---------------- Участник (его телефон) ----------------

/**
 * Секрет устройства участника. Ключ именно `player`, а не прежний `team`: в играх,
 * начатых до перехода на участников, по этому адресу лежал токен команды, и подсунуть
 * его новому API нельзя — старый токен просто не найдётся, и человек войдёт заново.
 */
export const playerTokenKey = (code: string) => `ao_player_${code.toUpperCase()}`

export function getPlayerToken(code: string): string | null {
  try {
    return localStorage.getItem(playerTokenKey(code))
  } catch {
    return null
  }
}

/** Заголовок, которым устройство участника подписывает свои запросы */
export function playerAuth(code: string) {
  return { 'X-Team-Token': getPlayerToken(code) ?? '' }
}

/** Устройство участника: опрашивает состояние игры по коду */
export function useLiveState(code: string) {
  const [data, setData] = useState<LivePayload | null>(null)
  const [error, setError] = useState<'not_found' | 'network' | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)

  const load = useCallback(async () => {
    const token = getPlayerToken(code)
    try {
      const { data } = await api.get<LivePayload>(`/live/${code}/`, {
        headers: token ? { 'X-Team-Token': token } : {},
      })
      setData(data)
      setFetchedAt(Date.now())
      setError(null)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } }).response?.status
      setError(status === 404 ? 'not_found' : 'network')
    }
  }, [code])

  useEffect(() => {
    void load()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  return { data, error, fetchedAt, refresh: load }
}

/**
 * Локальный обратный отсчёт по данным сервера (между опросами тикает сам).
 *
 * Возвращает и целые секунды для подписи, и точный остаток для круга таймера —
 * иначе круг дёргается: опрос приходит раз в 1,5 с, а секунды идут не в такт с ним.
 */
export function useServerTimer(timer: LivePayload['timer'] | undefined, fetchedAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer?.running) return
    // Десять раз в секунду: круг идёт плавно, а телефон команды не нагружается
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [timer?.running])

  if (!timer) return null
  const exact = timer.running ? Math.max(0, timer.left - (now - fetchedAt) / 1000) : timer.left
  return { left: Math.ceil(exact), exact }
}
