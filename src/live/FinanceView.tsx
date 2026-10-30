import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, Coins, Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { downloadCsv } from '../lib/csv'
import { clubDateBoundary, clubDateInput, clubDateKey, clubDateOnly, clubDateTime, formatMoney, isValidDateInput } from './datetime'
import { EmptyState } from './ui'
import { PurchaseRequestsPanel } from './Purchases'
import type { FinancialPeriodClosure, FinancialReconciliation, LiveEvent, MoneyEntry, PaymentReconciliationRow, Profile, PurchaseRequest } from './types'

export function FinanceLive({ entries, balanceMinor, reconciliation, closures, financialReconciliations, purchaseRequests, events, profiles, canManage, canRecord, canDecidePurchase, canReconcile, canClosePeriod, canAuditReceipts, canManageContributions, canExport, exporting, onExport, onOpenReceipt, onCreate, onDecidePurchase, onPayPurchase, onReverse, onGenerate, onContributionChanged, onPeriodClosed, onReconciled }: { entries: MoneyEntry[]; balanceMinor: number; reconciliation: PaymentReconciliationRow[]; closures: FinancialPeriodClosure[]; financialReconciliations: FinancialReconciliation[]; purchaseRequests: PurchaseRequest[]; events: LiveEvent[]; profiles: Profile[]; canManage: boolean; canRecord: boolean; canDecidePurchase: boolean; canReconcile: boolean; canClosePeriod: boolean; canAuditReceipts: boolean; canManageContributions: boolean; canExport: boolean; exporting: boolean; onExport: () => void; onOpenReceipt: (path: string) => void; onCreate: () => void; onDecidePurchase: (request: PurchaseRequest, decision: 'approved' | 'declined') => void; onPayPurchase: (request: PurchaseRequest) => void; onReverse: (entry: MoneyEntry) => void; onGenerate: (eventId: string) => void; onContributionChanged: () => void | Promise<void>; onPeriodClosed: () => void | Promise<void>; onReconciled: () => void | Promise<void> }) {
  const { t } = useI18n()
  const reversedIds = new Set(entries.filter((entry) => entry.transaction_type === 'reversal' && entry.reverses_transaction_id).map((entry) => entry.reverses_transaction_id))
  return <div className="finance-workspace"><section className="live-panel"><div className="live-panel-head"><div><h2>{canManage ? t('Club ledger') : t('My payment history')}</h2><p>{canManage ? t('Contributions, purchases, and event costs.') : t('Your recorded contributions and payments.')}</p></div><div className="live-panel-actions">{canExport && <button className="button button-outline" onClick={onExport} disabled={exporting}>{exporting ? t('Preparing CSV…') : t('Export CSV')}</button>}{canRecord && <button className="button button-primary" onClick={onCreate}><Plus size={15} /> {t('Record transaction')}</button>}</div></div><div className="ledger-balance"><div><span>{canManage ? t('RECORDED LEDGER BALANCE') : t('YOUR RECORDED CONTRIBUTIONS')}</span><strong>{formatMoney(balanceMinor, 'MAD')}</strong></div><div className="ledger-icon"><Coins size={20} /></div></div>{canManageContributions && <EventContributionManager events={events} onSaved={onContributionChanged} />}<PaymentReconciliation rows={reconciliation} events={events} profiles={profiles} canViewAll={canManage} canGenerate={canManageContributions} canExport={canExport} onGenerate={onGenerate} />{entries.length ? <div className="live-money-list">{entries.map((entry) => <div className="live-money-row" key={entry.id}><span className={`money-direction ${entry.direction === 'in' ? 'money-in' : 'money-out'}`}>{entry.direction === 'in' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div><strong>{entry.description}</strong><small>{t(entry.transaction_type.replace('_', ' '))}{entry.purchase_request_id ? ` · ${t('linked purchase request')}` : ''} · {clubDateTime(entry.created_at, { dateStyle: 'medium' })} · {reversedIds.has(entry.id) ? t('reversed') : t(entry.status)}</small></div><b className={entry.direction === 'in' ? 'amount-positive' : ''}>{entry.direction === 'in' ? '+' : '−'}{formatMoney(entry.amount_minor, entry.currency)}</b>{entry.receipt_path && <button className="reverse-button" onClick={() => onOpenReceipt(entry.receipt_path!)}>{t('Receipt')}</button>}{canRecord && entry.transaction_type !== 'reversal' && !reversedIds.has(entry.id) && <button className="reverse-button" onClick={() => onReverse(entry)}>{t('Reverse')}</button>}</div>)}</div> : <EmptyState title={t('No transactions recorded')} detail={canManage ? t('Record the first contribution, event collection, or purchase.') : t('Payments linked to your member account will appear here.')} />}</section>{canManage && <PurchaseRequestsPanel requests={purchaseRequests} profiles={profiles} events={events} canDecide={canDecidePurchase} canPay={canRecord} onDecide={onDecidePurchase} onPay={onPayPurchase} />}{canManage && <><FinancialReport canExport={canExport} /><FinancialReconciliationPanel rows={financialReconciliations} profiles={profiles} canRecord={canReconcile} canExport={canExport} onRecorded={onReconciled} /><FinancialPeriodPanel closures={closures} canClose={canClosePeriod} onClosed={onPeriodClosed} />{canAuditReceipts && <OrphanReceiptCleanup />}</>}</div>
}

function OrphanReceiptCleanup() {
  const { t } = useI18n()
  const [paths, setPaths] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const discover = async () => {
    setBusy(true); setError(''); setMessage('')
    const client = supabase
    if (!client) return
    try {
      const { data, error: queryError } = await client.rpc('list_orphan_receipt_uploads')
      if (queryError) throw queryError
      const found = (data ?? []).map((row: { path: string }) => row.path)
      setPaths(found)
      setMessage(found.length ? t('{count} unlinked receipt upload(s) older than 24 hours found.', { count: found.length }) : t('No abandoned receipt uploads found.'))
    } catch { setError(t('Could not check for abandoned receipt uploads. Check storage permissions and try again.')) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!paths.length) return
    const client = supabase
    if (!client) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: auditError } = await client.rpc('audit_orphan_receipt_cleanup', { p_paths: paths })
      if (auditError) throw auditError
      const { error: removeError } = await client.storage.from('financial-receipts').remove(paths)
      if (removeError) throw removeError
      setPaths([])
      setMessage(t('{count} orphan receipt upload(s) removed. The cleanup action was recorded in the audit log.', { count: paths.length }))
    } catch { setError(t('Cleanup did not complete. Linked receipts are protected; refresh the list and retry if needed.')) }
    finally { setBusy(false) }
  }
  return <section className="live-panel"><div className="live-panel-head"><div><h2>{t('Abandoned receipt uploads')}</h2><p>{t('Find your unlinked private uploads older than 24 hours. Linked finance receipts cannot be removed here.')}</p></div><div className="live-panel-actions"><button className="button button-outline" onClick={() => void discover()} disabled={busy}>{busy ? t('Checking…') : t('Find uploads')}</button>{paths.length > 0 && <button className="button button-outline" onClick={() => void remove()} disabled={busy}>{busy ? t('Cleaning…') : t('Remove {count}', { count: paths.length })}</button>}</div></div>{message && <p role="status">{message}</p>}{error && <div className="auth-error" role="alert">{error}</div>}{paths.length > 0 && <ul>{paths.map((path) => <li key={path}>{path.split('/').at(-1)}</li>)}</ul>}</section>
}

