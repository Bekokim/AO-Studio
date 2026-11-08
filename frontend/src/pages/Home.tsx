import FormatIcon from '../components/FormatIcon'
import { tr } from '../lib/i18n'
import { animate, motion, useInView } from 'framer-motion'
import { ChevronDown, Gamepad2, Heart, Layers, ListChecks, Play, Puzzle, Rocket, Sparkles, Star, Target, Trophy, Users } from '../lib/icons'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import { scrollToAbout } from '../components/Layout'
import { api } from '../lib/api'
import type { GameFormat, PlatformStats } from '../lib/types'
import { FORMATS } from '../lib/utils'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!inView) return
    const c = animate(0, to, { duration: 1.8, ease: 'easeOut', onUpdate: (v) => setVal(Math.round(v)) })
    return () => c.stop()
  }, [inView, to])
  return (
    <span ref={ref}>
      {val.toLocaleString('ru-RU')}
      {suffix}
    </span>
  )
}

const reveal = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6 },
}

// Функции, а не константы: tr() на уровне модуля посчитался бы один раз за загрузку
const formatDetails = (): Record<GameFormat, { icon: typeof Layers; points: string[] }> => ({
  classic: { icon: ListChecks, points: [tr('Вопросы по категориям'), tr('Все команды отвечают одновременно'), tr('Проверка после каждой категории')] },
  strategic: { icon: Target, points: [tr('Сетка «категория × стоимость»'), tr('Команды ходят по очереди'), tr('Автоматический подсчёт баллов')] },
  random: { icon: Sparkles, points: [tr('Пронумерованные скрытые карточки'), tr('Эффектный переворот'), tr('Бонусы: x2, пропуск хода, кража')] },
})

const steps = () => [
  { icon: Users, title: tr('Зарегистрируйтесь'), text: tr('Создайте аккаунт за пару секунд — нужен только логин, email и пароль.') },
  { icon: Layers, title: tr('Создайте АО'), text: tr('Выберите формат, добавьте категории и вопросы с фото и баллами.') },
  { icon: Gamepad2, title: tr('Соберите команды'), text: tr('Выберите комнату, впишите названия команд — цвета назначатся сами.') },
  { icon: Trophy, title: tr('Играйте!'), text: tr('Выводите на проектор, отмечайте ответы — табло и пьедестал посчитаются сами.') },
]

