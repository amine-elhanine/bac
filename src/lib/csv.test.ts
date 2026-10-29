import { describe, expect, it } from 'vitest'
import { buildCsv, titleSlug } from './csv'

describe('buildCsv', () => {
  it('prefixes a BOM and quotes every cell', () => {
    const csv = buildCsv(['Name', 'Note'], [['Salma', 'paid 50']])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"Name","Note"')
    expect(csv).toContain('"Salma","paid 50"')
  })

  it('doubles embedded quotes', () => {
    const csv = buildCsv(['A'], [['He said "hi"']])
    expect(csv).toContain('"He said ""hi"""')
  })

  it('guards against spreadsheet formula injection', () => {
    const csv = buildCsv(['A'], [['=SUM(A1:A2)'], ['+cmd'], ['-2+3'], ['@x']])
    expect(csv).toContain('"\'=SUM(A1:A2)"')
    expect(csv).toContain("\"'+cmd\"")
    expect(csv).toContain("\"'-2+3\"")
    expect(csv).toContain('"\'@x"')
  })

  it('renders null and undefined as empty cells', () => {
    const csv = buildCsv(['A'], [[null, undefined]])
    expect(csv).toContain('"",""')
  })

  it('uses CRLF row separators', () => {
    const csv = buildCsv(['A'], [['1'], ['2']])
    expect(csv.split('\r\n')).toHaveLength(3)
  })
})

describe('titleSlug', () => {
  it('slugifies titles for filenames', () => {
    expect(titleSlug('November club gathering!')).toBe('november-club-gathering')
    expect(titleSlug('Caravan — Équipe Santé')).toBe('caravan-equipe-sante')
  })
  it('falls back to event when only symbols remain', () => {
    expect(titleSlug('???')).toBe('event')
  })
})