function FinancialReport({ canExport }: { canExport: boolean }) {
  const { t } = useI18n()
  const now = new Date()
  const initialEnd = clubDateInput(now)
  const initialStart = `${initialEnd.slice(0, 7)}-01`
  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)
  const [rows, setRows] = useState<MoneyEntry[]>([])
  const [busy, setBusy] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setBusy(true); setError('')
    try {
      if (!isValidDateInput(startDate) || !isValidDateInput(endDate) || startDate > endDate) throw new Error(t('Choose a valid date range.'))
      const from = clubDateBoundary(startDate)
      const nextDay = new Date(`${endDate}T00:00:00Z`); nextDay.setUTCDate(nextDay.getUTCDate() + 1)
      const until = clubDateBoundary(nextDay.toISOString().slice(0, 10))
      const all: MoneyEntry[] = []
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        const { data, error: queryError } = await supabase.from('financial_transactions').select('id,transaction_type,amount_minor,direction,currency,description,created_at,status,event_id,member_id,reverses_transaction_id,purchase_request_id,receipt_path').gte('created_at', from).lt('created_at', until).order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + pageSize - 1)
        if (queryError) throw queryError
        const page = (data ?? []) as MoneyEntry[]; all.push(...page); if (page.length < pageSize) break
      }
      setRows(all)
    } catch (cause) { setRows([]); setError(cause instanceof Error ? cause.message : t('Could not load the finance report.')) }
    finally { setBusy(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range-scoped load
  }, [startDate, endDate])
  useEffect(() => { void load() }, [load])

  const income = rows.filter((row) => row.status === 'posted' && row.direction === 'in').reduce((sum, row) => sum + Number(row.amount_minor), 0)
  const expenses = rows.filter((row) => row.status === 'posted' && row.direction === 'out').reduce((sum, row) => sum + Number(row.amount_minor), 0)
  const grouped = new Map<string, { count: number; income: number; expenses: number }>()
  for (const row of rows) { const item = grouped.get(row.transaction_type) ?? { count: 0, income: 0, expenses: 0 }; item.count++; if (row.status === 'posted') { if (row.direction === 'in') item.income += Number(row.amount_minor); else item.expenses += Number(row.amount_minor) } grouped.set(row.transaction_type, item) }

  async function exportRange() {
    if (!supabase || exporting || !rows.length) return
    setExporting(true); setError('')
    try {
      const { error: auditError } = await supabase.rpc('audit_report_export', { p_report_type: 'finance', p_scope_id: `${startDate}:${endDate}` })
      if (auditError) throw auditError
      downloadCsv(`bac-finance-report-${startDate}-to-${endDate}.csv`,
        [t('Transaction ID'), t('Date'), t('Type'), t('Direction'), t('Amount (minor units)'), t('Currency'), t('Description'), t('Status'), t('Event ID'), t('Member ID'), t('Reversal of'), t('Purchase request ID')],
        rows.map((row) => [row.id, new Date(row.created_at).toISOString(), row.transaction_type, row.direction, row.amount_minor, row.currency, row.description, row.status, row.event_id ?? '', row.member_id ?? '', row.reverses_transaction_id ?? '', row.purchase_request_id ?? '']))
    } catch { setError(t('Could not record the report export. No download was started.')) }
    finally { setExporting(false) }
  }

  return <section className="live-panel financial-report"><div className="live-panel-head"><div><h2>{t('Finance report')}</h2><p>{t('Posted income and expenses for the selected period; draft or rejected entries are excluded from totals.')}</p></div>{canExport && <button type="button" className="button button-outline" onClick={() => void exportRange()} disabled={busy || exporting || !rows.length}>{exporting ? t('Preparing…') : t('Export range')}</button>}</div><div className="financial-report-filters"><label>{t('From')}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>{t('To')}<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><button type="button" className="button button-outline" onClick={() => void load()} disabled={busy}>{busy ? t('Loading…') : t('Refresh')}</button></div>{error && <div className="auth-error financial-report-error" role="alert">{error}</div>}{busy ? <div className="live-loading">{t('Calculating finance totals…')}</div> : <><div className="reconciliation-totals financial-report-totals"><div><small>{t('POSTED INCOME')}</small><strong>{formatMoney(income, 'MAD')}</strong></div><div><small>{t('POSTED EXPENSES')}</small><strong>{formatMoney(expenses, 'MAD')}</strong></div><div><small>{t('NET')}</small><strong>{formatMoney(income - expenses, 'MAD')}</strong></div></div>{grouped.size ? <div className="financial-report-groups">{[...grouped.entries()].map(([type, item]) => <article key={type}><strong>{t(type.replaceAll('_', ' '))}</strong><span>{t('{count} entries', { count: item.count })}</span><small>{t('In {amount}', { amount: formatMoney(item.income, 'MAD') })} · {t('Out {amount}', { amount: formatMoney(item.expenses, 'MAD') })}</small></article>)}</div> : <p className="reconciliation-empty">{t('No finance entries fall in this period.')}</p>}</>}</section>
}

