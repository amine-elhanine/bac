import { ArrowUpRight, CalendarDays } from 'lucide-react'
import type { Identity } from '../AuthGate'
import { useI18n } from '../i18n'
import { ROLE_LABELS } from '../lib/roles'
import { clubDateTime, clubDatePart } from './datetime'
import type { DashboardMetrics, LiveEvent, LiveView } from './types'

export function OverviewLive({ identity, upcoming, metrics, onNavigate, onOpenNotifications }: { identity: Identity; upcoming: LiveEvent[]; metrics: DashboardMetrics; onNavigate: (view: LiveView) => void; onOpenNotifications: () => void }) {
  const { t } = useI18n()
  const cards: { label: string; value: string; view: LiveView | null; detail?: string; onClick?: () => void }[] = [
    ...(metrics.activeMembers !== null ? [{ label: t('ACTIVE MEMBERS'), value: String(metrics.activeMembers), view: 'Members' as LiveView }] : []),
    ...(metrics.balanceMinor !== null ? [{ label: t('RECORDED BALANCE'), value: metrics.balanceMinor.toLocaleString(), view: 'Finance' as LiveView }] : []),
    ...(metrics.inventoryItems !== null ? [{ label: t('INVENTORY ITEMS'), value: String(metrics.inventoryItems), view: 'Logistics' as LiveView }] : []),
    ...(metrics.attendanceRate !== null ? [{ label: t('LATEST ATTENDANCE'), value: `${metrics.attendanceRate}%`, view: 'Attendance' as LiveView, detail: metrics.attendanceDetail ?? t('Of active members') }] : []),
    { label: t('OPEN TASKS'), value: String(metrics.openTasks), view: 'Tasks' },
    { label: t('UNREAD NOTICES'), value: String(metrics.unreadNotifications), view: null, onClick: onOpenNotifications },
  ]
  return <><section className="live-welcome"><div><div className="hero-kicker"><span /> {t('YOUR CLUB, IN MOTION')}</div><h2>{t('Many hands.')}<br /><em>{t('One shared purpose.')}</em></h2><p>{t('Welcome to your BAC workspace. Your role is')} <strong>{t(ROLE_LABELS[identity.roleName] ?? identity.roleName)}</strong>.</p><button className="button button-gold" onClick={() => onNavigate('Calendar')}><CalendarDays size={15} /> {t('Explore the calendar')}</button></div><img className="live-welcome-mark" src="/bac-logo.png" alt={t('Biologists in Action Club logo')} /></section><div className="task-summary dashboard-summary">{cards.map((card) => <button type="button" className="task-summary-card dashboard-metric" key={card.label} onClick={() => card.onClick ? card.onClick() : card.view && onNavigate(card.view)}><span>{card.label}</span><strong>{card.value}</strong>{card.detail && <small>{card.detail}</small>}</button>)}</div><div className="live-section-head"><div><h2>{t('Coming up')}</h2><p>{t('Published meetings and club events')}</p></div><button className="subtle-link" onClick={() => onNavigate('Calendar')}>{t('Full calendar')} <ArrowUpRight size={14} /></button></div>{upcoming.length ? <div className="live-event-grid">{upcoming.map((event) => <EventCard key={event.id} event={event} />)}</div> : <div className="live-empty"><div className="live-empty-icon"><CalendarDays size={20} /></div><strong>{t('Nothing scheduled yet')}</strong><p>{t('When the team publishes a meeting or event, it will appear here.')}</p></div>}</>
}

export function EventCard({ event }: { event: LiveEvent }) {
  const { t } = useI18n()
  return <article className="live-event-card"><div className="live-event-date"><strong>{clubDatePart(event.starts_at, 'day')}</strong><span>{clubDatePart(event.starts_at, 'month').toUpperCase()}</span></div><div className="live-event-copy"><span className="live-event-type">{t(event.event_type.replace('_', ' ').toUpperCase())}</span><h3>{event.title}</h3><p><CalendarDays size={13} />{clubDateTime(event.starts_at, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{event.location && <> · {event.location}</>}</p></div></article>
}
