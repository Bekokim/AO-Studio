import ky from './locales/ky'

/**
 * Два языка интерфейса: русский и кыргызский.
 *
 * Ключ словаря — сам русский текст. Так в разметке остаётся живая фраза, а не код
 * вроде `profile.rooms.empty`: экран читается как есть, и ни один перевод не может
 * «потеряться» — без записи в словаре выводится русский исходник.
 *
 * Содержимое, которое пишут сами пользователи (названия комнат, вопросы, ответы),
 * не переводится: это их текст, и подменять его нельзя.
 */

export type Lang = 'ru' | 'ky'

export const LANGS: { code: Lang; short: string; label: string }[] = [
  { code: 'ru', short: 'РУС', label: 'Русский' },
  { code: 'ky', short: 'КЫР', label: 'Кыргызча' },
]

const STORAGE_KEY = 'ao_lang'
const DICTS: Record<Lang, Record<string, string>> = { ru: {}, ky }

function initial(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ky' ? 'ky' : 'ru'
  } catch {
    return 'ru'
  }
}

let current: Lang = initial()
apply(current)

function apply(lang: Lang) {
  try {
    document.documentElement.lang = lang
  } catch {
    /* окружение без DOM */
  }
}

export function getLang(): Lang {
  return current
}

/**
 * Переключает язык. Перерисовку делает App: он держит ключ на дереве страниц,
 * поэтому после смены языка экран пересобирается целиком — иначе пришлось бы
 * подписывать на язык каждый компонент.
 */
export function setLang(lang: Lang) {
  current = lang
  apply(lang)
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* приватный режим — язык не запомнится, и ладно */
  }
}

/** Перевод строки. `vars` подставляется в места вида `{name}`. */
export function tr(ru: string, vars?: Record<string, string | number>): string {
  const out = DICTS[current][ru] ?? ru
  return vars ? out.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m)) : out
}