function FinancialReconciliationPanel({ rows, profiles, canRecord, canExport, onRecorded }: { rows: FinancialReconciliation[]; profiles: Profile[]; canRecord: boolean; canExport: boolean; onRecorded: () => void | Promise<void> }) {
  const { t } = useI18n()
  const today = clubDateInput(new Date())
  const [asOfDate, setAsOfDate] = useState(today)
  const [method, setMethod] = useState('cash')
  const [filterMethod, setFilterMethod] = useState('all')
  const [actual, setActual] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]))
  const methodNames: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank transfer', card: 'Card', other: 'Other' }
  const visibleRows = filterMethod === 'all' ? rows : rows.filter((row) => row.payment_method === filterMethod)

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase || !canRecord || busy) return
    const actualMinor = Math.round(Number(actual) * 100)
    if (!Number.isFinite(actualMinor) || actualMinor < 0) { setError(t('Enter a valid counted balance.')); return }
    if (reason.trim().length < 4) { setError(t('Explain the reconciliation or any difference.')); return }
    setBusy(true); setError('')
    const { error: saveError } = await supabase.rpc('record_financial_reconciliation', { p_as_of_date: asOfDate, p_payment_method: method, p_actual_balance_minor: actualMinor, p_reason: reason.trim() })
    if (saveError) { setError(saveError.message || t('Could not save the reconciliation.')); setBusy(false); return }
    setActual(''); setReason(''); setBusy(false); await onRecorded()
  }

  async function exportSnapshots() {
    if (!supabase || exporting || !rows.length) return
    setExporting(true); setError('')
    try {
      const { error: auditError } = await supabase.rpc('audit_report_export', { p_report_type: 'financial_reconciliation', p_scope_id: 'all' })
      if (auditError) throw auditError
      const allRows: FinancialReconciliation[] = []
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        const { data, error: queryError } = await supabase.from('financial_reconciliations').select('id,as_of_date,payment_method,transaction_count,ledger_balance_minor,actual_balance_minor,variance_minor,reason,reconciled_by,reconciled_at').order('as_of_date', { ascending: false }).order('reconciled_at', { ascending: false }).range(offset, offset + pageSize - 1)
        if (queryError) throw queryError
        const page = (data ?? []) as FinancialReconciliation[]; allRows.push(...page); if (page.length < pageSize) break
      }
      downloadCsv(`bac-financial-reconciliations-${new Date().toISOString().slice(0, 10)}.csv`,
        [t('Snapshot ID'), t('Balance date'), t('Payment method'), t('Posted transaction count'), t('Ledger balance (minor units)'), t('Counted balance (minor units)'), t('Variance (minor units)'), t('Reason'), t('Recorded by member ID'), t('Recorded at')],
        allRows.map((row) => [row.id, row.as_of_date, row.payment_method, row.transaction_count, row.ledger_balance_minor, row.actual_balance_minor, row.variance_minor, row.reason, row.reconciled_by, new Date(row.reconciled_at).toISOString()]))
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not export reconciliation snapshots.')) }
    finally { setExporting(false) }
  }

  return <section className="live-panel financial-period-panel"><div className="live-panel-head"><div><h2>{t('Cash and bank reconciliation')}</h2><p>{t('Compare a counted cash or account balance with posted transactions through a date. Each snapshot is retained for review.')}</p></div><div className="live-panel-actions"><label className="reconciliation-filter">{t('History')}<select aria-label={t('Filter reconciliation history by payment method')} value={filterMethod} onChange={(event) => setFilterMethod(event.target.value)}><option value="all">{t('All methods')}</option><option value="cash">{t('Cash')}</option><option value="bank_transfer">{t('Bank transfer')}</option><option value="card">{t('Card')}</option><option value="other">{t('Other')}</option></select></label>{canExport && <button type="button" className="button button-outline" onClick={() => void exportSnapshots()} disabled={exporting || !rows.length}>{exporting ? t('Preparing…') : t('Export CSV')}</button>}</div></div>{canRecord && <form className="live-form period-close-form" onSubmit={(formEvent) => void submit(formEvent)}><div className="live-form-grid"><label>{t('Balance date')}<input required type="date" max={today} value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} /></label><label>{t('Payment method')}<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="cash">{t('Cash')}</option><option value="bank_transfer">{t('Bank transfer')}</option><option value="card">{t('Card')}</option><option value="other">{t('Other')}</option></select></label></div><label>{t('Counted balance (MAD)')}<input required type="number" min="0" step="0.01" value={actual} onChange={(event) => setActual(event.target.value)} /></label><label>{t('Reconciliation note')}<textarea required minLength={4} maxLength={500} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('For example: cash counted with two officers; receipt for 20 MAD is still being checked.')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Saving snapshot…') : t('Record reconciliation')}</button></form>}{visibleRows.length ? <div className="financial-period-list">{visibleRows.map((row) => <article key={row.id}><div className="financial-period-heading"><strong>{t(methodNames[row.payment_method] ?? row.payment_method)} · {clubDateOnly(row.as_of_date)} <span className={`status-pill ${row.variance_minor === 0 ? 'status-active' : 'status-pending'}`}><i />{row.variance_minor === 0 ? t('Matched') : t('Variance found')}</span></strong><small>{t('Recorded by {name}', { name: names.get(row.reconciled_by) ?? t('Finance officer') })} · {clubDateTime(row.reconciled_at)} · {t('{count} posted entries', { count: row.transaction_count })}</small></div><div className="reconciliation-totals"><div><small>{t('LEDGER')}</small><strong>{formatMoney(row.ledger_balance_minor, 'MAD')}</strong></div><div><small>{t('COUNTED')}</small><strong>{formatMoney(row.actual_balance_minor, 'MAD')}</strong></div><div><small>{t('VARIANCE')}</small><strong className={row.variance_minor === 0 ? 'amount-positive' : ''}>{row.variance_minor > 0 ? '+' : ''}{formatMoney(row.variance_minor, 'MAD')}</strong></div></div><p>{row.reason}</p></article>)}</div> : <EmptyState title={rows.length ? t('No snapshots for this method') : t('No reconciliation snapshots')} detail={rows.length ? t('Choose another payment method to view its reconciliation history.') : canRecord ? t('Record the physical cash or account balance after comparing receipts and statements.') : t('No cash or bank reconciliations have been recorded yet.')} />}</section>
}

