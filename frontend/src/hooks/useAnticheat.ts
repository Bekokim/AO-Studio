import { tr } from '../lib/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE, api } from '../lib/api'
import type { ViolationKind } from '../lib/types'
import { getPlayerToken } from './useLive'

/**
 * Античит на устройстве участника.
 *
 * Телефоны не отбирают: вместо этого телефон каждого занят экраном игры. Браузер не может
 * запретить свернуть страницу или открыть другую вкладку — такое умеет только нативное
 * приложение. Зато он честно сообщает, что страница ушла с экрана, а это и есть попытка
 * подсмотреть ответ. Поэтому мы держим игру в полноэкранном режиме и сообщаем серверу о каждом
 * уходе: первое нарушение — предупреждение, следующее — участник вне зачёта. Когда вне зачёта
 * оказываются двое, из игры выбывает вся команда.
 *
 * Ловим:
 *  - `visibilitychange` — свернули браузер, переключились на другое приложение или вкладку;
 *  - `blur` — окно потеряло фокус (на компьютере — переход в другое окно поверх игры);
 *  - `fullscreenchange` — вышли из полного экрана;
 *  - `pagehide` — закрыли или перезагрузили страницу (сообщаем через sendBeacon — обычный
 *    запрос на закрытии вкладки не успевает уйти).
 *
 * Пока идёт игра, держим экран включённым через Screen Wake Lock. Без этого телефон гасил бы
 * экран сам через минуту-другую покоя, страница уходила бы в `hidden` — и участник, который
 * просто держит телефон в руках, получал бы нарушение на ровном месте. Там, где Wake Lock
 * не поддерживается, остаётся обычное поведение телефона.
 */

/** Задержка перед наказанием за потерю фокуса: отсекает мгновенные срабатывания самого браузера */
const BLUR_GRACE_MS = 700

export interface Anticheat {
  /** Полноэкранный режим включён — контроль идёт */
  armed: boolean
  /** Нужен экран-заглушка: контроль требуется, но не включён (ещё не вошли или вышли из полного экрана) */
  needsArm: boolean
  warnings: number
  disqualified: boolean
  dqReason: string
  /** Последнее нарушение — для баннера-предупреждения; сбрасывается `dismiss()` */
  lastWarning: string | null
  /** Включить защищённый режим. Только из обработчика нажатия: полный экран требует жеста пользователя */
  arm: () => void
  dismiss: () => void
}

interface Options {
  code: string
  /** Античит включён ведущим для этой игры */
  enabled: boolean
  /** Игра идёт (в лобби и на итогах телефон свободен) */
  active: boolean
  /** Состояние с сервера — чтобы подхватить дисквалификацию или прощение ведущим */
  server?: { warnings: number; disqualified: boolean; dq_reason: string } | null
}

// Функция, а не константа: tr() на уровне модуля замёрз бы на языке загрузки
const labels = (): Record<ViolationKind, string> => ({
  hidden: tr('Вы свернули игру или переключились на другое приложение'),
  blur: tr('Окно игры потеряло фокус'),
  fullscreen: tr('Вы вышли из полноэкранного режима'),
  left: tr('Вы покинули страницу игры'),
  lost: tr('Устройство пропало со связи'),
})

