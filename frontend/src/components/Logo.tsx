import { useId } from 'react'

/**
 * Знак AO Studio: монограмма «AO» на плашке со скруглёнными углами.
 *
 * Контуры сняты с авторского эскиза обводкой по пикселям: силуэт сходится с ним на 97%
 * (остальное — сглаживание краёв). Поэтому числа ниже «некруглые»: это замер, а не рисунок
 * от руки. Подгонять их на глаз не стоит — знак разойдётся с эскизом.
 *
 * Порядок слоёв важен: «O» рисуется первой и светлее, «A» ложится поверх. На пересечении
 * видно именно «A», как в эскизе, а мягкая тень под ней даёт глубину.
 *
 * Цвета и плашка берутся из темы: на тёмной «O» сочная мятная, на светлой — выбеленная,
 * как на двух половинах эскиза. Поэтому знак один на обе темы.
 */

// Замеры в поле 48×48: вершина «A», наклон ног, перекладина, кольцо «O»
const APEX_X = 16.03
const APEX_Y = 14.23
const SLOPE = 0.4432
const LEFT_FOOT_Y = 34.16
const RIGHT_FOOT_Y = 32.36
const BAR_Y = 29.47
const LEG_W = 4.58
const BAR_W = 4.53
const O = { cx: 31.21, cy: 26.21, r: 9.31, w: 4.31 }

/** X правой ноги на высоте y; левая зеркальна относительно вершины */
const at = (y: number) => APEX_X + SLOPE * (y - APEX_Y)
const A_PATH = `M${(2 * APEX_X - at(LEFT_FOOT_Y)).toFixed(2)} ${LEFT_FOOT_Y} L${APEX_X} ${APEX_Y} L${at(RIGHT_FOOT_Y).toFixed(2)} ${RIGHT_FOOT_Y}`
const BAR_PATH = `M${(2 * APEX_X - at(BAR_Y)).toFixed(2)} ${BAR_Y} H${at(BAR_Y).toFixed(2)}`

export default function Logo({ size = 36 }: { size?: number }) {
  // Свой id на каждый знак: с общим браузер берёт первый в документе, а он может оказаться
  // в скрытом блоке (мобильная шапка) — тогда градиенты и маска не применятся
  const uid = useId().replace(/:/g, '')
  const tileGrad = `ao-tile-${uid}`
  const aGrad = `ao-a-${uid}`
  const oGrad = `ao-o-${uid}`
  const ringMask = `ao-ring-${uid}`
  const soft = `ao-soft-${uid}`

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
        <linearGradient id={tileGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--logo-tile-top)" />
          <stop offset="1" stopColor="var(--logo-tile-bottom)" />
        </linearGradient>
        <linearGradient id={aGrad} gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="37">
          <stop offset="0" stopColor="var(--logo-a-top)" />
          <stop offset="1" stopColor="var(--logo-a-bottom)" />
        </linearGradient>
        <linearGradient id={oGrad} gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="0" y2="37">
          <stop offset="0" stopColor="var(--logo-o-top)" />
          <stop offset="1" stopColor="var(--logo-o-bottom)" />
        </linearGradient>
        {/* Тень от «A» ложится только на кольцо: по плашке она бы расплылась пятном */}
        <mask id={ringMask}>
          <circle cx={O.cx} cy={O.cy} r={O.r} fill="none" stroke="#fff" strokeWidth={O.w} />
        </mask>
        <filter id={soft} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>

      <rect width="48" height="48" rx="11.5" fill={`url(#${tileGrad})`} />
      <rect
        x="0.65"
        y="0.65"
        width="46.7"
        height="46.7"
        rx="10.9"
        fill="none"
        stroke="var(--logo-edge)"
        strokeWidth="1.3"
      />

      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx={O.cx} cy={O.cy} r={O.r} stroke={`url(#${oGrad})`} strokeWidth={O.w} />

        <g mask={`url(#${ringMask})`} filter={`url(#${soft})`} opacity="0.45">
          <path d={A_PATH} stroke="#013b2b" strokeWidth={LEG_W + 1.4} transform="translate(0.5 0.8)" />
          <path d={BAR_PATH} stroke="#013b2b" strokeWidth={BAR_W + 1.4} transform="translate(0.5 0.8)" />
        </g>

        <path d={A_PATH} stroke={`url(#${aGrad})`} strokeWidth={LEG_W} />
        <path d={BAR_PATH} stroke={`url(#${aGrad})`} strokeWidth={BAR_W} />
      </g>
    </svg>
  )
}