function FinancialPeriodPanel({ closures, canClose, onClosed }: { closures: FinancialPeriodClosure[]; canClose: boolean; onClosed: () => void | Promise<void> }) {
  const { t } = useI18n()
  const today = new Date()
  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const [startDate, setStartDate] = useState(dateValue(previousMonthStart))
  const [endDate, setEndDate] = useState(dateValue(previousMonthEnd))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function closePeriod(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase || !canClose || busy) return
    if (endDate >= dateValue(today)) { setError(t('Only a period that ended before today can be closed.')); return }
    if (reason.trim().length < 4) { setError(t('Enter a reason for closing this period.')); return }
    setBusy(true); setError('')
    const { error: closeError } = await supabase.rpc('close_financial_period', { p_start_date: startDate, p_end_date: endDate, p_reason: reason.trim() })
    if (closeError) { setError(t('Could not close this period. Check its dates, overlap, and your Treasury permissions.')); setBusy(false); return }
    setReason(''); setBusy(false); await onClosed()
  }

  return <section className="live-panel financial-period-panel"><div className="live-panel-head"><div><h2>{t('Financial period close')}</h2><p>{t('Closed totals are immutable snapshots. Corrections must be recorded as reversals in an open period.')}</p></div></div>{canClose && <form className="live-form period-close-form" onSubmit={(formEvent) => void closePeriod(formEvent)}><div className="live-form-grid"><label>{t('Period starts')}<input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>{t('Period ends')}<input type="date" required value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div><label>{t('Reason for closing')}<textarea required minLength={4} maxLength={400} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('For example, monthly Treasurer reconciliation completed')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Closing period…') : t('Close financial period')}</button></form>}{closures.length ? <div className="financial-period-list">{closures.map((period) => <article key={period.id}><div className="financial-period-heading"><strong>{clubDateOnly(period.start_date)} – {clubDateOnly(period.end_date)}</strong><small>{t('Closed {time}', { time: clubDateTime(period.closed_at) })} · {t('{count} posted entries', { count: period.transaction_count })}</small></div><div className="reconciliation-totals"><div><small>{t('INCOME')}</small><strong>{formatMoney(period.income_minor, 'MAD')}</strong></div><div><small>{t('EXPENSES')}</small><strong>{formatMoney(period.expenses_minor, 'MAD')}</strong></div><div><small>{t('NET')}</small><strong>{formatMoney(period.net_minor, 'MAD')}</strong></div></div><p>{period.reason}</p></article>)}</div> : <EmptyState title={t('No periods closed')} detail={canClose ? t('Close a completed date range after reconciling its receipts and ledger.') : t('The Finance team has not closed a reporting period yet.')} />}</section>
}

