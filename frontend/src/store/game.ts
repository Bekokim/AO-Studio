import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { api } from '../lib/api'
import type { GameMode, RoomDetail, Team } from '../lib/types'

interface GameState {
  sessionId: number | null
  room: RoomDetail | null
  teams: Team[]
  finished: boolean
  /** offline — один экран; online — команды играют со своих устройств по коду */
  mode: GameMode
  code: string | null
  /** Античит (онлайн): устройства команд держат игру в полном экране */
  anticheat: boolean
  /** Игра запущена с умной доски — это же устройство и есть экран для всех */
  board: boolean
  start: (
    sessionId: number,
    room: RoomDetail,
    teams: Team[],
    mode?: GameMode,
    code?: string | null,
    anticheat?: boolean,
    board?: boolean,
  ) => void
  setTeams: (teams: Team[]) => void
  /** Обновить флаги античита у команд (опрос ведущего), не затирая баллы */
  setTeamFlags: (flags: { id: number; warnings: number; disqualified: boolean; dq_reason: string }[]) => void
  addScore: (teamId: number, delta: number) => void
  finish: () => Promise<void>
  reset: () => void
}

// Состояние игры хранится в sessionStorage — переживает обновление страницы во время игры
export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      room: null,
      teams: [],
      finished: false,
      mode: 'offline',
      code: null,
      anticheat: false,
      board: false,

      start(sessionId, room, teams, mode = 'offline', code = null, anticheat = false, board = false) {
        set({ sessionId, room, teams, finished: false, mode, code, anticheat, board })
      },

      setTeams(teams) {
        set({ teams })
      },

      setTeamFlags(flags) {
        const byId = new Map(flags.map((f) => [f.id, f]))
        set({
          teams: get().teams.map((t) => {
            const f = byId.get(t.id)
            return f ? { ...t, warnings: f.warnings, disqualified: f.disqualified, dq_reason: f.dq_reason } : t
          }),
        })
      },

      addScore(teamId, delta) {
        if (!delta) return
        // Дисквалифицированная команда вне зачёта — баллы заморожены (сервер тоже это проверяет)
        if (get().teams.find((t) => t.id === teamId)?.disqualified) return
        set({ teams: get().teams.map((t) => (t.id === teamId ? { ...t, score: t.score + delta } : t)) })
        const id = get().sessionId
        if (id) api.patch(`/game/${id}/score/`, { team_id: teamId, delta }).catch(() => {})
      },

      async finish() {
        const id = get().sessionId
        set({ finished: true })
        if (id) await api.patch(`/game/${id}/finish/`).catch(() => {})
      },

      reset() {
        set({
          sessionId: null,
          room: null,
          teams: [],
          finished: false,
          mode: 'offline',
          code: null,
          anticheat: false,
          board: false,
        })
      },
    }),
    { name: 'ao_game', storage: createJSONStorage(() => sessionStorage) },
  ),
)
