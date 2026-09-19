import { useEffect, useMemo, useState } from 'react'
import { FileCheck2, LoaderCircle, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react'

import { ApiError, cancelRecorderActivity, finalizeMediaAsset, getRecorderActivity, listRecorderActivities, retryMediaAsset, uploadMedia, type MediaAsset, type RecorderActivity, type RecorderActivityDetail } from '../api'
import { useI18n } from '../i18n'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function providerName(provider: RecorderActivity['storageProvider'], t: (value: string) => string): string {
  return provider === 'google_drive' ? 'Google Drive' : t('Application storage')
}

export function RecorderRecovery() {
  const { t } = useI18n()
  const [activities, setActivities] = useState<RecorderActivity[]>([])
  const [selected, setSelected] = useState<RecorderActivityDetail | null>(null)
  const [files, setFiles] = useState<Record<string, File>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<RecorderActivity | null>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const [drafts, uploading] = await Promise.all([
        listRecorderActivities({ status: 'draft', page: 1, pageSize: 100, sortDirection: 'desc' }),
        listRecorderActivities({ status: 'uploading', page: 1, pageSize: 100, sortDirection: 'desc' }),
      ])
      const merged = [...drafts.data, ...uploading.data].filter((item) => item.status === 'draft' || item.status === 'uploading').filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
      setActivities(merged.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))
    } catch (reason) { setError(reason instanceof ApiError && reason.code === 'AUTH_REQUIRED' ? t('Sign in again to recover unfinished work.') : t('Unable to load unfinished work.')) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function open(activityId: string) {
    setBusy(activityId); setError('')
    try { setSelected(await getRecorderActivity(activityId)); setFiles({}); setErrors({}) }
    catch { setError(t('Unable to load unfinished activity.')) }
    finally { setBusy(null) }
  }

  const unfinishedAssets = useMemo(() => selected?.assets.filter((asset) => asset.status !== 'ready') ?? [], [selected])

  async function choose(asset: MediaAsset, file: File | undefined) {
    if (!file) return
    setErrors((current) => ({ ...current, [asset.id]: '' }))
    if (file.name !== asset.originalFilename || file.size !== asset.sizeBytes || file.type !== asset.contentType) {
      setErrors((current) => ({ ...current, [asset.id]: t('The selected file does not match the original evidence. Choose the exact file.') })); return
    }
    try {
      if ((await checksum(file)) !== asset.sha256) throw new Error('checksum')
      setFiles((current) => ({ ...current, [asset.id]: file }))
    } catch { setErrors((current) => ({ ...current, [asset.id]: t('The selected file does not match the original evidence. Choose the exact file.') })) }
  }

  async function retry(asset: MediaAsset) {
    const file = files[asset.id]
    if (!file || !selected) return
    setBusy(asset.id); setErrors((current) => ({ ...current, [asset.id]: '' }))
    try {
      const prepared = await retryMediaAsset(asset.id)
      await uploadMedia(file, prepared.upload, () => undefined)
      await finalizeMediaAsset(asset.id, prepared.upload.attemptId)
      setSelected(await getRecorderActivity(selected.id))
      setFiles((current) => { const next = { ...current }; delete next[asset.id]; return next })
    } catch (reason) {
      const message = reason instanceof ApiError && reason.code === 'UPLOAD_NETWORK_ERROR'
        ? t(reason.message)
        : reason instanceof ApiError && reason.code === 'UPLOAD_ALREADY_ACTIVE'
          ? t('This upload is still active. Refresh after it expires, then retry.')
          : t('The upload could not be recovered. Check the connection and retry.')
      setErrors((current) => ({ ...current, [asset.id]: message }))
    } finally { setBusy(null) }
  }

  async function removeUnfinished() {
    if (!deleteTarget) return
    setBusy(deleteTarget.id)
    try { await cancelRecorderActivity(deleteTarget.id); setActivities((current) => current.filter((item) => item.id !== deleteTarget.id)); if (selected?.id === deleteTarget.id) setSelected(null); setDeleteTarget(null) }
    catch { setError(t('Unable to delete unfinished activity.')) }
    finally { setBusy(null) }
  }

  if (!loading && !activities.length && !error) return null
  return <Card className="mb-6 border-primary/20" aria-labelledby="recorder-recovery-heading">
    <CardHeader className="border-b bg-primary/5"><div className="flex items-center justify-between gap-3"><div><CardTitle id="recorder-recovery-heading">{t('Unfinished work')}</CardTitle><CardDescription>{t('Continue a draft or interrupted upload without creating a duplicate record.')}</CardDescription></div><Button aria-label={t('Refresh unfinished work')} size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="size-3.5" /> {t('Refresh')}</Button></div></CardHeader>
    <CardContent className="space-y-4 p-4">
      {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite"><LoaderCircle className="size-4 animate-spin" /> {t('Loading unfinished work…')}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {!loading && activities.length > 0 && <ul className="divide-y rounded-xl border">{activities.map((activity) => <li className="flex items-center justify-between gap-3 p-3" key={activity.id}><div className="min-w-0"><strong className="block truncate text-sm">{activity.reference || t(activity.operationType === 'packing' ? 'Packing' : 'Unpacking')}</strong><span className="text-xs text-muted-foreground">{providerName(activity.storageProvider, t)} · <Badge variant="warning">{t(activity.status === 'draft' ? 'Draft' : 'Uploading')}</Badge></span></div><div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" onClick={() => void open(activity.id)} disabled={busy === activity.id}><RotateCcw className="size-3.5" /> {t('Continue')}</Button><Button aria-label={`${t('Delete')} ${activity.reference || t('record')}`} size="icon" variant="ghost" onClick={() => setDeleteTarget(activity)} disabled={busy === activity.id}><Trash2 className="size-4" /></Button></div></li>)}</ul>}
      {selected && <div className="space-y-3 rounded-xl border bg-muted/20 p-4"><div><h3 className="font-semibold">{selected.reference || t('Unfinished activity')}</h3><p className="text-xs text-muted-foreground">{providerName(selected.storageProvider, t)} · {t('Ready evidence is kept; only missing files need to be selected again.')}</p></div>{selected.assets.map((asset) => <div className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between" key={asset.id}><div className="flex min-w-0 items-center gap-2"><FileCheck2 className={`size-4 ${asset.status === 'ready' ? 'text-emerald-600' : 'text-muted-foreground'}`} /><span className="truncate text-sm">{asset.originalFilename}</span><Badge variant={asset.status === 'ready' ? 'success' : 'outline'}>{t(asset.status === 'ready' ? 'Already verified' : 'Needs file')}</Badge></div>{asset.status !== 'ready' && <div className="flex flex-wrap items-center gap-2"><label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"><Upload className="size-3" /> {t(files[asset.id] ? 'File selected' : 'Choose exact file')}<input className="sr-only" type="file" accept={asset.contentType} onChange={(event) => void choose(asset, event.target.files?.[0])} /></label><Button size="sm" disabled={!files[asset.id] || busy === asset.id} onClick={() => void retry(asset)}>{busy === asset.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} {t('Retry upload')}</Button></div>}{errors[asset.id] && <p className="text-xs text-red-700" role="alert">{errors[asset.id]}</p>}</div>)}</div>}
      {selected && !unfinishedAssets.length && <p className="text-sm text-emerald-700">{t('All evidence is already verified. You can complete this activity from its detail view.')}</p>}
      {deleteTarget && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation"><div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="recovery-delete-heading"><h3 className="text-lg font-semibold" id="recovery-delete-heading">{t('Delete unfinished activity?')}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{t('This will cancel the unfinished activity and remove uploaded evidence.')}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t('Keep')}</Button><Button variant="destructive" disabled={busy === deleteTarget.id} onClick={() => void removeUnfinished()}>{t('Confirm')}</Button></div></div></div>}
    </CardContent>
  </Card>
}