function EventContributionManager({ events, onSaved }: { events: LiveEvent[]; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const eligible = events.filter((event) => ['published', 'in_progress'].includes(event.status))
  const [eventId, setEventId] = useState('')
  const selected = eligible.find((event) => event.id === eventId) ?? eligible[0]
  const [amount, setAmount] = useState('0')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (selected) { setEventId(selected.id); setAmount((selected.expected_contribution_minor / 100).toFixed(2)) } }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync fields only when the selected event's identity or fee changes
    , [selected?.id, selected?.expected_contribution_minor])
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase || !selected) return
    const amountMinor = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountMinor) || amountMinor < 0) { setError(t('Enter a valid non-negative contribution amount.')); return }
    if (reason.trim().length < 4) { setError(t('Explain why this contribution amount is being set or changed.')); return }
    setBusy(true); setError('')
    try {
      const { error: saveError } = await supabase.rpc('set_event_contribution', { p_event_id: selected.id, p_expected_minor: amountMinor, p_reason: reason.trim() })
      if (saveError) { setError(saveError.message); setBusy(false); return }
      setReason(''); setBusy(false); await onSaved()
    } catch { setError(t('Could not update the event contribution. Please try again.')); setBusy(false) }
  }
  return <section className="event-contribution-manager"><div><strong>{t('Event contribution')}</strong><small>{t('President and Treasury only · changes update outstanding expectations and are audited.')}</small></div>{eligible.length ? <form className="contribution-manager-form" onSubmit={(formEvent) => void submit(formEvent)}><label>{t('Event')}<select value={selected?.id ?? ''} onChange={(event) => setEventId(event.target.value)}>{eligible.map((item) => <option key={item.id} value={item.id}>{item.title} · {clubDateOnly(item.starts_at)}</option>)}</select></label><label>{t('Expected amount (MAD)')}<input type="number" min="0" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>{t('Reason')}<textarea minLength={4} maxLength={500} rows={2} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('Explain the amount or change')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<button type="submit" className="button button-outline" disabled={busy}>{busy ? t('Saving…') : t('Save contribution')}</button></form> : <p className="reconciliation-empty">{t('Create and publish an event before setting its contribution.')}</p>}</section>
}

