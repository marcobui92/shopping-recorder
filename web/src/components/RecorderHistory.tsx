import { type FormEvent, useEffect, useRef, useState } from 'react'
import { DriveFileActions } from './DriveFileActions'
import { ArrowLeft, ArrowRight, Calendar, ChevronLeft, ChevronRight, Clock3, Download, Eye, FileX2, LoaderCircle, PackageCheck, RefreshCw, SlidersHorizontal, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'

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
  type MediaAsset,
  type RecorderActivity,
  type RecorderActivityDetail,
} from '../api'
import { Badge } from './ui/badge'
import { Button, buttonVariants } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Textarea } from './ui/textarea'
import { cn } from '../lib/utils'
import { type Locale, useI18n } from '../i18n'

interface RecorderHistoryProps { refreshKey?: number; sessionChecking?: boolean }

function displayDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function toTimestamp(value: string): string | undefined { return value ? new Date(value).toISOString() : undefined }

function toLocalInput(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function statusVariant(status: RecorderActivity['status']): 'success' | 'warning' | 'outline' {
  if (status === 'complete') return 'success'
  if (status === 'uploading' || status === 'expired') return 'warning'
  return 'outline'
}

function assetStatusLabel(status: MediaAsset['status']): string {
  return ({ pending_upload: 'Pending upload', verifying: 'Verifying', ready: 'Ready', failed: 'Failed' })[status]
}

export function RecorderHistory({ refreshKey = 0, sessionChecking = false }: RecorderHistoryProps) {
  const { locale, t } = useI18n()
  const [referenceQuery, setReferenceQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const detailRequest = useRef(0)
  const detailTrigger = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setSelectedIds([])
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

  const deletableIds = activities.map((activity) => activity.id)

  function toggleSelectedId(id: string, checked: boolean) {
    setSelectedIds((current) => checked ? [...current, id] : current.filter((value) => value !== id))
  }

  async function deleteSelected() {
    setBulkConfirmOpen(false)
    setBulkBusy(true); setActionError(''); setActionNotice('')
    const ids = selectedIds
    const results = await Promise.allSettled(ids.map((id) => deleteRecorderActivity(id)))
    const failed = results.filter((result) => result.status === 'rejected').length
    if (ids.length - failed > 0) setActionNotice(`${ids.length - failed} ${t('activities deleted.')}`)
    if (failed > 0) setActionError(`${failed} ${t('could not be deleted.')}`)
    setSelectedIds([])
    setReloadKey((value) => value + 1)
    setBulkBusy(false)
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSelected(null)
    setAppliedFilters((current) => ({ ...current, reference: referenceQuery.trim() || undefined, page: 1 }))
  }

  function updateFilters(patch: Partial<ListRecorderActivitiesInput>) {
    setSelected(null)
    setAppliedFilters((current) => ({ ...current, ...patch, page: 1 }))
  }

  const activeFilterCount = [appliedFilters.operationType, appliedFilters.status, appliedFilters.occurredFrom, appliedFilters.occurredTo].filter(Boolean).length

  function clearAllFilters() {
    setReferenceQuery('')
    setSelected(null)
    setAppliedFilters({ page: 1, pageSize: 10, sortDirection: 'desc' })
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
      <CardHeader className="border-b bg-muted/40 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-lg" id="recorder-history-heading">{t('Recorded handoffs')}</CardTitle>
          {!loading && <span className="shrink-0 text-xs font-medium text-muted-foreground">{meta.totalRecords} {t(meta.totalRecords === 1 ? 'record' : 'records')}</span>}
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <form aria-label={t('Filter recorder history')} className="space-y-3" onSubmit={applySearch}>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="sr-only" htmlFor="filter-reference">{t('Search order or shipment reference')}</Label>
            <Input className="min-w-0 flex-1 basis-48" id="filter-reference" type="search" maxLength={160} value={referenceQuery} onChange={(event) => setReferenceQuery(event.target.value)} placeholder={t('Enter all or part of a reference')} />
            <Button type="button" variant="outline" disabled={!referenceQuery && !appliedFilters.reference} onClick={clearSearch}>{t('Clear search')}</Button>
            <Button aria-expanded={filtersOpen} className="shrink-0" type="button" variant={filtersOpen ? 'default' : 'outline'} onClick={() => setFiltersOpen((open) => !open)}>
              <SlidersHorizontal aria-hidden="true" className="size-4" /> {t('Filters')}
              {activeFilterCount > 0 && <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-primary-foreground/20 text-xs font-semibold">{activeFilterCount}</span>}
            </Button>
          </div>
          {filtersOpen && <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="filter-operation">{t('Operation')}</Label><Select id="filter-operation" value={appliedFilters.operationType ?? ''} onChange={(event) => updateFilters({ operationType: (event.target.value || undefined) as ListRecorderActivitiesInput['operationType'] })}><option value="">{t('All')}</option><option value="packing">{t('Packing')}</option><option value="unpacking">{t('Unpacking')}</option></Select></div>
            <div className="space-y-1.5"><Label htmlFor="filter-status">{t('Status')}</Label><Select id="filter-status" value={appliedFilters.status ?? ''} onChange={(event) => updateFilters({ status: (event.target.value || undefined) as ListRecorderActivitiesInput['status'] })}><option value="">{t('All')}</option><option value="draft">{t('Draft')}</option><option value="uploading">{t('Uploading')}</option><option value="complete">{t('Complete')}</option><option value="expired">{t('Expired')}</option><option value="cancelled">{t('Cancelled')}</option></Select></div>
            <div className="space-y-1.5"><Label htmlFor="filter-order">{t('Order')}</Label><Select id="filter-order" value={appliedFilters.sortDirection ?? 'desc'} onChange={(event) => updateFilters({ sortDirection: event.target.value as 'asc' | 'desc' })}><option value="desc">{t('Newest first')}</option><option value="asc">{t('Oldest first')}</option></Select></div>
            <div className="space-y-1.5"><Label htmlFor="filter-from">{t('Occurred from')}</Label><Input id="filter-from" type="datetime-local" value={toLocalInput(appliedFilters.occurredFrom)} onChange={(event) => updateFilters({ occurredFrom: toTimestamp(event.target.value) })} /></div>
            <div className="space-y-1.5"><Label htmlFor="filter-to">{t('Occurred to')}</Label><Input id="filter-to" type="datetime-local" value={toLocalInput(appliedFilters.occurredTo)} onChange={(event) => updateFilters({ occurredTo: toTimestamp(event.target.value) })} /></div>
            <Button className="self-end" type="button" variant="ghost" disabled={activeFilterCount === 0 && !appliedFilters.reference} onClick={clearAllFilters}>{t('Clear all filters')}</Button>
          </div>}
        </form>

        <div className="mt-4">
          {(loading || (Boolean(error) && sessionChecking)) && <p className="flex items-center gap-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" /> {t('Loading evidence records…')}</p>}
          {error && !sessionChecking && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><p>{t(error)}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw aria-hidden="true" className="size-3.5" /> {t('Retry')}</Button></div>}
          {!loading && !error && activities.length === 0 && <div className="grid min-h-40 place-items-center rounded-xl border border-dashed bg-muted/30 p-6 text-center"><div><FileX2 aria-hidden="true" className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{t('No evidence records match these filters.')}</p></div></div>}
          {!loading && !error && activities.length > 0 && <>
            {deletableIds.length > 0 && <div className="mb-2 flex flex-wrap items-center gap-3 px-1 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground"><input checked={selectedIds.length > 0 && selectedIds.length === deletableIds.length} className="size-4 accent-primary" type="checkbox" onChange={(event) => setSelectedIds(event.target.checked ? deletableIds : [])} /> {t('Select all')}</label>
              {selectedIds.length > 0 && <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">{selectedIds.length} {t('records selected')}</span>
                <Button disabled={bulkBusy} size="sm" variant="ghost" onClick={() => setSelectedIds([])}>{t('Cancel')}</Button>
                <Button disabled={bulkBusy} size="sm" variant="destructive" onClick={() => setBulkConfirmOpen(true)}>{bulkBusy ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Trash2 aria-hidden="true" className="size-3.5" />} {t('Delete selected')}</Button>
              </div>}
            </div>}
            <ul className="divide-y rounded-xl border">
              {activities.map((activity) => <li className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between" key={activity.id}>
                <div className="flex min-w-0 items-start gap-3"><input aria-label={`${t('Select')} ${activity.reference || activity.id.slice(0, 8)}`} checked={selectedIds.includes(activity.id)} className="mt-3 size-4 shrink-0 accent-primary" type="checkbox" onChange={(event) => toggleSelectedId(activity.id, event.target.checked)} /><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><PackageCheck aria-hidden="true" className="size-5" /></span><div className="min-w-0"><strong className="block truncate text-sm">{activity.reference || `${t(activity.operationType === 'packing' ? 'Packing' : 'Unpacking')} ${t('record')}`}</strong><span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Calendar aria-hidden="true" className="size-3" /> {displayDate(activity.occurredAt, locale)}</span><span>·</span><span>{t(activity.operationType === 'packing' ? 'Packing' : 'Unpacking')}</span><Badge variant={statusVariant(activity.status)}>{t(activity.status[0].toUpperCase() + activity.status.slice(1))}</Badge></span></div></div>
                <Button className="shrink-0" size="sm" variant="outline" onClick={(event) => void openDetail(activity.id, event.currentTarget)}><Eye aria-hidden="true" className="size-3.5" /> {t('View evidence')}</Button>
              </li>)}
            </ul>
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('Recorder history pages')}><Button disabled={meta.page <= 1} size="sm" variant="outline" onClick={() => changePage(meta.page - 1)}><ArrowLeft aria-hidden="true" className="size-3.5" /> {t('Previous')}</Button><span className="text-xs text-muted-foreground">{t('Page')} {meta.page} {t('of')} {Math.max(meta.totalPages, 1)}</span><Button disabled={meta.page >= meta.totalPages} size="sm" variant="outline" onClick={() => changePage(meta.page + 1)}>{t('Next')} <ArrowRight aria-hidden="true" className="size-3.5" /></Button></nav>
          </>}
        </div>

        {!selected && actionError && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{t(actionError)}</p>}
        {!selected && actionNotice && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700" role="status">{t(actionNotice)}</p>}

        {detailOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" data-testid="activity-detail-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !saving) closeDetail() }}>
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl sm:max-h-[calc(100dvh-3rem)]" role="dialog" aria-modal="true" aria-labelledby={selected ? `activity-${selected.id}` : undefined} aria-label={!selected ? t('Activity detail') : undefined}>
          {detailLoading && <p className="flex min-h-48 items-center justify-center gap-2 p-5 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> {t('Loading activity detail…')}</p>}
          {detailError && <div className="p-5"><div className="flex justify-end"><Button aria-label={t('Close detail')} size="icon" variant="ghost" onClick={closeDetail}><X aria-hidden="true" className="size-4" /></Button></div><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{t(detailError)}</p></div>}
        {selected && <div className="flex min-h-0 flex-1 flex-col" aria-labelledby={`activity-${selected.id}`}>
          <div className="shrink-0 border-b bg-card px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Badge className="shrink-0">{t(selected.operationType === 'packing' ? 'Packing' : 'Unpacking')}</Badge>
                <h3 className="truncate text-lg font-semibold" id={`activity-${selected.id}`}>{selected.reference || t('Unreferenced activity')}</h3>
              </div>
              <Button aria-label={t('Close detail')} size="icon" variant="ghost" onClick={closeDetail}><X aria-hidden="true" className="size-4" /></Button>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><Badge className="shrink-0" variant={statusVariant(selected.status)}>{t(selected.status[0].toUpperCase() + selected.status.slice(1))}</Badge><span aria-hidden="true">·</span><span>{displayDate(selected.occurredAt, locale)}</span><span aria-hidden="true">·</span><span>{selected.storageProvider === 's3' ? t('Application storage') : 'Google Drive'}</span></p>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4 sm:p-5">
          {actionError && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{t(actionError)}</p>}
          {actionNotice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700" role="status">{t(actionNotice)}</p>}
          {selected.status === 'expired' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">{t('Stored evidence expired after 30 days and is no longer available. The record metadata is preserved.')}</p>}
          {selected.notes && <p className="text-sm leading-6 text-muted-foreground">{selected.notes}</p>}

          {selected.assets.length === 0 ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t('This activity has no evidence files yet.')}</p> : <ul className="grid gap-3 sm:grid-cols-2">
            {selected.assets.map((asset) => <li className="overflow-hidden rounded-xl border bg-card" key={asset.id}>{asset.status === 'ready' && selected.status !== 'expired' ? <>{asset.mediaType === 'image' ? <img className="aspect-video w-full bg-muted object-contain" alt={asset.originalFilename} loading="lazy" onError={() => setMediaErrors((current) => current.includes(asset.id) ? current : [...current, asset.id])} src={getMediaAssetContentUrl(asset.id)} /> : <video className="aspect-video w-full bg-slate-950 object-contain" aria-label={asset.originalFilename} controls onError={() => setMediaErrors((current) => current.includes(asset.id) ? current : [...current, asset.id])} preload="metadata" src={getMediaAssetContentUrl(asset.id)} />}</> : <div className="grid aspect-video place-items-center bg-muted px-4 text-center text-sm text-muted-foreground">{selected.status === 'expired' ? t('Evidence expired') : t(assetStatusLabel(asset.status))}</div>}<div className="p-3"><strong className="block truncate text-sm">{asset.originalFilename}</strong><span className="mt-1 block text-xs text-muted-foreground">{new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(asset.sizeBytes / 1024 / 1024)} MB · {selected.status === 'expired' ? t('Expired') : t(assetStatusLabel(asset.status))}</span>{asset.status === 'ready' && selected.status !== 'expired' && <div className="mt-3 flex gap-2"><Button className="flex-1" variant="outline" onClick={() => { setViewerAssetId(asset.id); setViewerZoom(1) }}><Eye aria-hidden="true" className="size-3.5" /> {t('Open viewer')}</Button><a className={cn(buttonVariants({ className: 'shrink-0', variant: 'outline' }))} href={getMediaAssetContentUrl(asset.id) + (selected.storageProvider === 'google_drive' ? '?download=1' : '')} download={asset.originalFilename}><Download aria-hidden="true" className="size-3.5" /><span className="sr-only">{t('Download original')}</span></a></div>}{asset.status === 'ready' && selected.status !== 'expired' && selected.status !== 'cancelled' && selected.storageProvider === 'google_drive' && <div className="mt-3"><DriveFileActions assetId={asset.id} /></div>}{mediaErrors.includes(asset.id) && <span className="mt-2 block text-xs text-red-700" role="alert">{t('Unable to load this evidence. Check your session or storage connection.')}</span>}</div></li>)}
          </ul>}

          {selected.status !== 'cancelled' && <form aria-label={t('Correct activity metadata')} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2" onSubmit={saveMetadata}>
            <div className="space-y-1.5"><Label htmlFor="edit-operation">{t('Operation')}</Label><Select id="edit-operation" name="operationType" defaultValue={selected.operationType}><option value="packing">{t('Packing')}</option><option value="unpacking">{t('Unpacking')}</option></Select></div>
            <div className="space-y-1.5"><Label htmlFor="edit-reference">{t('Reference')}</Label><Input id="edit-reference" name="reference" defaultValue={selected.reference ?? ''} maxLength={160} /></div>
            <div className="space-y-1.5"><Label htmlFor="edit-occurred">{t('Occurred')}</Label><Input id="edit-occurred" name="occurredAt" type="datetime-local" defaultValue={selected.occurredAt.slice(0, 16)} required /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="edit-notes">{t('Notes')}</Label><Textarea id="edit-notes" name="notes" defaultValue={selected.notes ?? ''} maxLength={2000} /></div>
            <Button className="sm:w-fit" disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />} {t(saving ? 'Saving…' : 'Save correction')}</Button>
          </form>}
          <div className="flex flex-wrap gap-2">{(selected.status === 'draft' || selected.status === 'uploading') && <Button disabled={saving} variant="outline" onClick={() => setConfirmAction('cancel')}>{t('Cancel activity')}</Button>}<Button disabled={saving} variant="destructive" onClick={() => setConfirmAction('delete')}><Trash2 aria-hidden="true" className="size-4" /> {t('Delete activity')}</Button></div>

          <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Clock3 aria-hidden="true" className="size-4 text-primary" /> {t('Audit trail')}</h4>
          {auditEvents.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('No corrections or lifecycle actions recorded.')}</p> : <ul className="mt-2 divide-y rounded-xl border bg-card">{auditEvents.map((event) => <li className="flex items-center justify-between gap-4 p-3 text-sm" key={event.id}><strong className="capitalize">{event.action.replaceAll('_', ' ')}</strong><span className="text-xs text-muted-foreground">{displayDate(event.createdAt, locale)}</span></li>)}</ul>}
          </div>
          </div>
        </div>}
          </div>
        </div>}
        {bulkConfirmOpen && <div data-testid="bulk-delete-backdrop" className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setBulkConfirmOpen(false) }}><div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-heading"><h3 className="text-lg font-semibold" id="bulk-delete-heading">{t('Delete selected activities?')}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{t('This permanently deletes the selected activities and their evidence. This cannot be undone.')}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setBulkConfirmOpen(false)}>{t('Keep')}</Button><Button variant="destructive" onClick={() => void deleteSelected()}>{t('Confirm')}</Button></div></div></div>}
        {confirmAction && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation"><div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="confirm-action-heading"><h3 className="text-lg font-semibold" id="confirm-action-heading">{t(confirmAction === 'cancel' ? 'Cancel unfinished activity?' : 'Delete activity?')}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{t(confirmAction === 'cancel' ? 'This will cancel the activity and remove uploaded evidence.' : 'This permanently hides the activity and deletes its evidence. This cannot be undone.')}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmAction(null)}>{t('Keep')}</Button><Button variant={confirmAction === 'delete' ? 'destructive' : 'default'} disabled={saving} onClick={() => { const action = confirmAction; setConfirmAction(null); void (action === 'cancel' ? cancelActivity() : deleteActivity()) }}>{t('Confirm')}</Button></div></div></div>}
        {viewerAsset && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/90 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={t('Evidence viewer')}>
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b p-3"><strong className="min-w-0 truncate text-sm">{viewerAsset.originalFilename}</strong><div className="flex items-center gap-1"><Button aria-label={t('Zoom out')} size="icon" variant="ghost" onClick={() => setViewerZoom((zoom) => Math.max(.75, zoom - .25))}><ZoomOut aria-hidden="true" className="size-4" /></Button><span className="w-12 text-center text-xs text-muted-foreground">{Math.round(viewerZoom * 100)}%</span><Button aria-label={t('Zoom in')} size="icon" variant="ghost" onClick={() => setViewerZoom((zoom) => Math.min(2, zoom + .25))}><ZoomIn aria-hidden="true" className="size-4" /></Button><Button aria-label={t('Close viewer')} size="icon" variant="ghost" onClick={() => setViewerAssetId(null)}><X aria-hidden="true" className="size-4" /></Button></div></div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-3"><div className="flex min-h-full min-w-full items-center justify-center" style={{ transform: `scale(${viewerZoom})`, transformOrigin: 'center' }}>{viewerAsset.mediaType === 'image' ? <img className="max-h-[75vh] max-w-full object-contain" alt={viewerAsset.originalFilename} src={getMediaAssetContentUrl(viewerAsset.id)} /> : <video className="max-h-[75vh] max-w-full" controls autoPlay={false} src={getMediaAssetContentUrl(viewerAsset.id)} />}</div>{readyAssets.length > 1 && <><Button aria-label={t('Previous evidence')} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90" size="icon" variant="outline" onClick={() => moveViewer(-1)}><ChevronLeft aria-hidden="true" className="size-5" /></Button><Button aria-label={t('Next evidence')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90" size="icon" variant="outline" onClick={() => moveViewer(1)}><ChevronRight aria-hidden="true" className="size-5" /></Button></>}</div>
            <div className="flex items-center justify-between gap-3 border-t p-3"><span className="truncate text-xs text-muted-foreground">{readyAssets.findIndex((asset) => asset.id === viewerAsset.id) + 1} / {readyAssets.length}</span><a className={cn(buttonVariants({ variant: 'outline' }))} href={getMediaAssetContentUrl(viewerAsset.id) + (selected?.storageProvider === 'google_drive' ? '?download=1' : '')} download={viewerAsset.originalFilename}><Download aria-hidden="true" className="size-4" /> {t('Download original')}</a></div>
            {selected?.storageProvider === 'google_drive' && <div className="border-t p-3"><DriveFileActions key={viewerAsset.id} assetId={viewerAsset.id} /></div>}
          </div>
        </div>}
      </CardContent>
    </Card>
  )
}
