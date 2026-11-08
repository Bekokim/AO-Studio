/**
 * Фон экранов, где не живут плавающие эмодзи: игра, лобби, итоги, экраны участника.
 *
 * Два слоя поверх обычного свечения. Первый — кыргызский орнамент «мүйүз», тот же
 * завиток, что в рамке QR-кода и на экране итогов; он не двигается, браузер рисует
 * узор один раз. Второй — два больших размытых пятна, которые медленно плывут: у них
 * меняется только `transform`, поэтому содержимое страницы не перерисовывается.
 *
 * В середине узор сведён на нет маской: там стоят вопрос и карточки, и клетка узора
 * под текстом мешала бы читать. По краям он проступает и держит рамку экрана.
 *
 * Эмодзи сюда не ставим намеренно: игровой экран смотрят с проектора, а в вопрос
 * нужно вчитываться — лишнее движение в кадре там только отвлекает.
 */

// Завиток «мүйүз». Тот же путь, что в components/OrnamentFrame.tsx
const CURL = 'M0 11.6C0 5.1 4.2 1 8.6 1c3 0 4.8 2.1 4.8 4.3 0 2.1-1.5 3.5-3.3 3.5-1.4 0-2.4-1-2.4-2.1'

// Четыре зеркальных завитка по углам плитки и ромб в середине
const TILE = 190
const CORNERS = [
  'translate(14 12) scale(2.1)',
  `translate(${TILE - 14} 12) scale(-2.1 2.1)`,
  `translate(14 ${TILE - 12}) scale(2.1 -2.1)`,
  `translate(${TILE - 14} ${TILE - 12}) scale(-2.1 -2.1)`,
]

export default function PatternBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="bg-aurora" />

      <div className="bg-blob bg-blob-a" />
      <div className="bg-blob bg-blob-b" />

      <svg className="bg-ornament absolute inset-0 h-full w-full">
        <defs>
          {/* id уникален в пределах страницы: компонент на экране всегда один */}
          <pattern id="ao-bg-ornament" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            <g fill="none" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round">
              {CORNERS.map((transform) => (
                <path key={transform} d={CURL} transform={transform} />
              ))}
              <path d={`M${TILE / 2} ${TILE / 2 - 10}L${TILE / 2 + 9} ${TILE / 2}L${TILE / 2} ${TILE / 2 + 10}L${TILE / 2 - 9} ${TILE / 2}Z`} />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ao-bg-ornament)" />
      </svg>
    </div>
  )
}
