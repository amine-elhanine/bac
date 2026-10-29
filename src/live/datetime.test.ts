import { describe, expect, it } from 'vitest'
import { clubDateBoundary, clubDateInput, clubDateKey, clubDateTimeInput, clubInputToIso, formatMoney, initials, isValidDateInput } from './datetime'
import { setDateLocale } from './datetime'

// Morocco is UTC+1 year-round (no DST since 2018); these fixtures rely on that.
describe('clubDateKey', () => {
  it('formats an instant as the Morocco-local calendar date', () => {
    expect(clubDateKey('2026-11-02T16:30:00Z')).toBe('2026-11-02')
    expect(clubDateKey('2026-11-02T23:30:00Z')).toBe('2026-11-03')
  })
  it('accepts Date objects', () => {
    expect(clubDateKey(new Date('2026-01-01T00:30:00Z'))).toBe('2026-01-01')
  })
})

describe('clubDateInput', () => {
  it('renders a date input value in Morocco time', () => {
    expect(clubDateInput(new Date('2026-05-10T22:00:00Z'))).toBe('2026-05-10')
    expect(clubDateInput(new Date('2026-05-10T23:30:00Z'))).toBe('2026-05-11')
  })
})

describe('clubDateTimeInput', () => {
  it('renders a datetime-local input value in Morocco time', () => {
    expect(clubDateTimeInput('2026-11-02T16:30:00Z')).toBe('2026-11-02T17:30')
  })
})

describe('clubInputToIso', () => {
  it('converts Morocco-local input to UTC ISO', () => {
    expect(clubInputToIso('2026-11-02T17:30')).toBe('2026-11-02T16:30:00.000Z')
  })
  it('round-trips with clubDateTimeInput', () => {
    const iso = clubInputToIso('2026-03-15T09:05')
    expect(iso).not.toBeNull()
    expect(clubDateTimeInput(iso!)).toBe('2026-03-15T09:05')
  })
  it('rejects malformed input', () => {
    expect(clubInputToIso('2026-13-40T99:99')).toBeNull()
    expect(clubInputToIso('not-a-date')).toBeNull()
  })
})

describe('clubDateBoundary', () => {
  it('returns the UTC instant of Morocco local midnight', () => {
    // Morocco is UTC+1, so local midnight is 23:00 UTC the previous day.
    expect(clubDateBoundary('2026-11-02')).toBe('2026-11-01T23:00:00.000Z')
  })
  it('satisfies the defining property for a sample range', () => {
    for (const day of ['2026-01-15', '2026-07-01', '2026-12-31']) {
      const boundary = clubDateBoundary(day)
      expect(clubDateKey(boundary)).toBe(day)
      const before = new Date(new Date(boundary).getTime() - 60_000).toISOString()
      expect(clubDateKey(before)).not.toBe(day)
    }
  })
})

describe('isValidDateInput', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDateInput('2026-02-28')).toBe(true)
  })
  it('rejects malformed and impossible dates', () => {
    expect(isValidDateInput('2026-02-30')).toBe(false)
    expect(isValidDateInput('2026-2-28')).toBe(false)
    expect(isValidDateInput('hello')).toBe(false)
  })
})

describe('formatMoney', () => {
  it('renders minor units with two decimals', () => {
    expect(formatMoney(3420, 'MAD')).toBe('34.20 MAD')
    expect(formatMoney(0, 'MAD')).toBe('0.00 MAD')
    expect(formatMoney(-1250, 'MAD')).toBe('-12.50 MAD')
  })
})

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Salma Amrani')).toBe('SA')
    expect(initials('Nour El Idrissi')).toBe('NE')
    expect(initials('Cherif')).toBe('C')
  })
  it('falls back to B for empty names', () => {
    expect(initials('   ')).toBe('B')
  })
})

describe('locale switching', () => {
  it('date formats follow the configured locale', () => {
    setDateLocale('en-GB')
    expect(formatMoney(1000, 'MAD')).toBe('10.00 MAD')
    setDateLocale('fr-MA')
    expect(formatMoney(1000, 'MAD')).toBe('10,00 MAD')
    setDateLocale('en-GB')
  })
})
