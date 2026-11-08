import type { Activity } from '../lib/types'
import { tr } from '../lib/i18n'
import { plural } from '../lib/utils'

/**
 * Календарь активности за год — клетка на день, столбец на неделю.
 *
 * Неделя начинается с понедельника: календарь читают русскоязычные, и воскресная
 * сетка GitHub здесь сбивала бы с толку. Подписи месяцев ставим над той неделей,
 * в которую месяц начался, иначе они разъезжаются с клетками.
 *
 * На узком экране год в строку не помещается, поэтому полоса прокручивается, и
 * открывается она сразу у правого края — на сегодняшнем дне.
 */

// Функции, а не константы: tr() на уровне модуля посчитался бы один раз,
// и при смене языка подписи остались бы на прежнем
const weekdays = () => [tr('Пн'), tr('Вт'), tr('Ср'), tr('Чт'), tr('Пт'), tr('Сб'), tr('Вс')]
const months = () => [tr('янв'), tr('фев'), tr('мар'), tr('апр'), tr('май'), tr('июн'), tr('июл'), tr('авг'), tr('сен'), tr('окт'), tr('ноя'), tr('дек')]

/** Насыщенность клетки: шаги подобраны так, чтобы один день работы уже был виден */
const LEVELS = ['bg-fg/[0.07]', 'bg-green/25', 'bg-green/45', 'bg-green/70', 'bg-green']

function level(n: number) {
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n <= 3) return 2
  if (n <= 6) return 3
  return 4
}

/** Локальная дата в YYYY-MM-DD: toISOString() увёл бы день к UTC */
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayTitle(date: Date, day?: { rooms: number; games: number }) {
  const when = `${date.getDate()} ${months()[date.getMonth()]} ${date.getFullYear()}`
  const parts: string[] = []
  if (day?.rooms) parts.push(`${day.rooms} ${plural(day.rooms, tr('комната'), tr('комнаты'), tr('комнат'))}`)
  if (day?.games) parts.push(`${day.games} ${plural(day.games, tr('игра'), tr('игры'), tr('игр'))}`)
  return parts.length ? `${when}: ${parts.join(', ')}` : `${when}: ${tr('пусто')}`
}

export default function ActivityCalendar({ data }: { data: Activity }) {
  const to = new Date(`${data.to}T00:00:00`)
  const from = new Date(`${data.from}T00:00:00`)
  // Сетка всегда начинается с понедельника, иначе первый столбец оказался бы рваным
  const start = new Date(from)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))

  const weeks: Date[][] = []
  for (const cur = new Date(start); cur <= to; cur.setDate(cur.getDate() + 1)) {
    if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) weeks.push([])
    weeks[weeks.length - 1].push(new Date(cur))
  }

  // Подпись месяца — над первой неделей, которая в нём началась. Судим по понедельнику
  // недели, а не по «любому дню до седьмого числа»: иначе месяц, начавшийся в воскресенье,
  // подписывался бы дважды подряд и надписи налезали друг на друга
  const labels = weeks.map((week, i) => {
    if (i === 0) return ''
    const prev = weeks[i - 1][0]
    return prev.getMonth() === week[0].getMonth() ? '' : months()[week[0].getMonth()]
  })

  return (
    <div>
      <div className="flex gap-2">
        {/* Дни недели стоят вне прокручиваемой полосы — иначе уезжали бы вместе с ней */}
        <div className="mt-[15px] flex shrink-0 flex-col gap-[3px] text-[10px] leading-[11px] text-muted">
          {weekdays().map((d, i) => (
            <span key={d} className="h-[11px]">
              {i % 2 === 0 ? d : ''}
            </span>
          ))}
        </div>

        {/* dir=rtl открывает полосу сразу у сегодняшнего дня; содержимое возвращаем в ltr */}
        <div className="scrollbar-thin min-w-0 overflow-x-auto pb-1" dir="rtl">
          <div dir="ltr" className="w-fit">
            <div className="mb-1 flex gap-[3px] text-[10px] leading-none text-muted">
              {labels.map((m, i) => (
                <span key={i} className="w-[11px] shrink-0 whitespace-nowrap">
                  {m}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((d) => {
                    const key = iso(d)
                    const day = data.days[key]
                    const n = (day?.rooms ?? 0) + (day?.games ?? 0)
                    const future = d > to
                    return (
                      <span
                        key={key}
                        title={future ? '' : dayTitle(d, day)}
                        className={`h-[11px] w-[11px] rounded-[3px] ${future ? 'opacity-0' : LEVELS[level(n)]}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
        <span className="mr-auto">
          {data.total} {plural(data.total, tr('событие'), tr('события'), tr('событий'))} {tr('за год')}
        </span>
        {tr('Меньше')}
        {LEVELS.map((c, i) => (
          <span key={i} className={`h-[10px] w-[10px] rounded-[3px] ${c}`} />
        ))}
        {tr('Больше')}
      </div>
    </div>
  )
}
