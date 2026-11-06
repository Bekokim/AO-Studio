import { useId } from 'react'

/**
 * Знак AO Studio: буквы AO прорезаны насквозь в зелёной плашке со скруглёнными углами.
 *
 * Буквы не залиты краской, а вырезаны маской — сквозь них виден фон страницы. Поэтому знак
 * сам подстраивается под тему: на тёмной буквы тёмные, на светлой светлые, и отдельная
 * версия под каждую тему не нужна.
 *
 * Шрифт тот же, что на сайте, — Roboto Slab. Кегль и положение выверены замером метрик:
 * при кегле 26 в поле 48×48 чернила «AO» встают ровно по центру.
 */
export default function Logo({ size = 36 }: { size?: number }) {
  // Свой id на каждый знак: с общим браузер берёт первый в документе, а он может оказаться
  // в скрытом блоке (мобильная шапка) — тогда заливка и маска не применяются
  const uid = useId().replace(/:/g, '')
  const gradId = `ao-grad-${uid}`
  const maskId = `ao-mask-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="shrink-0 drop-shadow-[0_4px_20px_rgba(16,185,129,0.4)]"
      role="img"
      aria-label="AO Studio"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--green-light)" />
          <stop offset="1" stopColor="var(--green-dark)" />
        </linearGradient>
        <mask id={maskId}>
          {/* Белое остаётся, чёрное вырезается */}
          <rect width="48" height="48" rx="13" fill="#fff" />
          <text
            x="24.013"
            y="33.344"
            textAnchor="middle"
            fontFamily="'Roboto Slab', Georgia, serif"
            fontWeight="800"
            fontSize="26"
            fill="#000"
          >
            AO
          </text>
        </mask>
      </defs>

      <rect width="48" height="48" rx="13" fill={`url(#${gradId})`} mask={`url(#${maskId})`} />
      {/* Кромка — намёк на оправу. Непрерывная линия вдоль силуэта переживает уменьшение:
          деталь внутри плашки на 32 px превращается в шум, а она читается даже там */}
      <rect
        x="2.6"
        y="2.6"
        width="42.8"
        height="42.8"
        rx="11"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.38"
        strokeWidth="1.6"
      />
    </svg>
  )
}
