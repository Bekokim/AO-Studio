import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnticheat } from './useAnticheat'

const post = vi.fn()

vi.mock('../lib/api', () => ({
  API_BASE: 'http://localhost/api',
  api: {
    post: (...args: unknown[]) => post(...args),
  },
}))

vi.mock('./useLive', () => ({
  getPlayerToken: () => 'player-token',
}))

/** Ответ сервера на сообщение о нарушении */
function violationReply(warnings: number, disqualified = false, counted = true) {
  return {
    data: {
      counted,
      warnings,
      disqualified,
      dq_reason: disqualified ? 'Ушли с экрана дважды' : '',
      // Двое выбывших снимают команду целиком — хук это только передаёт дальше
      team_disqualified: false,
    },
  }
}

/** Подменяем свойство document, которого jsdom не меняет сам */
function setDoc(prop: string, value: unknown) {
  Object.defineProperty(document, prop, { value, configurable: true, writable: true })
}

/** Прогоняем событие и даём промисам внутри хука досчитаться */
async function fire(target: Document | Window, type: string) {
  await act(async () => {
    target.dispatchEvent(new Event(type))
    await Promise.resolve()
  })
}

type Opts = Parameters<typeof useAnticheat>[0]

const OPTS: Opts = { code: 'ABC123', enabled: true, active: true, server: null }

beforeEach(() => {
  vi.useFakeTimers()
  post.mockReset()
  post.mockResolvedValue(violationReply(1))
  setDoc('visibilityState', 'visible')
  setDoc('hasFocus', () => true)
  setDoc('fullscreenElement', null)
})

afterEach(() => {
  // Иначе слушатели прошлых тестов остаются на document и считают нарушения заново
  cleanup()
  vi.useRealTimers()
  document.documentElement.classList.remove('no-select')
})

describe('полноэкранный режим', () => {
  it('просит включить защиту, пока она не включена', () => {
    const { result } = renderHook(() => useAnticheat(OPTS))
    expect(result.current.needsArm).toBe(true)
    expect(result.current.armed).toBe(false)
  })

  it('arm() снимает заглушку и запрашивает полный экран', () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    document.documentElement.requestFullscreen = requestFullscreen

    const { result } = renderHook(() => useAnticheat(OPTS))
    act(() => result.current.arm())

    expect(result.current.armed).toBe(true)
    expect(result.current.needsArm).toBe(false)
    expect(requestFullscreen).toHaveBeenCalled()
  })

  it('если полный экран отклонён, участник всё равно не застревает на заглушке', () => {
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('отказано'))

    const { result } = renderHook(() => useAnticheat(OPTS))
    act(() => result.current.arm())

    expect(result.current.armed).toBe(true)
  })

  it('выбывшего участника включать защиту не просим', () => {
    const { result } = renderHook(() =>
      useAnticheat({ ...OPTS, server: { warnings: 2, disqualified: true, dq_reason: 'Ушли с экрана' } }),
    )
    expect(result.current.disqualified).toBe(true)
    expect(result.current.needsArm).toBe(false)
  })

  it('выход из полного экрана снова требует включить защиту', async () => {
    const { result } = renderHook(() => useAnticheat(OPTS))
    act(() => result.current.arm())
    expect(result.current.armed).toBe(true)

    await fire(document, 'fullscreenchange')

    expect(result.current.armed).toBe(false)
    expect(result.current.needsArm).toBe(true)
    expect(post).toHaveBeenCalledWith(
      '/live/ABC123/violation/',
      { kind: 'fullscreen' },
      { headers: { 'X-Team-Token': 'player-token' } },
    )
  })
})