export function useAnticheat({ code, enabled, active, server }: Options): Anticheat {
  const [armed, setArmed] = useState(false)
  const [warnings, setWarnings] = useState(0)
  const [disqualified, setDisqualified] = useState(false)
  const [dqReason, setDqReason] = useState('')
  const [lastWarning, setLastWarning] = useState<string | null>(null)

  // Актуальное значение для слушателей, которые навешиваются один раз
  const on = enabled && active && !disqualified
  const onRef = useRef(on)
  onRef.current = on
  const sentAt = useRef(0)

  // Ведущий простил команду или дисквалификация пришла с сервера
  const srvDq = server?.disqualified
  const srvWarnings = server?.warnings
  const srvReason = server?.dq_reason
  useEffect(() => {
    if (srvDq === undefined || srvWarnings === undefined) return
    setDisqualified(srvDq)
    setDqReason(srvReason ?? '')
    setWarnings(srvWarnings)
    if (srvDq || srvWarnings === 0) setLastWarning(null)
  }, [srvDq, srvWarnings, srvReason])

  const report = useCallback(
    async (kind: ViolationKind) => {
      if (!onRef.current) return
      // Сервер и сам не считает повторы, но и спамить запросами незачем
      const now = Date.now()
      if (now - sentAt.current < 1500) return
      sentAt.current = now
      try {
        const { data } = await api.post<{
          counted: boolean
          warnings: number
          disqualified: boolean
          dq_reason: string
          team_disqualified: boolean
        }>(
          `/live/${code}/violation/`,
          { kind },
          { headers: { 'X-Team-Token': getPlayerToken(code) ?? '' } },
        )
        if (!data.counted) return
        setWarnings(data.warnings)
        setDisqualified(data.disqualified)
        setDqReason(data.dq_reason)
        // При дисквалификации баннер предупреждения не нужен — его заменяет экран «вне зачёта»
        setLastWarning(data.disqualified ? null : labels()[kind])
      } catch {
        /* следующее нарушение сообщим снова */
      }
    },
    [code],
  )

  /** Уход со страницы: обычный запрос не успеет — отправляем маячок */
  const beacon = useCallback(
    (kind: ViolationKind) => {
      if (!onRef.current || !navigator.sendBeacon) return
      const body = JSON.stringify({ kind, token: getPlayerToken(code) ?? '' })
      try {
        navigator.sendBeacon(`${API_BASE}/live/${code}/violation/`, new Blob([body], { type: 'application/json' }))
      } catch {
        /* браузер не дал отправить — ведущий всё равно увидит обрыв связи */
      }
    },
    [code],
  )

  const arm = useCallback(() => {
    // Сначала снимаем заглушку, потом просим полный экран: запрос может быть отклонён
    // (iOS Safari) или вовсе не ответить — команда не должна застрять на пустом экране.
    // Контроль ухода с экрана работает и без полного экрана, по фокусу и видимости.
    setArmed(true)
    try {
      void document.documentElement.requestFullscreen?.()?.catch(() => {})
    } catch {
      /* полный экран недоступен */
    }
  }, [])

  const dismiss = useCallback(() => setLastWarning(null), [])

  // Держим экран включённым, пока идёт игра: автоблокировка телефона выглядела бы как уход с экрана
  useEffect(() => {
    if (!on) return
    type WakeLock = { release: () => Promise<void> }
    const api = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }).wakeLock
    if (!api) return
    let lock: WakeLock | null = null
    let dropped = false

    const acquire = async () => {
      if (dropped || document.visibilityState !== 'visible') return
      try {
        lock = await api.request('screen')
      } catch {
        // Батарея на исходе или браузер отказал — экран погаснет сам, это не нарушение по нашей вине
      }
    }
    // После возврата на экран блокировка снимается браузером — берём её заново
    const onVisible = () => document.visibilityState === 'visible' && void acquire()

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      dropped = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [on])

  // Слушатели уходов с экрана
  useEffect(() => {
    if (!enabled) return
    let blurTimer: number | undefined

    const onHide = () => {
      if (document.visibilityState === 'hidden') void report('hidden')
    }
    const onBlur = () => {
      // Фокус мог уйти на миг (всплывающая панель браузера) — проверяем, вернулся ли он
      window.clearTimeout(blurTimer)
      blurTimer = window.setTimeout(() => {
        if (!document.hasFocus() && document.visibilityState === 'visible') void report('blur')
      }, BLUR_GRACE_MS)
    }
    const onFocus = () => window.clearTimeout(blurTimer)
    const onFs = () => {
      if (!document.fullscreenElement) {
        setArmed(false)
        void report('fullscreen')
      }
    }
    const onLeave = () => beacon('left')

    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('pagehide', onLeave)
    return () => {
      window.clearTimeout(blurTimer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('pagehide', onLeave)
    }
  }, [enabled, report, beacon])

  // Мешаем списывать с самой страницы: меню по долгому нажатию, выделение и копирование вопроса
  useEffect(() => {
    if (!on) return
    const block = (e: Event) => e.preventDefault()
    document.addEventListener('contextmenu', block)
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    document.addEventListener('selectstart', block)
    document.documentElement.classList.add('no-select')
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
      document.removeEventListener('selectstart', block)
      document.documentElement.classList.remove('no-select')
    }
  }, [on])

  // Предупреждение браузера при попытке закрыть или перезагрузить страницу игры
  useEffect(() => {
    if (!on) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [on])

  // Полный экран ещё не включён или из него вышли. Нарушения при этом считаются только
  // в идущей игре, а предложить включить режим нужно и в лобби — до начала игры.
  const needsArm = enabled && !disqualified && !armed

  return { armed, needsArm, warnings, disqualified, dqReason, lastWarning, arm, dismiss }
}
