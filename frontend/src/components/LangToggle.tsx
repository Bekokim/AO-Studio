import { LANGS, tr } from '../lib/i18n'
import { useUI } from '../store/ui'

/**
 * Переключатель языка — две короткие кнопки, а не выпадающий список: языков всего два,
 * и выбранный виден сразу, без лишнего нажатия.
 *
 * Стоит и в меню сайта, и на экранах участников: туда заходят с чужого телефона по QR,
 * и менять язык там нужно не меньше, чем ведущему.
 */
export default function LangToggle({ compact }: { compact?: boolean }) {
  const lang = useUI((s) => s.lang)
  const setLang = useUI((s) => s.setLang)
  return (
    <div className={`flex items-center gap-1 ${compact ? '' : 'px-1'}`} role="group" aria-label={tr('Язык интерфейса')}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.label}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
            lang === l.code ? 'bg-green/15 text-green' : 'text-muted hover:bg-fg/5 hover:text-fg'
          }`}
        >
          {l.short}
        </button>
      ))}
    </div>
  )
}
