import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { clubDateTime, formatMoney } from './datetime'
import { Modal } from './ui'
import type { MoneyEntry, PaymentReconciliationRow, Profile, PurchaseRequest } from './types'

export function MoneyDialog({ userId, events, profiles, reconciliation, purchaseRequest, onClose, onSaved }: { userId: string; events: { id: string; title: string; expected_contribution_minor: number; currency: string }[]; profiles: Profile[]; reconciliation: PaymentReconciliationRow[]; purchaseRequest: PurchaseRequest | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [type, setType] = useState(purchaseRequest ? 'purchase' : 'contribution'); const [amount, setAmount] = useState(purchaseRequest?.estimated_amount_minor != null ? (purchaseRequest.estimated_amount_minor / 100).toFixed(2) : ''); const [description, setDescription] = useState(purchaseRequest?.item_description ?? ''); const [eventId, setEventId] = useState(purchaseRequest?.event_id ?? ''); const [memberId, setMemberId] = useState(''); const [method, setMethod] = useState('cash'); const [receipt, setReceipt] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const selectedEvent = events.find((event) => event.id === eventId)
  const requiresAttendance = type === 'contribution' && Boolean(selectedEvent && selectedEvent.expected_contribution_minor > 0)
  const attendeeRows = reconciliation.filter((row) => row.event_id === eventId)
  const remainingByMember = new Map(attendeeRows.map((row) => [row.member_id, row.due_minor]))
  const attendeeIds = new Set(attendeeRows.filter((row) => row.due_minor > 0).map((row) => row.member_id))
  const selectableProfiles = requiresAttendance ? profiles.filter((person) => attendeeIds.has(person.id)) : profiles.filter((person) => person.status === 'active')
  const selectedDueMinor = remainingByMember.get(memberId) ?? null
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const value = Math.round(Number(amount) * 100)
    if (!Number.isFinite(value) || value <= 0) { setError(t('Enter an amount greater than zero.')); setBusy(false); return }
    if (type === 'contribution' && !memberId) { setError(t('Choose the member who paid this contribution.')); setBusy(false); return }
    if (requiresAttendance && !attendeeIds.has(memberId)) { setError(t('Sync attendee contributions before recording this fixed event payment.')); setBusy(false); return }
    if (requiresAttendance && selectedDueMinor !== null && value > selectedDueMinor) { setError(t('The amount cannot exceed the remaining balance of {amount}.', { amount: formatMoney(selectedDueMinor, 'MAD') })); setBusy(false); return }
    const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    if (receipt && !extensions[receipt.type]) { setError(t('Attach a PDF, JPEG, PNG, or WebP receipt.')); setBusy(false); return }
    if (receipt && receipt.size > 10 * 1024 * 1024) { setError(t('Receipt files must be 10 MB or smaller.')); setBusy(false); return }
    const direction = type === 'contribution' || type === 'other_income' ? 'in' : 'out'
    const transactionId = crypto.randomUUID()
    const receiptPath = receipt ? `${userId}/${transactionId}/${crypto.randomUUID()}.${extensions[receipt.type]}` : null
    if (receipt && receiptPath) {
      const { error: uploadError } = await supabase.storage.from('financial-receipts').upload(receiptPath, receipt, { contentType: receipt.type, cacheControl: '3600', upsert: false })
      if (uploadError) { setError(t('Could not upload the receipt. Check storage setup and try again.')); setBusy(false); return }
    }
    const row = { id: transactionId, transaction_type: type, direction, amount_minor: value, currency: 'MAD', description: description.trim(), payment_method: method, event_id: eventId || null, member_id: type === 'contribution' ? memberId : null, purchase_request_id: purchaseRequest?.id ?? null, receipt_path: receiptPath, status: 'posted', created_by: userId }
    const { error: insertError } = await supabase.from('financial_transactions').insert(row)
    if (insertError) {
      if (receiptPath) {
        const { error: cleanupError } = await supabase.storage.from('financial-receipts').remove([receiptPath])
        if (cleanupError) { setError(`${insertError.message} ${t('The uploaded receipt could not be removed; ask the platform administrator to clean up the unlinked file.')}`); setBusy(false); return }
      }
      setError(insertError.message); setBusy(false); return
    }
    setBusy(false); await onSaved()
  }
  return <Modal title={purchaseRequest ? t('Pay approved purchase request') : t('Record a money movement')} subtitle={purchaseRequest ? `${purchaseRequest.item_description} · ${t('payment will be linked to this request.')}` : t('Posted records are corrected through a reversal, not by editing the original.')} onClose={onClose}><form className="live-form" onSubmit={submit}><div className="live-form-grid"><label>{t('Transaction')}<select value={type} disabled={Boolean(purchaseRequest)} onChange={(event) => { setType(event.target.value); setMemberId('') }}><option value="contribution">{t('Member contribution')}</option><option value="purchase">{t('Club purchase')}</option><option value="other_income">{t('Other income')}</option><option value="other_expense">{t('Other expense')}</option></select></label><div className="direction-display"><span>{t('Direction')}</span><strong>{type === 'contribution' || type === 'other_income' ? t('Money in') : t('Money out')}</strong></div></div><label>{t('Amount (MAD)')}<input required type="number" min="0.01" step="0.01" max={selectedDueMinor !== null && requiresAttendance ? selectedDueMinor / 100 : undefined} value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>{t('Description')}<input required maxLength={180} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('e.g. November gathering contribution')} /></label><div className="live-form-grid"><label>{t('Event')}<select value={eventId} onChange={(event) => { setEventId(event.target.value); setMemberId(''); if (type === 'contribution') setAmount('') }}><option value="">{t('No linked event')}</option>{events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>{t('Payment method')}<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="cash">{t('Cash')}</option><option value="bank_transfer">{t('Bank transfer')}</option><option value="card">{t('Card')}</option><option value="other">{t('Other')}</option></select></label></div>{type === 'contribution' && <label>{t('Member who paid')}<select required value={memberId} onChange={(event) => { const nextId = event.target.value; setMemberId(nextId); const dueMinor = remainingByMember.get(nextId); if (requiresAttendance && dueMinor !== undefined) setAmount((dueMinor / 100).toFixed(2)) }}><option value="">{t('Choose a member')}</option>{selectableProfiles.map((person) => <option key={person.id} value={person.id}>{person.full_name} · {person.member_code}{requiresAttendance ? ` · ${t('Due {amount}', { amount: formatMoney(remainingByMember.get(person.id) ?? 0, 'MAD') })}` : ''}</option>)}</select>{requiresAttendance && !selectableProfiles.length && <small>{t('No attendees have an outstanding balance. Sync again if HR changed attendance.')}</small>}</label>}<label>{t('Receipt (optional)')}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} /><small>{t('Private attachment · PDF, JPEG, PNG, or WebP · Max 10 MB')}</small></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy || (requiresAttendance && !selectableProfiles.length)}>{busy ? t('Saving…') : t('Record entry')}</button></div></form></Modal>
}

