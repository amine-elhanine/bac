/**
 * Club date, time, and money formatting. All club records are stored in UTC and
 * displayed in the club's time zone (Africa/Casablanca). Formatters follow the
 * active interface language via setDateLocale(), which the i18n provider calls.
 */

export const CLUB_TIME_ZONE = 'Africa/Casablanca'

let dateLocale = 'en-GB'
export function setDateLocale(locale: string): void {
  dateLocale = locale
}

function parts(value: string | Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  return new Intl.DateTimeFormat(dateLocale, { timeZone: CLUB_TIME_ZONE, ...options })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value
      return result
    }, {})
}

/** Morocco-local calendar date of an instant, as YYYY-MM-DD. */
export function clubDateKey(value: string | Date): string {
  const fields = parts(value, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${fields.year}-${fields.month}-${fields.day}`
}

export function clubDateOnly(value: string): string {
  return new Intl.DateTimeFormat(dateLocale, { timeZone: CLUB_TIME_ZONE, dateStyle: 'medium' }).format(new Date(value))
}

export function clubDatePart(value: string, part: 'day' | 'month'): string {
  const partOption = part === 'day' ? { day: 'numeric' as const } : { month: 'short' as const }
  return new Intl.DateTimeFormat(dateLocale, { timeZone: CLUB_TIME_ZONE, ...partOption }).format(new Date(value))
}

export function clubDateTime(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  return new Intl.DateTimeFormat(dateLocale, { ...options, timeZone: CLUB_TIME_ZONE }).format(new Date(value))
}

/** Value for <input type="date"> in Morocco time. */
export function clubDateInput(date: Date): string {
  const fields = parts(date, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${fields.year}-${fields.month}-${fields.day}`
}

/** Value for <input type="datetime-local"> in Morocco time. */
export function clubDateTimeInput(value: string): string {
  const fields = parts(value, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`
}

export function isValidDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

/**
 * UTC instant whose Morocco-local wall clock is 00:00 on the given date.
 * Iteratively corrects the UTC guess until the formatted parts match.
 */
export function clubDateBoundary(dateValue: string): string {
  const [year, month, day] = dateValue.split('-').map(Number)
  const targetUtc = Date.UTC(year, month - 1, day)
  let guess = targetUtc
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  for (let attempt = 0; attempt < 3; attempt++) {
    const fields = formatter.formatToParts(new Date(guess))
      .reduce<Record<string, number>>((result, part) => {
        if (part.type !== 'literal') result[part.type] = Number(part.value)
        return result
      }, {})
    const localAsUtc = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second)
    guess += targetUtc - localAsUtc
  }
  return new Date(guess).toISOString()
}

/** Convert a Morocco-local datetime-local input to a UTC ISO string, or null. */
export function clubInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  let candidate = desired
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const readFields = (date: Date) => formatter.formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value
    return result
  }, {})
  for (let attempt = 0; attempt < 4; attempt++) {
    const fields = readFields(new Date(candidate))
    const represented = Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day), Number(fields.hour), Number(fields.minute))
    const correction = desired - represented
    candidate += correction
    if (correction === 0) break
  }
  const finalFields = readFields(new Date(candidate))
  if (finalFields.year !== match[1] || finalFields.month !== match[2] || finalFields.day !== match[3] || finalFields.hour !== match[4] || finalFields.minute !== match[5]) return null
  return new Date(candidate).toISOString()
}

export function formatMoney(minor: number, currency: string): string {
  return `${new Intl.NumberFormat(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} ${currency}`
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'B'
}
