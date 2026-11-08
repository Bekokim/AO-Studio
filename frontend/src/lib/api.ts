import { tr } from './i18n'
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

/** Админка Django: в dev — через прокси Vite, в продакшене — на домене бэкенда */
export const ADMIN_URL = `${API_URL}/admin/`

export const ACCESS_KEY = 'ao_access'
export const REFRESH_KEY = 'ao_refresh'

/** Адрес API — нужен там, где запрос идёт не через axios (например navigator.sendBeacon) */
export const API_BASE = `${API_URL}/api`

export const api = axios.create({ baseURL: API_BASE })

// Автоматически прикрепляем JWT к каждому запросу
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise: Promise<string> | null = null
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

async function refreshAccess(): Promise<string> {
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh) throw new Error('no refresh token')
  const { data } = await axios.post(`${API_URL}/api/auth/token/refresh/`, { refresh })
  localStorage.setItem(ACCESS_KEY, data.access)
  if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh)
  return data.access
}

// На 401 — пробуем обновить токен один раз, иначе разлогиниваем и ведём на /login
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const isAuthCall = original?.url?.startsWith('/auth/login') || original?.url?.startsWith('/auth/register')
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true
      try {
        refreshPromise ??= refreshAccess().finally(() => {
          refreshPromise = null
        })
        const token = await refreshPromise
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      } catch {
        localStorage.removeItem(ACCESS_KEY)
        localStorage.removeItem(REFRESH_KEY)
        onUnauthorized?.()
      }
    }
    return Promise.reject(error)
  },
)

/** Достаёт человекочитаемое сообщение из ошибки DRF */
export function errorMessage(err: unknown, fallback = tr('Что-то пошло не так. Попробуйте ещё раз.')): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as unknown
    if (!err.response) return tr('Сервер недоступен. Проверьте подключение.')
    if (typeof data === 'string') return fallback
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      if (typeof d.detail === 'string') return d.detail
      const first = Object.values(d)[0]
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0]
      if (typeof first === 'string') return first
    }
  }
  return fallback
}

/** Ошибки полей DRF → { поле: 'сообщение' } */
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (axios.isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    for (const [k, v] of Object.entries(err.response.data as Record<string, unknown>)) {
      if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0]
      else if (typeof v === 'string') out[k] = v
    }
  }
  return out
}
