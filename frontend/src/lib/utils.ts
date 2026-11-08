import { tr } from './i18n'
import type { ComponentType } from 'react'

import { BookOpen, Dice, LayoutGrid, type IconProps } from './icons'
import type { GameFormat } from './types'

/**
 * Описания форматов. Тексты заданы геттерами: обычное поле посчиталось бы один раз
 * при загрузке модуля и после смены языка осталось бы на прежнем. Геттер читается
 * как обычное поле (`FORMATS[f].label`), но берёт перевод в момент отрисовки.
 */
export const FORMATS: Record<
  GameFormat,
  { label: string; icon: ComponentType<IconProps>; short: string; description: string }
> = {
  classic: {
    get label() {
      return tr('Классический')
    },
    icon: BookOpen,
    get short() {
      return tr('Классич.')
    },
    get description() {
      return tr('Вопросы разложены по категориям, каждый стоит 1 балл. Играют по категориям: открывают вопросы нужной темы.')
    },
  },
  random: {
    get label() {
      return tr('Рандом')
    },
    icon: Dice,
    get short() {
      return tr('Рандом')
    },
    get description() {
      return tr('Без категорий: вопросы идут вперемешку, каждый стоит 1 балл. Карточки открываются вслепую.')
    },
  },
  strategic: {
    get label() {
      return tr('Стратегический')
    },
    icon: LayoutGrid,
    get short() {
      return tr('Стратег.')
    },
    get description() {
      return tr('Категории и цена вопроса от 1 до 5 баллов — как в «Своей игре». Команды по очереди выбирают клетку.')
    },
  },
}

// Палитра цветов команд (яркие, различимые на тёмном фоне)
export const TEAM_COLORS = [
  '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#F97316',
  '#84CC16', '#14B8A6', '#EAB308', '#F43F5E', '#A3E635',
  '#FB7185', '#FBBF24', '#22C55E', '#E879F9', '#FDBA74',
]

export function randomTeamColor(used: string[]): string {
  const free = TEAM_COLORS.filter((c) => !used.includes(c))
  const pool = free.length ? free : TEAM_COLORS
  return pool[Math.floor(Math.random() * pool.length)]
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Следующая команда по очереди (стратегический формат и рандом).
 *
 * Ход идёт строго по нумерации команд: 1 → 2 → … → последняя → снова 1. Порядок команд —
 * тот, в котором они подключились, его видно в лобби и на табло. Дисквалифицированные
 * пропускаются: отвечать и выбирать вопрос им всё равно нельзя.
 */
export function nextTeamIndex(teams: { disqualified?: boolean }[], current: number): number {
  const count = teams.length
  if (count <= 1) return 0
  for (let step = 1; step <= count; step++) {
    const next = (current + step) % count
    if (!teams[next]?.disqualified) return next
  }
  // Все команды вне зачёта — просто передаём ход дальше по кругу
  return (current + 1) % count
}