export function ReceiptDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const { t } = useI18n()
  const [url, setUrl] = useState(''); const [busy, setBusy] = useState(true); const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!supabase) { setError(t('Finance storage is not configured.')); setBusy(false); return () => { active = false } }
    const client = supabase
    void client.storage.from('financial-receipts').createSignedUrl(path, 120).then(({ data, error: urlError }) => {
      if (!active) return
      if (urlError || !data?.signedUrl) setError(t('This receipt is unavailable or you do not have permission to view it.'))
      else setUrl(data.signedUrl)
      setBusy(false)
    }).catch(() => { if (active) { setError(t('Could not load this receipt.')); setBusy(false) } })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- path-scoped load
  }, [path])
  const isPdf = path.toLowerCase().endsWith('.pdf')
  return <Modal title={t('Financial receipt')} subtitle={t('This private link expires shortly. Do not share it outside the club’s authorized finance team.')} onClose={onClose}><div className="receipt-preview">{busy ? <div className="live-loading">{t('Opening secure receipt…')}</div> : error ? <div className="auth-error" role="alert">{error}</div> : isPdf ? <iframe src={url} title={t('Financial receipt PDF')} /> : <img src={url} alt={t('Financial receipt')} />}</div></Modal>
}

export function ReversalDialog({ userId, entry, onClose, onSaved }: { userId: string; entry: MoneyEntry; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const { error: insertError } = await supabase.from('financial_transactions').insert({
      event_id: entry.event_id,
      member_id: entry.member_id,
      transaction_type: 'reversal',
      amount_minor: entry.amount_minor,
      direction: entry.direction === 'in' ? 'out' : 'in',
      currency: entry.currency,
      description: `${t('Reversal')}: ${entry.description}`,
      correction_reason: reason.trim(),
      status: 'posted',
      reverses_transaction_id: entry.id,
      created_by: userId,
    })
    if (insertError) { setError(insertError.code === '23505' ? t('This transaction already has a reversal.') : t('Could not record the reversal. Refresh the ledger and try again.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Reverse this transaction?')} subtitle={t('The original entry will stay in the ledger. A linked counter-entry will correct its effect on the balance.')} onClose={onClose}><form className="live-form" onSubmit={submit}><div className="reversal-summary"><strong>{entry.description}</strong><span>{entry.direction === 'in' ? '+' : '−'}{formatMoney(entry.amount_minor, entry.currency)} · {clubDateTime(entry.created_at, { dateStyle: 'medium' })}</span></div><label>{t('Reason for correction')}<textarea required minLength={4} maxLength={300} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('Explain why this entry needs to be reversed')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Recording…') : t('Record reversal')}</button></div></form></Modal>
}