export default function Home() {
  const user = useAuth((s) => s.user)
  const { openAuth, openStart } = useUI()
  const navigate = useNavigate()
  const [stats, setStats] = useState<PlatformStats | null>(null)

  useEffect(() => {
    api.get<PlatformStats>('/stats/').then(({ data }) => setStats(data)).catch(() => {})
  }, [])

  const onCreate = () => (user ? navigate('/create') : openAuth('register', () => navigate('/create')))
  const onStart = () => (user ? openStart() : openAuth('register', () => openStart()))

  return (
    <div>
      {/* HERO */}
      <section className="relative flex min-h-[calc(100vh-56px)] flex-col items-center justify-center overflow-hidden px-4 text-center md:min-h-screen">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 12 }}
          className="mb-8"
        >
          <Logo size={84} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl"
        >
          <span className="text-gradient">Akyl-Ordo</span> Studio
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mt-5 max-w-2xl text-lg text-muted sm:text-xl"
        >
          {tr('Приложение для создания и проведения интеллектуальных командных игр Акыл Ордо')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="glass mt-10 flex w-full max-w-md flex-col gap-3 rounded-3xl p-3 sm:flex-row"
        >
          <button onClick={onCreate} className="btn btn-primary flex-1 py-4 text-base">
            {tr('Создать АО')}
          </button>
          <button onClick={onStart} className="btn btn-outline flex-1 py-4 text-base">
            <Play size={18} fill="currentColor" /> {tr('Начать АО')}
          </button>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          onClick={() => navigate('/join')}
          className="mt-5 text-sm text-muted transition hover:text-green"
        >
          {tr('Есть код от ведущего?')} <span className="font-semibold text-green underline-offset-4 hover:underline">{tr('Войти в игру →')}</span>
        </motion.button>

        <motion.button
          onClick={scrollToAbout}
          className="absolute bottom-8 text-muted hover:text-green"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          aria-label={tr('Подробнее')}
        >
          <ChevronDown size={32} />
        </motion.button>
      </section>

      <div className="mx-auto max-w-6xl space-y-28 px-4 pb-20 sm:px-6">
        {/* ЧТО ТАКОЕ АКЫЛ ОРДО */}
        <motion.section id="about" {...reveal} className="scroll-mt-20 pt-10">
          <div className="glass grid gap-8 rounded-3xl p-8 md:grid-cols-[1fr_1.4fr] md:p-12">
            <div>
              <span className="text-sm font-semibold uppercase tracking-widest text-green">{tr('О игре')}</span>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">{tr('Что такое Акыл Ордо?')}</h2>
            </div>
            <div className="space-y-4 text-muted sm:text-lg">
              <p>
                <b className="text-fg">{tr('«Акыл Ордо»')}</b> {tr('— интеллектуальная командная игра, в которой команды соревнуются в эрудиции, логике и скорости мышления. Её проводят в школах, вузах, на кружках и мероприятиях.')}
              </p>
              <p>
                <b className="text-fg">AO Studio</b> {tr('заменяет Word, PowerPoint и ручной подсчёт баллов единым интерактивным интерфейсом: создавайте вопросы, выводите их на проектор, отмечайте ответы — табло обновится само.')}
              </p>
            </div>
          </div>
        </motion.section>

        {/* ФОРМАТЫ */}
        <section>
          <motion.div {...reveal} className="mb-10 text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-green">{tr('Форматы')}</span>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">{tr('3 формата игры')}</h2>
          </motion.div>
          <div className="grid gap-5 md:grid-cols-3">
            {(Object.keys(FORMATS) as GameFormat[]).map((f, i) => {
              const Icon = formatDetails()[f].icon
              return (
                <motion.div
                  key={f}
                  {...reveal}
                  transition={{ duration: 0.5, delay: i * 0.12 }}
                  whileHover={{ y: -6 }}
                  className="glass group rounded-3xl p-7 transition-colors hover:border-green/50"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <FormatIcon format={f} size={38} className="text-green" />
                    <div className="rounded-2xl bg-green/15 p-3 text-green transition group-hover:bg-green group-hover:text-white">
                      <Icon size={22} />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold">{FORMATS[f].label}</h3>
                  <p className="mt-2 text-sm text-muted">{FORMATS[f].description}</p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {formatDetails()[f].points.map((p) => (
                      <li key={p} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-green" /> {p}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* КАК ИГРАТЬ */}
        <section>
          <motion.div {...reveal} className="mb-10 text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-green">{tr('Инструкция')}</span>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">{tr('Как создать и играть')}</h2>
          </motion.div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps().map((s, i) => (
              <motion.div key={s.title} {...reveal} transition={{ duration: 0.5, delay: i * 0.1 }} className="glass relative rounded-3xl p-6">
                <div className="absolute right-5 top-4 text-5xl font-extrabold text-green/15">{i + 1}</div>
                <div className="mb-4 inline-flex rounded-2xl bg-gradient-to-br from-green to-green-dark p-3 text-white">
                  <s.icon size={22} />
                </div>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </motion.div>
            ))}
          </div>
          <motion.div {...reveal} className="mt-8 flex justify-center">
            <button onClick={onCreate} className="btn btn-primary px-8 py-3.5">
              <Rocket size={18} /> {tr('Создать первую игру')}
            </button>
          </motion.div>
        </section>

        {/* СТАТИСТИКА */}
        <motion.section {...reveal}>
          <div className="glass grid gap-8 rounded-3xl p-8 text-center sm:grid-cols-3 md:p-12">
            {[
              { icon: Users, value: stats?.users ?? 0, label: tr('Пользователей'), suffix: '' },
              { icon: Puzzle, value: stats?.rooms ?? 0, label: tr('AO комнат создано'), suffix: '' },
              { icon: Star, value: stats?.rating ?? 0, label: tr('Рейтинг приложения'), suffix: '%' },
            ].map((s) => (
              <div key={s.label}>
                <s.icon className="mx-auto mb-3 text-green" size={28} />
                <div className="text-gradient text-5xl font-extrabold">
                  {stats ? <CountUp to={s.value} suffix={s.suffix} /> : '—'}
                </div>
                <div className="mt-2 text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </motion.section>
      </div>

      {/* FOOTER — раздел «Инфо» в меню ведёт сюда */}
      <footer id="info" className="scroll-mt-20 border-t border-line px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 md:grid-cols-3">
            {/* О платформе */}
            <div>
              <div className="flex items-center gap-3">
                <Logo size={36} />
                <div className="text-lg font-bold text-fg">AO Studio</div>
              </div>
              <p className="mt-3 text-sm text-muted">
                {tr('Платформа для интеллектуальных игр «Акыл Ордо».')}
              </p>
            </div>

            {/* Автор */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-muted">{tr('Автор')}</div>
              <div className="mt-3 text-sm">
                <div className="font-semibold text-fg">{tr('Эргешов Бекзат')}</div>
                <div className="mt-1 text-muted">{tr('Студент ОшГУ, ПМИ-2-24')}</div>
              </div>
            </div>

            {/* Контакты */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-muted">{tr('Контакты')}</div>
              <ul className="mt-3 space-y-2 text-sm">
                {[
                  { label: 'GitHub', value: 'BekzatErgeshov', href: 'https://github.com/BekzatErgeshov' },
                  { label: 'Instagram', value: 'bekotemirov_1', href: 'https://instagram.com/bekotemirov_1' },
                  { label: 'Telegram', value: 'bekokim', href: 'https://t.me/bekokim' },
                ].map((c) => (
                  <li key={c.label} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-muted">{c.label}</span>
                    <a href={c.href} target="_blank" rel="noreferrer noopener" className="truncate font-medium text-fg hover:text-green">
                      {c.value}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-center gap-1 border-t border-line pt-6 text-sm text-muted">
            © {new Date().getFullYear()} {tr('AO Studio. Сделано с')} <Heart size={14} className="text-green" fill="currentColor" />
          </div>
        </div>
      </footer>
    </div>
  )
}