describe('уход с экрана', () => {
  it('свёрнутая страница — первое нарушение становится предупреждением', async () => {
    const { result } = renderHook(() => useAnticheat(OPTS))
    setDoc('visibilityState', 'hidden')

    await fire(document, 'visibilitychange')

    expect(post).toHaveBeenCalledWith(
      '/live/ABC123/violation/',
      { kind: 'hidden' },
      { headers: { 'X-Team-Token': 'player-token' } },
    )
    expect(result.current.warnings).toBe(1)
    expect(result.current.disqualified).toBe(false)
    expect(result.current.lastWarning).toBe('Вы свернули игру или переключились на другое приложение')
  })

  it('видимая страница нарушением не считается', async () => {
    renderHook(() => useAnticheat(OPTS))
    await fire(document, 'visibilitychange')
    expect(post).not.toHaveBeenCalled()
  })

  it('второе нарушение выводит из зачёта и убирает баннер предупреждения', async () => {
    post.mockResolvedValue(violationReply(2, true))
    const { result } = renderHook(() => useAnticheat(OPTS))
    setDoc('visibilityState', 'hidden')

    await fire(document, 'visibilitychange')

    expect(result.current.disqualified).toBe(true)
    expect(result.current.dqReason).toBe('Ушли с экрана дважды')
    expect(result.current.lastWarning).toBeNull()
  })

  it('dismiss() убирает баннер, но не предупреждение', async () => {
    const { result } = renderHook(() => useAnticheat(OPTS))
    setDoc('visibilityState', 'hidden')
    await fire(document, 'visibilitychange')

    act(() => result.current.dismiss())

    expect(result.current.lastWarning).toBeNull()
    expect(result.current.warnings).toBe(1)
  })

  it('если сервер нарушение не зачёл, состояние не меняется', async () => {
    post.mockResolvedValue(violationReply(5, true, false))
    const { result } = renderHook(() => useAnticheat(OPTS))
    setDoc('visibilityState', 'hidden')

    await fire(document, 'visibilitychange')

    expect(result.current.warnings).toBe(0)
    expect(result.current.disqualified).toBe(false)
    expect(result.current.lastWarning).toBeNull()
  })

  it('ошибка сети не ломает хук', async () => {
    post.mockRejectedValue(new Error('нет сети'))
    const { result } = renderHook(() => useAnticheat(OPTS))
    setDoc('visibilityState', 'hidden')

    await fire(document, 'visibilitychange')

    expect(result.current.warnings).toBe(0)
    expect(result.current.lastWarning).toBeNull()
  })

  it('повторы в пределах 1,5 с не отправляются', async () => {
    renderHook(() => useAnticheat(OPTS))
    setDoc('visibilityState', 'hidden')

    await fire(document, 'visibilitychange')
    await fire(document, 'visibilitychange')
    expect(post).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    await fire(document, 'visibilitychange')
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('выбывший участник о нарушениях больше не сообщает', async () => {
    post.mockResolvedValue(violationReply(2, true))
    renderHook(() => useAnticheat(OPTS))
    setDoc('visibilityState', 'hidden')

    await fire(document, 'visibilitychange')
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    await fire(document, 'visibilitychange')

    expect(post).toHaveBeenCalledTimes(1)
  })
})

describe('потеря фокуса', () => {
  it('наказывается только если фокус не вернулся', async () => {
    renderHook(() => useAnticheat(OPTS))
    setDoc('hasFocus', () => false)

    await fire(window, 'blur')
    expect(post).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })

    expect(post).toHaveBeenCalledWith(
      '/live/ABC123/violation/',
      { kind: 'blur' },
      { headers: { 'X-Team-Token': 'player-token' } },
    )
  })

  it('вернувшийся фокус отменяет наказание', async () => {
    renderHook(() => useAnticheat(OPTS))
    setDoc('hasFocus', () => false)

    await fire(window, 'blur')
    setDoc('hasFocus', () => true)
    await fire(window, 'focus')

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })

    expect(post).not.toHaveBeenCalled()
  })

  it('свёрнутая страница проходит как hidden, а не как blur', async () => {
    renderHook(() => useAnticheat(OPTS))
    setDoc('hasFocus', () => false)
    setDoc('visibilityState', 'hidden')

    await fire(window, 'blur')
    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })

    expect(post).not.toHaveBeenCalled()
  })
})

describe('закрытие страницы', () => {
  it('сообщается маячком — обычный запрос не успеет уйти', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })

    renderHook(() => useAnticheat(OPTS))
    await fire(window, 'pagehide')

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon.mock.calls[0][0]).toBe('http://localhost/api/live/ABC123/violation/')
    expect(post).not.toHaveBeenCalled()
  })
})

describe('состояние с сервера', () => {
  it('дисквалификация ведущим подхватывается', () => {
    const { result, rerender } = renderHook((props: Opts) => useAnticheat(props), {
      initialProps: OPTS,
    })
    expect(result.current.disqualified).toBe(false)

    rerender({ ...OPTS, server: { warnings: 2, disqualified: true, dq_reason: 'Вне зачёта' } })

    expect(result.current.disqualified).toBe(true)
    expect(result.current.dqReason).toBe('Вне зачёта')
    expect(result.current.warnings).toBe(2)
  })

  it('прощение снимает дисквалификацию, предупреждения и баннер', async () => {
    const { result, rerender } = renderHook((props: Opts) => useAnticheat(props), {
      initialProps: OPTS,
    })
    setDoc('visibilityState', 'hidden')
    await fire(document, 'visibilitychange')
    expect(result.current.lastWarning).not.toBeNull()

    rerender({ ...OPTS, server: { warnings: 0, disqualified: false, dq_reason: '' } })

    expect(result.current.disqualified).toBe(false)
    expect(result.current.warnings).toBe(0)
    expect(result.current.lastWarning).toBeNull()
  })
})

describe('когда защита не нужна', () => {
  it('ведущий её выключил — нарушения не считаются', async () => {
    renderHook(() => useAnticheat({ ...OPTS, enabled: false }))
    setDoc('visibilityState', 'hidden')

    await fire(document, 'visibilitychange')

    expect(post).not.toHaveBeenCalled()
    expect(document.documentElement.classList.contains('no-select')).toBe(false)
  })

  it('игра ещё не идёт — телефон свободен', async () => {
    renderHook(() => useAnticheat({ ...OPTS, active: false }))
    setDoc('visibilityState', 'hidden')

    await fire(document, 'visibilitychange')

    expect(post).not.toHaveBeenCalled()
  })
})

describe('копирование вопроса', () => {
  it('выделение и копирование запрещены, пока защита работает', () => {
    const { unmount } = renderHook(() => useAnticheat(OPTS))

    expect(document.documentElement.classList.contains('no-select')).toBe(true)
    const copy = new Event('copy', { cancelable: true })
    document.dispatchEvent(copy)
    expect(copy.defaultPrevented).toBe(true)

    unmount()
    expect(document.documentElement.classList.contains('no-select')).toBe(false)
  })
})
