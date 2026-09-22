import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Archive, ArrowLeft, ArrowRight, Calendar, ChevronLeft, ChevronRight, Clock3, Download, Eye, FileX2, LoaderCircle, PackageCheck, RefreshCw, Search, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'

import {
  ApiError,
  cancelRecorderActivity,
  deleteRecorderActivity,
  getActivityAuditEvents,
  getMediaAssetContentUrl,
  getRecorderActivity,
  listRecorderActivities,
  updateRecorderActivity,
  type ActivityAuditEvent,
  type ListRecorderActivitiesInput,
  type RecorderActivity,
  type RecorderActivityDetail,
} from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Textarea } from './ui/textarea'
import { useI18n } from '../i18n'
import { RecorderComparison } from './RecorderComparison'
import { RecorderRecovery } from './RecorderRecovery'

interface RecorderHistoryProps { refreshKey?: number }

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function toTimestamp(value: string): string | undefined { return value ? new Date(value).toISOString() : undefined }

function statusVariant(status: RecorderActivity['status']): 'success' | 'warning' | 'outline' {
  if (status === 'complete') return 'success'
  if (status === 'uploading' || status === 'expired') return 'warning'
  return 'outline'
}

export function RecorderHistory({ refreshKey = 0 }: RecorderHistoryProps) {
  const { t } = useI18n()
  const [referenceQuery, setReferenceQuery] = useState('')
  const [activities, setActivities] = useState<RecorderActivity[]>([])
  const [appliedFilters, setAppliedFilters] = useState<ListRecorderActivitiesInput>({ page: 1, pageSize: 10 })
  const [meta, setMeta] = useState({ page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<RecorderActivityDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [mediaErrors, setMediaErrors] = useState<string[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [auditEvents, setAuditEvents] = useState<ActivityAuditEvent[]>([])
  const [actionError, setActionError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewerAssetId, setViewerAssetId] = useState<string | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null)
  const detailRequest = useRef(0)
  const detailTrigger = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void listRecorderActivities(appliedFilters).then((result) => {
      if (!active) return
      setActivities(result.data)
      setMeta(result.meta)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof ApiError && reason.code === 'AUTH_REQUIRED' ? 'Sign in again to search your records.' : reason instanceof ApiError && reason.code === 'VALIDATION_ERROR' ? 'Check your search and filter values, then retry.' : 'Unable to load recorder history.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [appliedFilters, refreshKey, reloadKey])

  async function openDetail(activityId: string, trigger?: HTMLElement) {
    const request = ++detailRequest.current
    detailTrigger.current = trigger ?? document.activeElement as HTMLElement | null
    setSelected(null); setViewerAssetId(null); setDetailLoading(true); setDetailError(''); setMediaErrors([]); setActionError(''); setActionNotice('')
    try {
      const [detail, audit] = await Promise.all([getRecorderActivity(activityId), getActivityAuditEvents(activityId)])
      if (request !== detailRequest.current) return
      setSelected(detail); setAuditEvents(audit)
    } catch (reason) {
      if (request === detailRequest.current) setDetailError(reason instanceof Error ? reason.message : 'Unable to load activity detail.')
    } finally { if (request === detailRequest.current) setDetailLoading(false) }
  }

  function closeDetail() {
    detailRequest.current += 1
    setSelected(null); setDetailLoading(false); setDetailError(''); setViewerAssetId(null); setConfirmAction(null)
    queueMicrotask(() => detailTrigger.current?.focus())
  }

  const detailOpen = detailLoading || Boolean(detailError) || Boolean(selected)
  useEffect(() => {
    if (!detailOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (viewerAssetId) setViewerAssetId(null)
      else if (confirmAction) setConfirmAction(null)
      else closeDetail()
    }
    document.addEventListener('keydown', closeWithEscape)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', closeWithEscape) }
  }, [confirmAction, detailOpen, viewerAssetId])

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    setSaving(true); setActionError(''); setActionNotice('')
    try {
      const activity = await updateRecorderActivity(selected.id, { notes: String(form.get('notes') ?? '').trim() || null, occurredAt: new Date(String(form.get('occurredAt'))).toISOString(), operationType: String(form.get('operationType')) as RecorderActivity['operationType'], reference: String(form.get('reference') ?? '').trim() || null })
      setSelected({ ...selected, ...activity })
      setAuditEvents(await getActivityAuditEvents(selected.id))
      setActionNotice('Activity metadata updated and recorded in the audit trail.')
      setReloadKey((value) => value + 1)
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to update activity metadata.') } finally { setSaving(false) }
  }

  async function cancelActivity() {
    if (!selected) return
    setSaving(true); setActionError('')
    try {
      const result = await cancelRecorderActivity(selected.id)
      setSelected({ ...selected, ...result.activity })
      setAuditEvents(await getActivityAuditEvents(selected.id))
      setActionNotice(result.cleanupPending ? 'Activity cancelled. Storage cleanup is pending and can be retried.' : 'Activity cancelled and storage cleanup completed.')
      setReloadKey((value) => value + 1)
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to cancel the activity.') } finally { setSaving(false) }
  }

  async function deleteActivity() {
    if (!selected) return
    setSaving(true); setActionError('')
    try {
      const result = await deleteRecorderActivity(selected.id)
      setSelected(null)
      setActionNotice(result.cleanupPending ? t('Activity deleted. Some storage cleanup remains pending.') : t('Activity and stored evidence deleted.'))
      setReloadKey((value) => value + 1)
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : t('Unable to delete the activity.')) } finally { setSaving(false) }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSelected(null)
    setAppliedFilters({ reference: referenceQuery.trim() || undefined, occurredFrom: toTimestamp(String(form.get('occurredFrom') ?? '')), occurredTo: toTimestamp(String(form.get('occurredTo') ?? '')), operationType: (String(form.get('operationType') ?? '') || undefined) as ListRecorderActivitiesInput['operationType'], page: 1, pageSize: 10, sortDirection: (String(form.get('sortDirection') ?? '') || 'desc') as 'asc' | 'desc', status: (String(form.get('status') ?? '') || undefined) as ListRecorderActivitiesInput['status'] })
  }

  function clearSearch() {
    setReferenceQuery('')
    setSelected(null)
    setAppliedFilters((current) => ({ ...current, reference: undefined, page: 1 }))
  }

  function changePage(page: number) { setSelected(null); setAppliedFilters((current) => ({ ...current, page })) }

  const viewerAsset = selected?.assets.find((asset) => asset.id === viewerAssetId)
  const readyAssets = selected?.status === 'expired' ? [] : selected?.assets.filter((asset) => asset.status === 'ready') ?? []
  function moveViewer(direction: number) {
    if (!viewerAssetId || !readyAssets.length) return
    const index = readyAssets.findIndex((asset) => asset.id === viewerAssetId)
    const next = readyAssets[(index + direction + readyAssets.length) % readyAssets.length]
    setViewerAssetId(next.id); setViewerZoom(1)
  }

  return (
    <Card className="overflow-hidden" aria-labelledby="recorder-history-heading">
      <CardHeader className="border-b bg-muted/40">
        <div className="mb-3 flex items-center justify-between"><Badge variant="outline"><Archive aria-hidden="true" className="size-3" /> {t('Evidence archive')}</Badge>{!loading && <span className="text-xs font-medium text-muted-foreground">{meta.totalRecords} {t(meta.totalRecords === 1 ? 'record' : 'records')}</span>}</div>
        <CardTitle id="recorder-history-heading">{t('Recorded handoffs')}</CardTitle>
        <CardDescription>{t('Search activity history and review verified evidence.')}</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <RecorderRecovery />
        <RecorderComparison />
        <form aria-label={t('Filter recorder history')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={applyFilters}>
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="filter-reference">{t('Search order or shipment reference')}</Label>
            <div className="flex flex-wrap gap-2">
              <Input className="min-w-0 flex-1 basis-48" id="filter-reference" name="reference" type="search" maxLength={160} value={referenceQuery} onChange={(event) => setReferenceQuery(event.target.value)} placeholder={t('Enter all or part of a reference')} aria-describedby="reference-search-help" />
              <Button type="button" variant="outline" disabled={!referenceQuery && !appliedFilters.reference} onClick={clearSearch}>{t('Clear search')}</Button>
            </div>
            <p className="text-xs text-muted-foreground" id="reference-search-help">{t('Search all your records, ignoring letter case. Other filters still apply.')}</p>
          </div>
          <div className="space-y-2"><Label htmlFor="filter-operation">{t('Operation')}</Label><Select id="filter-operation" name="operationType" defaultValue=""><option value="">{t('All')}</option><option value="packing">{t('Packing')}</option><option value="unpacking">{t('Unpacking')}</option></Select></div>
          <div className="space-y-2"><Label htmlFor="filter-status">{t('Status')}</Label><Select id="filter-status" name="status" defaultValue=""><option value="">{t('All')}</option><option value="draft">{t('Draft')}</option><option value="uploading">{t('Uploading')}</option><option value="complete">{t('Complete')}</option><option value="expired">{t('Expired')}</option><option value="cancelled">{t('Cancelled')}</option></Select></div>
          <div className="space-y-2"><Label htmlFor="filter-order">{t('Order')}</Label><Select id="filter-order" name="sortDirection" defaultValue="desc"><option value="desc">{t('Newest first')}</option><option value="asc">{t('Oldest first')}</option></Select></div>
          <div className="space-y-2"><Label htmlFor="filter-from">{t('Occurred from')}</Label><Input id="filter-from" name="occurredFrom" type="datetime-local" /></div>
          <div className="space-y-2"><Label htmlFor="filter-to">{t('Occurred to')}</Label><Input id="filter-to" name="occurredTo" type="datetime-local" /></div>
          <Button className="self-end" type="submit"><Search aria-hidden="true" className="size-4" /> {t('Apply filters')}</Button>
        </form>

        <div className="mt-6">
          {loading && <p className="flex items-center gap-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" /> {t('Loading evidence records…')}</p>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><p>{t(error)}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw aria-hidden="true" className="size-3.5" /> {t('Retry')}</Button></div>}
          {!loading && !error && activities.length === 0 && <div className="grid min-h-40 place-items-center rounded-xl border border-dashed bg-muted/30 p-6 text-center"><div><FileX2 aria-hidden="true" className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{t('No evidence records match these filters.')}</p></div></div>}
          {!loading && !error && activities.length > 0 && <>
            <ul className="divide-y rounded-xl border">
              {activities.map((activity) => <li className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between" key={activity.id}>
                <div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><PackageCheck aria-hidden="true" className="size-5" /></span><div className="min-w-0"><strong className="block truncate text-sm">{activity.reference || `${t(activity.operationType === 'packing' ? 'Packing' : 'Unpacking')} ${t('record')}`}</strong><span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Calendar aria-hidden="true" className="size-3" /> {displayDate(activity.occurredAt)}</span><span>·</span><span className="capitalize">{t(activity.operationType === 'packing' ? 'Packing' : 'Unpacking')}</span><Badge variant={statusVariant(activity.status)}>{t(activity.status[0].toUpperCase() + activity.status.slice(1))}</Badge></span></div></div>
                <Button className="shrink-0" size="sm" variant="outline" onClick={(event) => void openDetail(activity.id, event.currentTarget)}><Eye aria-hidden="true" className="size-3.5" /> {t('View evidence')}</Button>
              </li>)}
            </ul>
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Recorder history pages"><Button disabled={meta.page <= 1} size="sm" variant="outline" onClick={() => changePage(meta.page - 1)}><ArrowLeft aria-hidden="true" className="size-3.5" /> {t('Previous')}</Button><span className="text-xs text-muted-foreground">{t('Page')} {meta.page} {t('of')} {Math.max(meta.totalPages, 1)}</span><Button disabled={meta.page >= meta.totalPages} size="sm" variant="outline" onClick={() => changePage(meta.page + 1)}>{t('Next')} <ArrowRight aria-hidden="true" className="size-3.5" /></Button></nav>
          </>}
        </div>

        {!selected && actionError && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{actionError}</p>}
        {!selected && actionNotice && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700" role="status">{actionNotice}</p>}

        {detailOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" data-testid="activity-detail-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !saving) closeDetail() }}>
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border bg-card shadow-2xl sm:max-h-[calc(100dvh-3rem)]" role="dialog" aria-modal="true" aria-labelledby={selected ? `activity-${selected.id}` : undefined} aria-label={!selected ? t('Activity detail') : undefined}>
          {detailLoading && <p className="flex min-h-48 items-center justify-center gap-2 p-5 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> {t('Loading activity detail…')}</p>}
          {detailError && <div className="p-5"><div className="flex justify-end"><Button aria-label={t('Close detail')} size="icon" variant="ghost" onClick={closeDetail}><X aria-hidden="true" className="size-4" /></Button></div><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{detailError}</p></div>}
        {selected && <article className="bg-muted/20 p-4 sm:p-6" aria-labelledby={`activity-${selected.id}`}>
          <div className="flex items-start justify-between gap-4"><div><Badge className="capitalize">{t(selected.operationType === 'packing' ? 'Packing' : 'Unpacking')}</Badge><h3 className="mt-3 text-xl font-semibold" id={`activity-${selected.id}`}>{selected.reference || t('Unreferenced activity')}</h3></div><Button aria-label={t('Close detail')} size="icon" variant="ghost" onClick={closeDetail}><X aria-hidden="true" className="size-4" /></Button></div>
          {actionError && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{actionError}</p>}
          {actionNotice && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700" role="status">{actionNotice}</p>}
          <dl className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-card p-3"><dt className="text-xs text-muted-foreground">{t('Status')}</dt><dd className="mt-1 text-sm font-semibold capitalize">{t(selected.status[0].toUpperCase() + selected.status.slice(1))}</dd></div><div className="rounded-xl bg-card p-3"><dt className="text-xs text-muted-foreground">{t('Occurred')}</dt><dd className="mt-1 text-sm font-semibold">{displayDate(selected.occurredAt)}</dd></div><div className="rounded-xl bg-card p-3"><dt className="text-xs text-muted-foreground">{t('Storage')}</dt><dd className="mt-1 text-sm font-semibold">{selected.storageProvider === 's3' ? t('Application storage') : 'Google Drive'}</dd></div></dl>
          {selected.status === 'expired' && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">{t('Stored evidence expired after 30 days and is no longer available. The record metadata is preserved.')}</p>}
          {selected.notes && <p className="mt-4 text-sm leading-6 text-muted-foreground">{selected.notes}</p>}

          {selected.status !== 'cancelled' && <form aria-label={t('Correct activity metadata')} className="mt-6 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2" onSubmit={saveMetadata}>
            <div className="space-y-2"><Label htmlFor="edit-operation">Operation</Label><Select id="edit-operation" name="operationType" defaultValue={selected.operationType}><option value="packing">Packing</option><option value="unpacking">Unpacking</option></Select></div>
            <div className="space-y-2"><Label htmlFor="edit-reference">Reference</Label><Input id="edit-reference" name="reference" defaultValue={selected.reference ?? ''} maxLength={160} /></div>
            <div className="space-y-2"><Label htmlFor="edit-occurred">Occurred</Label><Input id="edit-occurred" name="occurredAt" type="datetime-local" defaultValue={selected.occurredAt.slice(0, 16)} required /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-notes">Notes</Label><Textarea id="edit-notes" name="notes" defaultValue={selected.notes ?? ''} maxLength={2000} /></div>
            <Button className="sm:w-fit" disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />} {saving ? 'Saving…' : 'Save correction'}</Button>
          </form>}
          <div className="mt-4 flex flex-wrap gap-2">{(selected.status === 'draft' || selected.status === 'uploading') && <Button disabled={saving} variant="outline" onClick={() => setConfirmAction('cancel')}>Cancel activity</Button>}{(selected.status === 'complete' || selected.status === 'expired') && <Button disabled={saving} variant="destructive" onClick={() => setConfirmAction('delete')}><Trash2 aria-hidden="true" className="size-4" /> Delete activity</Button>}</div>

          {selected.assets.length === 0 ? <p className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">This activity has no evidence files yet.</p> : <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {selected.assets.map((asset) => <li className="overflow-hidden rounded-xl border bg-card" key={asset.id}>{asset.status === 'ready' && selected.status !== 'expired' ? <>{asset.mediaType === 'image' ? <img className="aspect-video w-full bg-muted object-contain" alt={asset.originalFilename} loading="lazy" onError={() => setMediaErrors((current) => current.includes(asset.id) ? current : [...current, asset.id])} src={getMediaAssetContentUrl(asset.id)} /> : <video className="aspect-video w-full bg-slate-950 object-contain" aria-label={asset.originalFilename} controls onError={() => setMediaErrors((current) => current.includes(asset.id) ? current : [...current, asset.id])} preload="metadata" src={getMediaAssetContentUrl(asset.id)} />}</> : <div className="grid aspect-video place-items-center bg-muted px-4 text-center text-sm text-muted-foreground">{selected.status === 'expired' ? t('Evidence expired') : `Evidence is ${asset.status.replace('_', ' ')}`}</div>}<div className="p-3"><strong className="block truncate text-sm">{asset.originalFilename}</strong><span className="mt-1 block text-xs text-muted-foreground">{(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB · {selected.status === 'expired' ? t('Expired') : asset.status}</span>{asset.status === 'ready' && selected.status !== 'expired' && <div className="mt-3 flex gap-2"><Button className="flex-1" size="sm" variant="outline" onClick={() => { setViewerAssetId(asset.id); setViewerZoom(1) }}><Eye aria-hidden="true" className="size-3.5" /> {t('Open viewer')}</Button><a className="inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold hover:bg-accent" href={getMediaAssetContentUrl(asset.id) + (selected.storageProvider === 'google_drive' ? '?download=1' : '')} download={asset.originalFilename}><Download aria-hidden="true" className="size-3.5" /><span className="sr-only">{t('Download original')}</span></a></div>}{mediaErrors.includes(asset.id) && <span className="mt-2 block text-xs text-red-700" role="alert">{t('Unable to load this evidence. Check your session or storage connection.')}</span>}</div></li>)}
          </ul>}

          <h4 className="mt-7 flex items-center gap-2 text-sm font-semibold"><Clock3 aria-hidden="true" className="size-4 text-primary" /> Audit trail</h4>
          {auditEvents.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No corrections or lifecycle actions recorded.</p> : <ul className="mt-3 divide-y rounded-xl border bg-card">{auditEvents.map((event) => <li className="flex items-center justify-between gap-4 p-3 text-sm" key={event.id}><strong className="capitalize">{event.action.replaceAll('_', ' ')}</strong><span className="text-xs text-muted-foreground">{displayDate(event.createdAt)}</span></li>)}</ul>}
        </article>}
          </div>
        </div>}
        {confirmAction && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation"><div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="confirm-action-heading"><h3 className="text-lg font-semibold" id="confirm-action-heading">{t(confirmAction === 'cancel' ? 'Cancel unfinished activity?' : 'Delete completed activity?')}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{t(confirmAction === 'cancel' ? 'This will cancel the activity and remove uploaded evidence.' : 'This permanently hides the activity and deletes its evidence. This cannot be undone.')}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmAction(null)}>{t('Keep')}</Button><Button variant={confirmAction === 'delete' ? 'destructive' : 'default'} disabled={saving} onClick={() => { const action = confirmAction; setConfirmAction(null); void (action === 'cancel' ? cancelActivity() : deleteActivity()) }}>{t('Confirm')}</Button></div></div></div>}
        {viewerAsset && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/90 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={t('Evidence viewer')}>
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b p-3"><strong className="min-w-0 truncate text-sm">{viewerAsset.originalFilename}</strong><div className="flex items-center gap-1"><Button aria-label={t('Zoom out')} className="!min-h-0" size="icon" variant="ghost" onClick={() => setViewerZoom((zoom) => Math.max(.75, zoom - .25))}><ZoomOut aria-hidden="true" className="size-4" /></Button><span className="w-12 text-center text-xs text-muted-foreground">{Math.round(viewerZoom * 100)}%</span><Button aria-label={t('Zoom in')} className="!min-h-0" size="icon" variant="ghost" onClick={() => setViewerZoom((zoom) => Math.min(2, zoom + .25))}><ZoomIn aria-hidden="true" className="size-4" /></Button><Button aria-label={t('Close viewer')} className="!min-h-0" size="icon" variant="ghost" onClick={() => setViewerAssetId(null)}><X aria-hidden="true" className="size-4" /></Button></div></div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-3"><div className="flex min-h-full min-w-full items-center justify-center" style={{ transform: `scale(${viewerZoom})`, transformOrigin: 'center' }}>{viewerAsset.mediaType === 'image' ? <img className="max-h-[75vh] max-w-full object-contain" alt={viewerAsset.originalFilename} src={getMediaAssetContentUrl(viewerAsset.id)} /> : <video className="max-h-[75vh] max-w-full" controls autoPlay={false} src={getMediaAssetContentUrl(viewerAsset.id)} />}</div>{readyAssets.length > 1 && <><Button aria-label={t('Previous evidence')} className="absolute left-3 top-1/2 !min-h-0 -translate-y-1/2 rounded-full bg-white/90" size="icon" variant="outline" onClick={() => moveViewer(-1)}><ChevronLeft aria-hidden="true" className="size-5" /></Button><Button aria-label={t('Next evidence')} className="absolute right-3 top-1/2 !min-h-0 -translate-y-1/2 rounded-full bg-white/90" size="icon" variant="outline" onClick={() => moveViewer(1)}><ChevronRight aria-hidden="true" className="size-5" /></Button></>}</div>
            <div className="flex items-center justify-between gap-3 border-t p-3"><span className="truncate text-xs text-muted-foreground">{readyAssets.findIndex((asset) => asset.id === viewerAsset.id) + 1} / {readyAssets.length}</span><a className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:bg-accent" href={getMediaAssetContentUrl(viewerAsset.id) + (selected?.storageProvider === 'google_drive' ? '?download=1' : '')} download={viewerAsset.originalFilename}><Download aria-hidden="true" className="size-4" /> {t('Download original')}</a></div>
          </div>
        </div>}
      </CardContent>
    </Card>
  )
}
