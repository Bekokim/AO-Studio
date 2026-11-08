import { tr } from '../../lib/i18n'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Crown, Loader2, Users } from '../../lib/icons'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import LangToggle from '../../components/LangToggle'
import Logo from '../../components/Logo'
import { getPlayerToken, playerTokenKey } from '../../hooks/useLive'
import { api, errorMessage } from '../../lib/api'
import type { LivePayload, Team } from '../../lib/types'
import { plural } from '../../lib/utils'

/**
 * Вход участника в игру с доски. Аккаунт не нужен — только код с экрана ведущего.
 *
 * Первым заходит капитан: он называет команду и говорит, сколько их. Остальные входят следом
 * и выбирают свою команду из списка. Каждый участник — со своего телефона.
 */
export default function Join() {
  const params = useParams()
  const navigate = useNavigate()
  const [code, setCode] = useState((params.code ?? '').toUpperCase())
  const [name, setName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [size, setSize] = useState('')
  // Какую команду выбрал участник; null — он капитан и заводит новую
  const [teamId, setTeamId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [game, setGame] = useState<LivePayload | null>(null)

  const validCode = /^[A-Z0-9]{6}$/.test(code)
  const teams = game?.teams ?? []
  const maxSize = Math.min(game?.team_size || game?.max_team_size || 20, game?.max_team_size || 20)
  // Ведущий задал состав при запуске — капитану его менять не нужно
  const fixedSize = (game?.team_size ?? 0) > 0
  const full = !!game?.expected_teams && teams.length >= game.expected_teams

  // Уже в этой игре с этого устройства — сразу на игровой экран
  useEffect(() => {
    if (validCode && getPlayerToken(code)) navigate(`/play/${code}`, { replace: true })
  }, [code, validCode, navigate])

  // Подсказываем, к какой игре подключаемся, и держим список команд свежим
  useEffect(() => {
    setGame(null)
    if (!validCode) return
    let stop = false
    const load = () =>
      api
        .get<LivePayload>(`/live/${code}/`)
        .then(({ data }) => !stop && setGame(data))
        .catch(() => !stop && setGame(null))
    void load()
    const t = setInterval(load, 2000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [code, validCode])

  // Ведущий задал размер команды — подставляем его капитану
  useEffect(() => {
    if (fixedSize && game) setSize(String(game.team_size))
  }, [fixedSize, game])

  // Команд ещё нет — первому входящему сразу показываем форму капитана
  useEffect(() => {
    if (game && teams.length === 0) setCreating(true)
  }, [game, teams.length])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validCode) return setError(tr('Код — 6 символов, его показывает ведущий'))
    if (name.trim().length < 2) return setError(tr('Введите своё имя'))
    if (creating) {
      if (teamName.trim().length < 2) return setError(tr('Введите название команды'))
      const n = Number(size)
      if (!Number.isInteger(n) || n < 1 || n > maxSize) return setError(tr('Сколько вас в команде? Число от 1 до {max}', { max: maxSize }))
    } else if (!teamId) {
      return setError(tr('Выберите свою команду'))
    }

    setLoading(true)
    setError('')
    try {
      const body = creating
        ? { name: name.trim(), team_name: teamName.trim(), size: Number(size) }
        : { name: name.trim(), team_id: teamId }
      const { data } = await api.post<LivePayload & { token: string }>(`/live/${code}/join/`, body)
      localStorage.setItem(playerTokenKey(code), data.token)
      navigate(`/play/${code}`, { replace: true })
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      setError(status === 404 ? tr('Игра с таким кодом не найдена') : errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const teamFull = (t: Team) => !!t.size && (t.participants?.length ?? 0) >= t.size

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="bg-aurora" />
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass relative z-10 w-full max-w-sm rounded-3xl p-6 sm:p-8"
      >
        {/* Участник заходит по QR с чужого телефона — язык выбирается прямо здесь */}
        <div className="-mt-2 mb-2 flex justify-end">
          <LangToggle compact />
        </div>
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={52} />
          <h1 className="mt-4 text-2xl font-extrabold">{tr('Войти в игру')}</h1>
          <p className="mt-1 text-sm text-muted">{tr('Код показывает ведущий на экране')}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">{tr('Код комнаты')}</span>
          <input
            className="input text-center font-mono text-3xl font-extrabold uppercase tracking-[0.3em]"
            value={code}
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABC123"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            autoFocus={!params.code}
          />
        </label>
        {game && <div className="mt-2 text-center text-sm text-green">{game.room.title}</div>}

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-muted">{tr('Ваше имя')}</span>
          <input
            className="input text-lg"
            value={name}
            maxLength={40}
            placeholder={tr('Например: Азамат')}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!!params.code}
          />
        </label>

        {game && (
          <>
            {/* Выбор команды: к уже заведённой или своя, если ты капитан */}
            {teams.length > 0 && (
              <div className="mt-5">
                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted">
                  <Users size={15} /> {tr('Ваша команда')}
                </span>
                <div className="space-y-1.5">
                  {teams.map((t) => {
                    const here = t.participants?.length ?? 0
                    const isFull = teamFull(t)
                    const picked = !creating && teamId === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={isFull}
                        onClick={() => {
                          setCreating(false)
                          setTeamId(t.id)
                          setError('')
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                          picked
                            ? 'border-green bg-green/10'
                            : isFull
                              ? 'cursor-not-allowed border-line opacity-50'
                              : 'border-line hover:border-green/60'
                        }`}
                      >
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                        <span className="shrink-0 text-xs text-muted tabular-nums">
                          {t.size ? tr('{n} из {total}', { n: here, total: t.size }) : here}
                        </span>
                        {picked && <Check size={16} className="shrink-0 text-green" />}
                      </button>
                    )
                  })}
                </div>
                {!full && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(true)
                      setTeamId(null)
                      setError('')
                    }}
                    className={`mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm transition ${
                      creating ? 'border-green bg-green/10 text-green' : 'border-line text-muted hover:border-green/60'
                    }`}
                  >
                    <Crown size={15} /> {tr('Я капитан — завести новую команду')}
                  </button>
                )}
              </div>
            )}

            {creating && (
              <div className="mt-4 rounded-2xl border border-green/40 bg-green/[0.07] p-4">
                <div className="flex items-center gap-1.5 text-sm font-bold text-green">
                  <Crown size={15} /> {tr('Вы капитан')}
                </div>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-muted">{tr('Название команды')}</span>
                  <input
                    className="input"
                    value={teamName}
                    maxLength={40}
                    placeholder={tr('Например: Ала-Тоо')}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-muted">{tr('Сколько вас в команде')}</span>
                  <input
                    className="input"
                    value={size}
                    disabled={fixedSize}
                    inputMode="numeric"
                    placeholder={tr('от 1 до {max}', { max: maxSize })}
                    onChange={(e) => setSize(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  />
                </label>
                <p className="mt-2 text-xs text-muted">
                  {fixedSize
                    ? tr('Ведущий задал состав: {n} {word}.', { n: game.team_size, word: plural(game.team_size, tr('игрок'), tr('игрока'), tr('игроков')) })
                    : tr('Считая вас. Остальные войдут по тому же коду и выберут вашу команду.')}
                </p>
              </div>
            )}

            {game.expected_teams > 0 && (
              <div className="mt-3 text-center text-xs text-muted">
                {tr('Команд:')} {teams.length} {tr('из')} {game.expected_teams}
              </div>
            )}
          </>
        )}

        <p className="mt-4 text-xs text-muted">
          {tr('Каждый участник входит со своего телефона. Телефон останется у вас, но во время игры будет занят её экраном.')}
        </p>

        {error && <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}

        <button type="submit" disabled={loading} className="btn btn-primary mt-5 w-full py-3.5 text-base">
          {loading ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />} {tr('Присоединиться')}
        </button>
      </motion.form>
    </div>
  )
}
