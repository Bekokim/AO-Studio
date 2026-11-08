import { AnimatePresence, motion } from 'framer-motion'
import { tr } from '../lib/i18n'
import { Eye, EyeOff, Loader2 } from '../lib/icons'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage, fieldErrors } from '../lib/api'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import GoogleButton from './GoogleButton'
import Logo from './Logo'
import Modal from './Modal'

type Errors = Record<string, string>

function Field({
  label, name, type = 'text', value, onChange, error, autoComplete, autoFocus,
}: {
  label: string
  name: string
  type?: string
  value: string
  onChange: (v: string) => void
  error?: string
  autoComplete?: string
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  const isPass = type === 'password'
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      <div className="relative">
        <input
          name={name}
          type={isPass && show ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${error ? 'invalid' : ''} ${isPass ? 'pr-11' : ''}`}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
        />
        {isPass && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
            aria-label={show ? tr('Скрыть пароль') : tr('Показать пароль')}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      <AnimatePresence>
        {error && (
          <motion.span
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 block text-xs text-red-400"
          >
            {error}
          </motion.span>
        )}
      </AnimatePresence>
    </label>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Грубая оценка надёжности пароля: длина плюс разнообразие символов */
function passwordScore(pw: string): number {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-zа-яё]/.test(pw) && /[A-ZА-ЯЁ]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^\w\s]/.test(pw)) score++
  // Один символ, повторённый много раз, надёжным не считается
  if (new Set(pw).size < 4) score = Math.min(score, 1)
  return Math.min(score, 4)
}

// Функция, а не константа: на уровне модуля tr() не переживёт смену языка
const strength = () => [
  { label: tr('Слишком простой'), color: 'bg-red-400', text: 'text-red-400' },
  { label: tr('Слабый'), color: 'bg-orange-400', text: 'text-orange-400' },
  { label: tr('Средний'), color: 'bg-yellow-400', text: 'text-yellow-400' },
  { label: tr('Хороший'), color: 'bg-lime-400', text: 'text-lime-500' },
  { label: tr('Надёжный'), color: 'bg-green', text: 'text-green' },
]

/** Полоска надёжности пароля под полем ввода */
function PasswordStrength({ value }: { value: string }) {
  if (!value) return null
  const score = passwordScore(value)
  const s = strength()[score]
  return (
    <div className="-mt-1">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            initial={false}
            animate={{ opacity: i < Math.max(score, 1) ? 1 : 0.18 }}
            className={`h-1.5 flex-1 rounded-full ${i < Math.max(score, 1) ? s.color : 'bg-fg/20'}`}
          />
        ))}
      </div>
      <div className={`mt-1.5 flex items-center justify-between text-xs ${s.text}`}>
        <span>{s.label}</span>
        {value.length < 8 && <span className="text-muted">{tr('нужно минимум 8 символов')}</span>}
      </div>
    </div>
  )
}

export default function AuthModal() {
  const { authModal, closeAuth, openAuth, afterAuth } = useUI()
  const { login, register, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const mode = authModal ?? 'register'

  const [form, setForm] = useState({ login: '', username: '', email: '', password: '', password_confirm: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [general, setGeneral] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setErrors({})
    setGeneral('')
  }, [authModal])

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  const validate = (): Errors => {
    const e: Errors = {}
    if (mode === 'login') {
      if (!form.login.trim()) e.login = tr('Введите логин или email')
      if (!form.password) e.password = tr('Введите пароль')
      return e
    }
    if (!form.username.trim()) e.username = tr('Введите логин')
    else if (!/^[\w.@+-]{3,150}$/.test(form.username)) e.username = tr('От 3 символов: буквы, цифры и @ . + - _')
    if (!form.email.trim()) e.email = tr('Введите email')
    else if (!EMAIL_RE.test(form.email)) e.email = tr('Некорректный email')
    if (!form.password) e.password = tr('Введите пароль')
    else if (form.password.length < 8) e.password = tr('Минимум 8 символов')
    if (form.password_confirm !== form.password) e.password_confirm = tr('Пароли не совпадают')
    return e
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    setGeneral('')
    if (Object.values(e).some(Boolean)) return
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.login.trim(), form.password)
      } else {
        await register({
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          password_confirm: form.password_confirm,
        })
      }
      const after = afterAuth
      closeAuth()
      setForm({ login: '', username: '', email: '', password: '', password_confirm: '' })
      if (after) after()
      else if (mode === 'register') navigate('/profile')
    } catch (err) {
      const fe = fieldErrors(err)
      if (fe.detail || fe.non_field_errors || !Object.keys(fe).length) setGeneral(errorMessage(err))
      else setErrors(fe)
    } finally {
      setLoading(false)
    }
  }

  const onGoogle = async (credential: string) => {
    setGeneral('')
    setLoading(true)
    try {
      const { created } = await loginWithGoogle(credential)
      const after = afterAuth
      closeAuth()
      if (after) after()
      else if (created) navigate('/profile')
    } catch (err) {
      setGeneral(errorMessage(err, tr('Не удалось войти через Google.')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={!!authModal} onClose={closeAuth} size="sm" hideClose={false}>
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo size={52} />
        <h2 className="mt-4 text-2xl font-extrabold">{mode === 'login' ? tr('С возвращением!') : tr('Создайте аккаунт')}</h2>
        <p className="mt-1 text-sm text-muted">
          {mode === 'login' ? tr('Войдите, чтобы продолжить') : tr('Чтобы создавать и проводить игры Акыл Ордо')}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-xl border border-line p-1">
        {(['register', 'login'] as const).map((m) => (
          <button
            key={m}
            onClick={() => openAuth(m, afterAuth ?? undefined)}
            className={`relative rounded-lg py-2 text-sm font-semibold transition ${mode === m ? 'text-white' : 'text-muted'}`}
          >
            {mode === m && (
              <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-lg bg-gradient-to-br from-green to-green-dark" />
            )}
            <span className="relative">{m === 'register' ? tr('Регистрация') : tr('Вход')}</span>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode === 'login' ? (
          <>
            <Field label={tr('Логин или Email')} name="login" value={form.login} onChange={set('login')} error={errors.login} autoComplete="username" autoFocus />
            <Field label={tr('Пароль')} name="password" type="password" value={form.password} onChange={set('password')} error={errors.password} autoComplete="current-password" />
          </>
        ) : (
          <>
            <Field label={tr('Логин')} name="username" value={form.username} onChange={set('username')} error={errors.username} autoComplete="username" autoFocus />
            <Field label="Email" name="email" type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" />
            <Field label={tr('Пароль')} name="password" type="password" value={form.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
            <PasswordStrength value={form.password} />
            <Field label={tr('Подтверждение пароля')} name="password_confirm" type="password" value={form.password_confirm} onChange={set('password_confirm')} error={errors.password_confirm} autoComplete="new-password" />
          </>
        )}

        {general && <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-400">{general}</div>}

        <button type="submit" disabled={loading} className="btn btn-primary w-full py-3">
          {loading && <Loader2 size={18} className="animate-spin" />}
          {mode === 'login' ? tr('Войти') : tr('Зарегистрироваться')}
        </button>
      </form>

      <GoogleButton mode={mode} onCredential={onGoogle} />
    </Modal>
  )
}
