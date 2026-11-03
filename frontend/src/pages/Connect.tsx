import { ArrowRight, Loader2, QrCode, Users, X } from '../lib/icons'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import QrScanner from '../components/QrScanner'
import { getPlayerToken } from '../hooks/useLive'
import { api } from '../lib/api'
import type { LivePayload } from '../lib/types'
import { plural } from '../lib/utils'

/**
 * Раздел «Присоединиться»: вход в игру, запущенную ведущим в режиме «Доска».
 *
 * Код можно ввести руками или снять камерой с QR-кода на доске. Отсюда уходим на `/join/<код>` —
 * там команда вводит своё название. Если с этого устройства в игру уже входили, идём прямо в игру.
 */
export default function Connect() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [game, setGame] = useState<LivePayload | null>(null)
  const [checking, setChecking] = useState(false)
  // Именно 404, а не любой сбой: при обрыве связи входить всё равно разрешаем
  const [notFound, setNotFound] = useState(false)

  const valid = /^[A-Z0-9]{6}$/.test(code)

  const go = useCallback(
    (c: string) => navigate(getPlayerToken(c) ? `/play/${c}` : `/join/${c}`),
    [navigate],
  )

  // Код с QR вводить уже не нужно — сразу ведём в игру
  const onScanned = useCallback(
    (c: string) => {
      setScanning(false)
      setCode(c)
      go(c)
    },
    [go],
  )

  // Подсказываем, к какой игре ведёт набранный код
  useEffect(() => {
    setGame(null)
    setNotFound(false)
    if (!valid) return
    setChecking(true)
    let cancelled = false
    api
      .get<LivePayload>(`/live/${code}/`)
      .then(({ data }) => !cancelled && setGame(data))
      .catch((err: unknown) => {
        if (cancelled) return
        setNotFound((err as { response?: { status?: number } }).response?.status === 404)
      })
      .finally(() => !cancelled && setChecking(false))
    return () => {
      cancelled = true
    }
  }, [code, valid])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) go(code)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 md:py-10">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-3xl font-extrabold sm:text-4xl">
          <QrCode className="size-8 shrink-0 text-green sm:size-9" aria-hidden />
          Присоединиться
        </h1>
        <p className="mt-1 text-muted">
          Ведущий запустил игру на доске — войдите по QR-коду или шестизначному коду с экрана
        </p>
      </div>

      <div className="glass space-y-5 rounded-2xl p-5 sm:p-6">
        <form onSubmit={submit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Код комнаты</span>
            <input
              className="input text-center font-mono text-3xl font-extrabold uppercase tracking-[0.3em]"
              value={code}
              maxLength={6}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC123"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </label>

          <div className="mt-2.5 min-h-6 text-center text-sm">
            {!valid && code.length > 0 && <span className="text-muted">Код — 6 символов</span>}
            {valid && checking && (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Loader2 size={14} className="animate-spin" /> Ищем игру…
              </span>
            )}
            {valid && !checking && notFound && <span className="text-red-400">Игра с таким кодом не найдена</span>}
            {valid && game && (
              <span className="text-green">
                {game.room.title}
                {game.status === 'finished' && <span className="text-muted"> · игра завершена</span>}
              </span>
            )}
          </div>

          {game && (game.expected_teams > 0 || game.team_size > 0) && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted">
              <Users size={13} />
              {game.expected_teams > 0 && `Команд: ${game.teams.length} из ${game.expected_teams}`}
              {game.expected_teams > 0 && game.team_size > 0 && ' · '}
              {game.team_size > 0 && `по ${game.team_size} ${plural(game.team_size, 'игроку', 'игрока', 'игроков')}`}
            </div>
          )}

          <button type="submit" disabled={!valid || checking || notFound} className="btn btn-primary mt-5 w-full py-3.5 text-base">
            <ArrowRight size={20} /> Войти в игру
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-fg/10" />
          или
          <span className="h-px flex-1 bg-fg/10" />
        </div>

        {scanning ? (
          <div className="space-y-3">
            <div className="mx-auto max-w-xs">
              <QrScanner onCode={onScanned} />
            </div>
            <button onClick={() => setScanning(false)} className="btn btn-ghost w-full">
              <X size={18} /> Закрыть камеру
            </button>
          </div>
        ) : (
          <button onClick={() => setScanning(true)} className="btn btn-outline w-full py-3.5 text-base">
            <QrCode size={20} /> Сканировать QR-код
          </button>
        )}

        <p className="text-center text-xs text-muted">
          Аккаунт не нужен. Одна команда играет с одного устройства — подключается кто-то один за всю команду.
        </p>
      </div>
    </div>
  )
}
