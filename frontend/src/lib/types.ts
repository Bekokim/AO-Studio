export type GameFormat = 'classic' | 'random' | 'strategic'

export interface User {
  id: number
  username: string
  email: string
  avatar: string | null
  created_at: string
  rooms_count: number
  games_played: number
}

export interface PublicUser {
  id: number
  username: string
  avatar: string | null
}

export interface Question {
  id: number
  text: string
  answer: string
  /** Ещё принимаемые формулировки — засчитываются наравне с основным ответом */
  alt_answers: string[]
  points: number
  photo: string | null
  category: number | null
  order: number
}

export interface Category {
  id: number
  name: string
  order: number
  questions: Question[]
}

export interface RoomListItem {
  id: number
  title: string
  format: GameFormat
  timer_duration: number
  is_public: boolean
  description: string
  author: PublicUser
  /** Сколько раз комнату сохранили себе */
  saves_count: number
  created_at: string
  categories: string[]
  questions_count: number
  /** У меня уже есть копия этой комнаты */
  is_saved: boolean
  /** Id моей копии — по нему открывается редактирование */
  my_copy_id: number | null
  /** Заполнено у копии: откуда она сохранена */
  saved_from: { id: number; title: string; author: PublicUser } | null
}

export interface RoomDetail extends Omit<RoomListItem, 'categories'> {
  categories: Category[]
  questions: Question[]
}

/** Участник команды — одно устройство. Отвечающий пишет ответы, остальные ждут с заглушкой */
export interface Participant {
  id: number
  name: string
  is_captain: boolean
  is_answerer: boolean
  /** Капитан наметил его на следующий вопрос, пока идёт текущий */
  is_next_answerer?: boolean
  disqualified?: boolean
  warnings?: number
  dq_reason?: string
}

export interface Team {
  id: number
  name: string
  color: string
  score: number
  /** Античит: команда дисквалифицирована, её баллы заморожены и она вне зачёта */
  disqualified?: boolean
  warnings?: number
  dq_reason?: string
  /** Сколько участников заявил капитан (0 — состав не задан) */
  size?: number
  /** Кто пишет ответы за команду */
  answerer?: number | null
  answerer_id?: number | null
  /** Кого капитан наметил на следующий вопрос */
  next_answerer?: number | null
  next_answerer_id?: number | null
  /** Капитан назначил отвечающего — ведущий может начинать */
  ready?: boolean
  participants?: Participant[]
}

/** Что зафиксировал браузер устройства команды */
export type ViolationKind = 'hidden' | 'blur' | 'fullscreen' | 'left' | 'lost'

export interface Violation {
  id: number
  team_id: number
  team: string
  /** Чьё устройство ушло с экрана. Пусто — игра, начатая до перехода на участников */
  participant_id: number | null
  participant: string
  kind: ViolationKind
  label: string
  /** Нарушение, за которое дисквалифицировали */
  fatal: boolean
  at: string
}

export type AnticheatParticipant = Participant & {
  warnings: number
  disqualified: boolean
  dq_reason: string
  offline: boolean
}

/** Сводка античита для ведущего */
export interface AnticheatStatus {
  anticheat: boolean
  warnings_allowed: number
  /** Сколько участников должно выбыть, чтобы сняли всю команду */
  participants_dq_allowed: number
  // participants перекрывает одноимённое поле Team, поэтому исходное исключаем
  teams: (Omit<Team, 'participants'> & {
    warnings: number
    disqualified: boolean
    dq_reason: string
    offline: boolean
    participants: AnticheatParticipant[]
  })[]
  violations: Violation[]
}

/** solo — «Один»; offline/online — «Команда» на одном экране / со своих устройств */
export type GameMode = 'solo' | 'offline' | 'online'

export interface GameSession {
  id: number
  room: number
  host: number
  status: 'lobby' | 'active' | 'finished'
  mode: GameMode
  code: string | null
  anticheat: boolean
  /** Запуск с умной доски: состав и время заданы заранее */
  board: boolean
  /** Сколько команд ждём (0 — без ограничения) */
  expected_teams: number
  /** Игроков в команде (0 — не задано) */
  team_size: number
  /** Начать игру самим, как только соберутся все команды */
  autostart: boolean
  /** Время на вопрос; null — как в комнате */
  timer_duration: number | null
  created_at: string
  teams: Team[]
}

// ---------- Онлайн-режим: публичное состояние, которое видят команды ----------

export interface LiveCell {
  id: number
  points?: number
  n?: number
  used: boolean
  team?: number | null
  correct?: boolean
}

export interface LiveState {
  view?: 'lobby' | 'waiting' | 'question' | 'review' | 'grid' | 'tiles' | 'results'
  category?: string
  number?: number
  total?: number
  question?: { id: number; text?: string; photo?: string | null; points?: number }
  /** Сколько секунд даётся на вопрос — по этому значению рисуется круг таймера */
  duration?: number
  /** Принимаются ли сейчас ответы */
  accepting?: boolean
  /** Отвечает только эта команда (стратегический/слепой) */
  answer_team?: number | null
  /** Правильный ответ — появляется, когда ведущий его показал */
  reveal?: string | null
  /** Итоги категории (классический) */
  items?: { id: number; text: string; answer: string; points: number; correct: number[] }[]
  columns?: { name: string; cells: LiveCell[] }[]
  tiles?: LiveCell[]
  available?: number[]
  active_team?: number | null
}

export interface LivePayload {
  code: string
  mode: GameMode
  status: 'lobby' | 'active' | 'finished'
  room: { title: string; format: GameFormat }
  state: LiveState
  version: number
  timer: { left: number; running: boolean } | null
  server_time: string
  teams: Team[]
  /** Кто смотрит с этого устройства */
  me: (Participant & { team_id: number }) | null
  /** Команда смотрящего — со всем составом */
  my_team: Team | null
  my_answer: string | null
  /** Античит включён ведущим: устройство участника держит игру на экране */
  anticheat: boolean
  /** Сколько нарушений прощается до дисквалификации участника */
  warnings_allowed: number
  /** Сколько участников должно выбыть, чтобы сняли всю команду */
  participants_dq_allowed: number
  /** Потолок состава команды */
  max_team_size: number
  /** Сколько команд ждёт ведущий (0 — без ограничения) */
  expected_teams: number
  /** Игроков в команде (0 — не задано) */
  team_size: number
}

export interface LiveAnswer {
  question_id: number
  team_id: number
  text: string
  matches: boolean
  submitted_at: string
}

export interface PlatformStats {
  users: number
  rooms: number
  games: number
  rating: number
}
