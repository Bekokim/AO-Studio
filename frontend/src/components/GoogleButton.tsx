import { tr } from '../lib/i18n'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

// Минимальные типы Google Identity Services
interface GoogleId {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
let scriptPromise: Promise<void> | null = null
let clientIdPromise: Promise<string | null> | null = null

function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptPromise = null
      reject(new Error(tr('Не удалось загрузить Google')))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

/** Client ID берётся с бэкенда (GOOGLE_CLIENT_ID в backend/.env) */
export function getGoogleClientId(): Promise<string | null> {
  clientIdPromise ??= api
    .get<{ google_client_id: string | null }>('/auth/config/')
    .then(({ data }) => data.google_client_id)
    .catch(() => {
      clientIdPromise = null
      return null
    })
  return clientIdPromise
}

interface Props {
  mode: 'login' | 'register'
  onCredential: (credential: string) => void
}

/** Логотип Google — обязателен на кнопке входа по правилам Google */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.600v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" />
      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.7C7.9 41 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.6 28.1c-.5-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.8l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.3 30 2 24 2 15.4 2 7.9 7 4.3 14.2l7.3 5.7c1.8-5.2 6.6-9.1 12.4-9.1z" />
    </svg>
  )
}

/**
 * Вход через Google.
 *
 * Google рисует кнопку в своём оформлении внутри iframe, и перекрасить её нельзя —
 * на тёмной модалке она выглядит чужеродно. Поэтому показываем свою кнопку в стиле
 * сайта, а настоящую кладём поверх прозрачной: клики достаются ей.
 * Ничего не рисуем, если Google не настроен.
 */
export default function GoogleButton({ mode, onCredential }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // Google рисует кнопку фиксированной шириной в пикселях: на первом кадре контейнер ещё
  // нулевой, поэтому ширину замеряем и перерисовываем кнопку, когда она меняется
  const [width, setWidth] = useState(0)
  const cb = useRef(onCredential)
  cb.current = onCredential

  useEffect(() => {
    void getGoogleClientId().then(setClientId)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [clientId])

  useEffect(() => {
    if (!clientId || !ref.current || !width) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => cb.current(r.credential),
        })
        ref.current.innerHTML = ''
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          size: 'large',
          // Прямоугольная кнопка со скруглением как у остальных кнопок сайта
          shape: 'rectangular',
          text: mode === 'register' ? 'signup_with' : 'signin_with',
          logo_alignment: 'center',
          locale: 'ru',
          // Google принимает ширину до 400 px
          width: Math.min(width, 400),
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [clientId, mode, width])

  if (!clientId) return null

  return (
    <div>
      <div className="my-4 flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-line" /> {tr('или')} <div className="h-px flex-1 bg-line" />
      </div>
      {failed ? (
        <p className="text-center text-xs text-muted">{tr('Не удалось загрузить вход через Google. Проверьте интернет.')}</p>
      ) : (
        <div className="relative h-11 w-full">
          {/* Видимая кнопка в оформлении сайта */}
          <div
            aria-hidden
            className="btn btn-ghost pointer-events-none absolute inset-0 w-full justify-center gap-2.5 py-0 text-sm font-semibold"
          >
            <GoogleG /> {mode === 'register' ? tr('Зарегистрироваться через Google') : tr('Войти через Google')}
          </div>
          {/* Настоящая кнопка Google — прозрачная, ровно поверх нашей */}
          <div
            ref={ref}
            className="absolute inset-0 overflow-hidden opacity-0 [&>div]:!h-full [&>div]:!w-full [&_iframe]:!h-full [&_iframe]:!w-full"
          />
        </div>
      )}
    </div>
  )
}
