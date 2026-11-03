import { describe, expect, it } from 'vitest'
import { nextTeamIndex } from './utils'

const teams = (n: number, disqualified: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({ disqualified: disqualified.includes(i) }))

describe('nextTeamIndex', () => {
  it('ведёт ход строго по номерам команд', () => {
    const ts = teams(5)
    expect(nextTeamIndex(ts, 0)).toBe(1)
    expect(nextTeamIndex(ts, 1)).toBe(2)
    expect(nextTeamIndex(ts, 2)).toBe(3)
    expect(nextTeamIndex(ts, 3)).toBe(4)
  })

  it('после последней команды возвращается к первой', () => {
    expect(nextTeamIndex(teams(5), 4)).toBe(0)
    expect(nextTeamIndex(teams(12), 11)).toBe(0)
  })

  it('обходит весь круг ровно по одному разу — большие составы тоже', () => {
    const ts = teams(16)
    const seen: number[] = []
    let idx = 0
    for (let i = 0; i < 16; i++) {
      seen.push(idx)
      idx = nextTeamIndex(ts, idx)
    }
    expect(seen).toEqual([...Array(16).keys()])
    expect(idx).toBe(0)
  })

  it('пропускает дисквалифицированные команды', () => {
    // Команды №2 и №3 вне зачёта — ход идёт от первой сразу к четвёртой
    expect(nextTeamIndex(teams(5, [1, 2]), 0)).toBe(3)
    expect(nextTeamIndex(teams(5, [4]), 3)).toBe(0)
  })

  it('с одной командой ход остаётся на ней', () => {
    expect(nextTeamIndex(teams(1), 0)).toBe(0)
  })

  it('если вне зачёта все — просто передаёт ход по кругу', () => {
    expect(nextTeamIndex(teams(3, [0, 1, 2]), 1)).toBe(2)
    expect(nextTeamIndex(teams(3, [0, 1, 2]), 2)).toBe(0)
  })
})
