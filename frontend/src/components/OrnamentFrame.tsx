import type { ReactNode } from 'react'

/**
 * Кыргызский орнамент «мүйүз» рамкой вокруг содержимого.
 *
 * В знаке сайта такому орнаменту места нет: на 32 px завитки превращаются в шум. Здесь
 * наоборот — поле под него больше тридцати пикселей с каждой стороны, и он раскрывается.
 *
 * Поле задано в пикселях, а не долями: содержимое квадратное, поэтому рамка остаётся
 * квадратной и viewBox масштабируется без искажений. Два значения — чтобы на широком
 * экране, где QR крупнее, полоса под орнамент осталась той же долей от рамки (≈12%),
 * иначе внутренняя линия наехала бы на карточку.
 */

// Завиток: крюк, уходящий в спираль. Из него собраны все четыре угла
const CURL = 'M0 11.6C0 5.1 4.2 1 8.6 1c3 0 4.8 2.1 4.8 4.3 0 2.1-1.5 3.5-3.3 3.5-1.4 0-2.4-1-2.4-2.1'

// Угол — две встречные спирали, зеркальные относительно диагонали
const CORNERS = [
  [0, 0, 0],
  [100, 0, 90],
  [100, 100, 180],
  [0, 100, 270],
] as const

/**
 * Тот же мотив разделителем — для экранов, где рамку не натянешь: они не квадратные.
 *
 * Завитки нарисованы в SVG постоянного размера, а линии по бокам тянутся обычным flex.
 * Так мотив не растягивается вместе с шириной экрана и остаётся самим собой.
 */
export function OrnamentDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex w-full max-w-md items-center gap-4 ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-green/50" />
      {/* Путь задан прямо здесь, а не через <use>: разделитель ставится на экранах без рамки,
          и ссылаться там было бы не на что */}
      <svg width="110" height="28" viewBox="0 0 110 28" fill="none" stroke="var(--green)" strokeLinecap="round">
        <g strokeWidth="2" strokeOpacity="0.9">
          {/* Две встречные спирали, между ними ромб — как в углах рамки */}
          <path d={CURL} transform="translate(2 5) scale(1.45)" />
          <path d={CURL} transform="translate(108 5) scale(-1.45 1.45)" />
        </g>
        <path d="M55 9L60 14L55 19L50 14Z" fill="var(--green)" fillOpacity="0.8" stroke="none" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-green/50" />
    </div>
  )
}

export default function OrnamentFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative inline-block p-[34px] sm:p-[39px] ${className}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <path id="ao-curl" d={CURL} />
        </defs>
        <g fill="none" stroke="var(--green)" strokeLinecap="round">
          <rect x="1" y="1" width="98" height="98" rx="13" strokeWidth="0.8" strokeOpacity="0.4" />
          <rect x="9.5" y="9.5" width="81" height="81" rx="7" strokeWidth="1" strokeOpacity="0.45" />
          <g strokeWidth="1.6" strokeOpacity="0.9">
            {CORNERS.map(([x, y, rot]) => (
              <g key={rot} transform={`translate(${x} ${y}) rotate(${rot})`}>
                <use href="#ao-curl" transform="translate(6.4 1.6) scale(0.84)" />
                <use href="#ao-curl" transform="translate(1.6 6.4) scale(0.84) rotate(90) scale(1 -1)" />
              </g>
            ))}
          </g>
        </g>
      </svg>
      {children}
    </div>
  )
}
