import { useId } from 'react'

/**
 * Знак AO Studio: монограмма «AO» на плашке со скруглёнными углами.
 *
 * Буквы сцеплены: перекладина «A» уходит под кольцо «O», и знак читается одним росчерком.
 * «A» темнее, «O» светлее — так понятно, какая буква поверх какой, даже когда знак
 * ужат до строки меню.
 *
 * Плашка берёт цвет из темы (`--logo-tile`): на тёмной она почти чёрная, на светлой белая.
 * Поэтому знак один на обе темы, отдельной версии под каждую не нужно.
 *
 * Геометрия задана числами, а не шрифтом: прежний знак набирался Roboto Slab, и в фавиконке
 * без веб-шрифта буквы разъезжались. Нарисованные контуры везде одинаковы.
 */

// Буквы в поле 48×48. Значения выверены по эскизу: «A» и «O» сцепляются перекладиной
const A_OUTLINE = 'M7.8 34.8 L15.2 13.2 L22.6 34.8'
const A_BAR = 'M10.2 26.8 H21'
const O = { cx: 30.8, cy: 25.0, r: 8.1 }

export default function Logo({ size = 36 }: { size?: number }) {
  // Свой id на каждый знак: с общим браузер берёт первый в документе, а он может оказаться
  // в скрытом блоке (мобильная шапка) — тогда градиент не применится
  const uid = useId().replace(/:/g, '')
  const aGrad = `ao-a-${uid}`
  const oGrad = `ao-o-${uid}`
  const aClip = `ao-clip-${uid}`
  const blur = `ao-blur-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="ao-logo shrink-0"
      role="img"
      aria-label="AO Studio"
    >
      <defs>
        <linearGradient id={aGrad} x1="0.25" y1="0" x2="0.1" y2="1">
          <stop offset="0" stopColor="var(--green)" />
          <stop offset="1" stopColor="var(--green-dark)" />
        </linearGradient>
        <linearGradient id={oGrad} x1="1" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#6ee7b7" />
          <stop offset="1" stopColor="var(--green-light)" />
        </linearGradient>
        {/* Тень от «O» ложится только на «A»: по плашке она бы размазалась грязным пятном */}
        <clipPath id={aClip}>
          <path d={A_OUTLINE} fill="none" stroke="#000" strokeWidth="5.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d={A_BAR} fill="none" stroke="#000" strokeWidth="5" strokeLinecap="round" />
        </clipPath>
        <filter id={blur} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>

      <rect width="48" height="48" rx="12" fill="var(--logo-tile)" />
      {/* Кромка: на тёмной плашке она светлая, на белой — чуть темнее фона, иначе знак
          на светлой теме сливается со страницей */}
      <rect
        x="0.7"
        y="0.7"
        width="46.6"
        height="46.6"
        rx="11.4"
        fill="none"
        stroke="var(--logo-tile-edge)"
        strokeWidth="1.4"
      />

      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={A_OUTLINE} stroke={`url(#${aGrad})`} strokeWidth="5.6" />
        <path d={A_BAR} stroke={`url(#${aGrad})`} strokeWidth="5" />

        <g clipPath={`url(#${aClip})`}>
          <circle
            cx={O.cx}
            cy={O.cy}
            r={O.r}
            stroke="#04372a"
            strokeOpacity="0.45"
            strokeWidth="7"
            filter={`url(#${blur})`}
          />
        </g>

        <circle cx={O.cx} cy={O.cy} r={O.r} stroke={`url(#${oGrad})`} strokeWidth="6.4" />
      </g>
    </svg>
  )
}