function PaymentReconciliation({ rows, events, profiles, canViewAll, canGenerate, canExport, onGenerate }: { rows: PaymentReconciliationRow[]; events: LiveEvent[]; profiles: Profile[]; canViewAll: boolean; canGenerate: boolean; canExport: boolean; onGenerate: (eventId: string) => void }) {
  const { t } = useI18n()
  const eligibleEvents = useMemo(() => events.filter((event) => event.expected_contribution_minor > 0 && ['published', 'in_progress', 'completed'].includes(event.status)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)), [events])
  const [eventId, setEventId] = useState('')
  const [sheetBusy, setSheetBusy] = useState(false)
  const [sheetError, setSheetError] = useState('')
  useEffect(() => { if (!eligibleEvents.some((event) => event.id === eventId)) setEventId(eligibleEvents[0]?.id ?? '') }, [eligibleEvents, eventId])
  const selected = eligibleEvents.find((event) => event.id === eventId)
  const items = rows.filter((row) => row.event_id === eventId)
  const paymentByMember = new Map(items.map((row) => [row.member_id, row]))
  const activeProfiles = profiles.filter((profile) => profile.status === 'active')
  const names = new Map(profiles.map((person) => [person.id, person.full_name]))
  const expected = items.reduce((sum, row) => sum + row.expected_minor - row.waiver_minor, 0)
  const received = items.reduce((sum, row) => sum + row.received_minor, 0)
  const due = items.reduce((sum, row) => sum + row.due_minor, 0)
  async function exportCollectionSheet() {
    if (!supabase || !canGenerate || !selected || !activeProfiles.length || sheetBusy) return
    setSheetBusy(true)
    setSheetError('')
    try {
      const { error } = await supabase.rpc('audit_report_export', { p_report_type: 'finance', p_scope_id: `collection-sheet:${selected.id}` })
      if (error) throw error
      const generatedAt = new Date().toISOString()
      downloadCsv(`bac-paper-collection-${selected.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'event'}-${clubDateKey(selected.starts_at)}.csv`,
        [t('Event'), t('Event date'), t('Roster snapshot generated (Morocco time)'), t('Member code'), t('Member name'), t('Expected if HR confirms attendance (MAD)'), t('Attendance verified by HR'), t('Approved waiver (MAD)'), t('Previously recorded (MAD)'), t('Remaining due for synced attendee (MAD)'), t('Cash collected on paper (MAD)'), t('Payment method'), t('Receipt / signature / notes')],
        activeProfiles.map((member) => {
          const payment = paymentByMember.get(member.id)
          const expectedIfPresent = payment ? payment.expected_minor - payment.waiver_minor : selected.expected_contribution_minor
          return [selected.title, clubDateKey(selected.starts_at), clubDateTime(generatedAt), member.member_code, member.full_name, (expectedIfPresent / 100).toFixed(2), payment ? t('Yes · synced') : '', payment ? (payment.waiver_minor / 100).toFixed(2) : '', payment ? (payment.received_minor / 100).toFixed(2) : '', payment ? (payment.due_minor / 100).toFixed(2) : '', '', '', '']
        }))
    } catch {
      setSheetError(t('The collection sheet could not be audited, so no download was started.'))
    } finally { setSheetBusy(false) }
  }
  return <section className="payment-reconciliation"><div className="reconciliation-header"><div><strong>{canViewAll ? t('Event payment reconciliation') : t('My event contributions')}</strong><small>{canViewAll ? t('Expected amount for recorded attendees compared with posted contributions and reversals.') : t('Your expected and recorded contributions by event.')}</small></div>{canGenerate && selected && <div className="live-panel-actions"><button className="button button-outline" onClick={() => onGenerate(selected.id)} disabled={!selected.attendance_sessions?.length}>{t('Sync attendees')}</button>{canExport && <button className="button button-outline" onClick={() => void exportCollectionSheet()} disabled={!activeProfiles.length || sheetBusy}>{sheetBusy ? t('Preparing…') : t('Download paper cash sheet')}</button>}</div>}</div>{sheetError && <p className="account-preference-error" role="alert">{sheetError}</p>}{canGenerate && selected && <p className="reconciliation-empty">{t('For an offline collection, mark attendance and cash on paper; confirm attendance with HR before posting transactions after reconnecting.')}</p>}{eligibleEvents.length ? <label className="reconciliation-event-select">{t('Event')}<select value={eventId} onChange={(change) => setEventId(change.target.value)}>{eligibleEvents.map((event) => <option key={event.id} value={event.id}>{event.title} · {clubDateTime(event.starts_at, { dateStyle: 'medium' })}</option>)}</select></label> : <p className="reconciliation-empty">{t('No published events have a fixed expected contribution.')}</p>}{selected && canGenerate && !selected.attendance_sessions?.length && <p className="reconciliation-empty">{t('Ask HR to open attendance for this event before syncing attendee contributions.')}</p>}{selected && (items.length ? <><div className="reconciliation-totals"><div><small>{t('EXPECTED')}</small><strong>{formatMoney(expected, 'MAD')}</strong></div><div><small>{t('RECEIVED')}</small><strong>{formatMoney(received, 'MAD')}</strong></div><div><small>{t('OUTSTANDING')}</small><strong>{formatMoney(due, 'MAD')}</strong></div></div><div className="reconciliation-rows">{items.map((row) => <div className="reconciliation-row" key={row.member_id}><div><strong>{canViewAll ? names.get(row.member_id) ?? t('Member') : t('Your contribution')}</strong><small>{row.waiver_minor ? `${t('Waived {amount}', { amount: formatMoney(row.waiver_minor, 'MAD') })} · ` : ''}{t('Received {amount}', { amount: formatMoney(row.received_minor, 'MAD') })} · {t('Due {amount}', { amount: formatMoney(row.due_minor, 'MAD') })}</small></div><span className={`status-pill ${row.payment_status === 'paid' || row.payment_status === 'waived' ? 'status-active' : 'status-pending'}`}><i />{t(row.payment_status)}</span></div>)}</div></> : <p className="reconciliation-empty">{canGenerate ? t('No member expectations exist yet. Sync the recorded attendees for this event.') : t('The Treasurer has not generated expectations for this event yet.')}</p>)}</section>
}
