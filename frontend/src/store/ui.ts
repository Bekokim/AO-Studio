import { create } from 'zustand'
import { getLang, setLang as applyLang, type Lang } from '../lib/i18n'
import type { RoomListItem } from '../lib/types'

type Theme = 'dark' | 'light'

function initialTheme(): Theme {
  try {
    return localStorage.getItem('ao_theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0a0f1e' : '#ffffff')
}

interface UIState {
  theme: Theme
  toggleTheme: () => void

  /** Язык интерфейса. Смену ловит App — он пересобирает дерево страниц */
  lang: Lang
  setLang: (lang: Lang) => void

  authModal: null | 'login' | 'register'
  /** Действие, которое выполнится после успешной авторизации */
  afterAuth: (() => void) | null
  openAuth: (mode?: 'login' | 'register', after?: () => void) => void
  closeAuth: () => void

  startModal: boolean
  startRoom: RoomListItem | null
  openStart: (room?: RoomListItem) => void
  closeStart: () => void

  /** Запуск с умной доски: своя модалка с составом и временем */
  boardModal: boolean
  boardRoom: RoomListItem | null
  openBoard: (room?: RoomListItem) => void
  closeBoard: () => void
}

const theme = initialTheme()
applyTheme(theme)

export const useUI = create<UIState>((set, get) => ({
  theme,
  toggleTheme() {
    const t: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(t)
    try {
      localStorage.setItem('ao_theme', t)
    } catch {
      /* ignore */
    }
    set({ theme: t })
  },

  lang: getLang(),
  setLang(lang) {
    applyLang(lang)
    set({ lang })
  },

  authModal: null,
  afterAuth: null,
  openAuth(mode = 'register', after) {
    set({ authModal: mode, afterAuth: after ?? null })
  },
  closeAuth() {
    set({ authModal: null, afterAuth: null })
  },

  startModal: false,
  startRoom: null,
  openStart(room) {
    set({ startModal: true, startRoom: room ?? null })
  },
  closeStart() {
    set({ startModal: false, startRoom: null })
  },

  boardModal: false,
  boardRoom: null,
  openBoard(room) {
    set({ boardModal: true, boardRoom: room ?? null })
  },
  closeBoard() {
    set({ boardModal: false, boardRoom: null })
  },
}))
