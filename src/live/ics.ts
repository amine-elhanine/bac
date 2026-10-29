import { clubDateKey } from './datetime'
import type { LiveEvent } from './types'

/**
 * RFC 5545 calendar file for one event, with folded long lines and escaped
 * text values. Times are exported in UTC so calendar apps display local time.
 */
export function downloadEventIcs(event: LiveEvent): void {
  const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\n|\r/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
  const toIcsDate = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const startsAt = new Date(event.starts_at)
  const endsAt = event.ends_at ? new Date(event.ends_at) : new Date(startsAt.getTime() + 60 * 60 * 1000)
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BAC Club//Club Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${event.id}@bac-club`, `DTSTAMP:${toIcsDate(new Date())}`, `DTSTART:${toIcsDate(startsAt)}`, `DTEND:${toIcsDate(endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : event.status === 'draft' ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR',
  ]
  const encoder = new TextEncoder()
  const foldLine = (line: string) => {
    let folded = ''
    let byteLength = 0
    for (const character of line) {
      const characterBytes = encoder.encode(character).length
      if (byteLength + characterBytes > 75) { folded += '\r\n '; byteLength = 1 }
      folded += character
      byteLength += characterBytes
    }
    return folded
  }
  const blob = new Blob([`${lines.map(foldLine).join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const slug = event.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'event'
  link.download = `bac-${slug}-${clubDateKey(event.starts_at)}.ics`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
