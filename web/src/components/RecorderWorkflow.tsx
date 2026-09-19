import { type DragEvent, type FormEvent, useEffect, useRef, useState } from 'react'
import { Check, CircleCheck, CloudUpload, Expand, FileCheck2, FileImage, Image, Info, LoaderCircle, PackageOpen, RotateCcw, ShieldCheck, Trash2, Upload, Video } from 'lucide-react'

import {
  ApiError,
  completeRecorderActivity,
  createMediaAsset,
  createRecorderActivity,
  finalizeMediaAsset,
  getStorageProviders,
  type StorageProviders,
  retryMediaAsset,
  uploadMedia,
  type UploadCapability,
} from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Progress } from './ui/progress'
import { Select } from './ui/select'
import { Textarea } from './ui/textarea'
import { useI18n } from '../i18n'

type FileStage = 'selected' | 'hashing' | 'preparing' | 'uploading' | 'finalizing' | 'ready' | 'failed'

const supportedMediaTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'video/mp4', 'video/quicktime', 'video/webm',
])

interface FileItem {
  assetId?: string
  capability?: UploadCapability
  error?: string
  file: File
  key: string
  progress: number
  stage: FileStage
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function mediaType(file: File): 'image' | 'video' {
  return file.type.startsWith('video/') ? 'video' : 'image'
}

function stageLabel(stage: FileStage, t: (value: string) => string): string {
  return t(({ selected: 'Ready to upload', hashing: 'Calculating checksum', preparing: 'Preparing storage', uploading: 'Uploading', finalizing: 'Verifying file', ready: 'ready', failed: 'Needs attention' })[stage])
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function EvidencePreview({ file }: { file: File }) {
  const [failed, setFailed] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    setFailed(false)
    if (typeof URL.createObjectURL !== 'function') return

    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
    }
  }, [file])

  if (!previewUrl || failed) {
    return <span className="grid aspect-[4/3] w-full place-items-center bg-secondary text-muted-foreground"><FileImage aria-hidden="true" className="size-8" /></span>
  }

  if (file.type.startsWith('video/')) {
    return <video aria-label={`Preview of ${file.name}`} className="aspect-[4/3] w-full bg-slate-950 object-contain" controls muted preload="metadata" src={previewUrl} onError={() => setFailed(true)} />
  }

  return <a aria-label={`Open full preview of ${file.name}`} className="group/preview relative block overflow-hidden bg-secondary" href={previewUrl} rel="noreferrer" target="_blank"><img alt={`Preview of ${file.name}`} className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover/preview:scale-[1.02]" src={previewUrl} onError={() => setFailed(true)} /><span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-lg bg-slate-950/75 text-white opacity-0 backdrop-blur transition-opacity group-hover/preview:opacity-100"><Expand aria-hidden="true" className="size-4" /></span></a>
}

export function RecorderWorkflow({ onCompleted }: { onCompleted?: () => void }) {
  const { t } = useI18n()
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [activityId, setActivityId] = useState<string | null>(null)
  const [items, setItems] = useState<FileItem[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [complete, setComplete] = useState(false)
  const [submittedItems, setSubmittedItems] = useState<FileItem[]>([])
  const [submittedReference, setSubmittedReference] = useState('')
  const [providers, setProviders] = useState<StorageProviders | null>(null)
  const [provider, setProvider] = useState<'s3' | 'google_drive' | ''>('')
  const explicitProvider = useRef(false)
  const [storageError, setStorageError] = useState(false)
  const [storageLoading, setStorageLoading] = useState(true)

  useEffect(() => {
    let active = true
    let version = 0
    async function refresh() {
      const request = ++version
      setStorageLoading(true)
      try {
        const next = await getStorageProviders()
        if (!active || request !== version) return
        setProviders(next)
        setStorageError(false)
        if (!activityId && !explicitProvider.current) setProvider(next.google_drive.available ? 'google_drive' : next.s3.available ? 's3' : '')
      } catch { if (active && request === version) setStorageError(true) }
      finally { if (active && request === version) setStorageLoading(false) }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('storage-providers-changed', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('storage-providers-changed', refresh) }
  }, [activityId])
  const storageReady = !storageLoading && !storageError && Boolean(provider && providers?.[provider].available)
  function storageFailure(reason: unknown, fallback: string) {
    if (reason instanceof ApiError && reason.code === 'UPLOAD_NETWORK_ERROR') return t(reason.message)
    if (reason instanceof ApiError && /STORAGE|GOOGLE|UPLOAD_FAILED/.test(reason.code)) return t('Storage failed. Check the connection or free space, then retry. This record keeps its storage location.')
    return reason instanceof Error ? reason.message : t(fallback)
  }

  function update(key: string, changes: Partial<FileItem>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...changes } : item))
  }

  function selectFiles(files: FileList | File[] | null) {
    if (!files || activityId) return
    const selectedFiles = Array.from(files)
    const unsupported = selectedFiles.filter((file) => !supportedMediaTypes.has(file.type))
    const validFiles = selectedFiles.filter((file) => supportedMediaTypes.has(file.type))
    const duplicateFiles = validFiles.filter((file) => items.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified))
    const nextItems = validFiles.map((file, index) => ({ file, key: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`, progress: 0, stage: 'selected' as const }))
    if (unsupported.length && validFiles.length) setMessage(`${t('Unsupported file type:')} ${unsupported.map((file) => file.name).join(', ')}`)
    else if (unsupported.length) setMessage(`${t('Unsupported file type:')} ${unsupported.map((file) => file.name).join(', ')}`)
    else if (duplicateFiles.length) setMessage(`${t('Possible duplicate:')} ${duplicateFiles.map((file) => file.name).join(', ')}`)
    else setMessage('')
    if (validFiles.length) setItems((current) => [...current, ...nextItems])
  }

  function dropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragActive(false)
    selectFiles(event.dataTransfer.files)
  }

  function removeFile(key: string) {
    setItems((current) => current.filter((item) => item.key !== key))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadItem(item: FileItem, currentActivityId: string, retry = false) {
    try {
      let assetId = item.assetId
      let upload: UploadCapability
      if (retry && assetId && item.capability && new Date(item.capability.expiresAt).getTime() > Date.now()) {
        upload = item.capability
        update(item.key, { error: undefined, progress: 0, stage: 'preparing' })
      } else if (retry && assetId) {
        update(item.key, { error: undefined, progress: 0, stage: 'preparing' })
        upload = (await retryMediaAsset(assetId)).upload
      } else {
        update(item.key, { error: undefined, progress: 0, stage: 'hashing' })
        const hash = await sha256(item.file)
        update(item.key, { stage: 'preparing' })
        const prepared = await createMediaAsset(currentActivityId, { contentType: item.file.type, mediaType: mediaType(item.file), originalFilename: item.file.name, sha256: hash, sizeBytes: item.file.size })
        assetId = prepared.asset.id
        upload = prepared.upload
        update(item.key, { assetId, capability: upload })
      }
      update(item.key, { capability: upload, stage: 'uploading' })
      let uploadFailure: unknown
      try { await uploadMedia(item.file, upload, (progress) => update(item.key, { progress })) } catch (reason) { uploadFailure = reason }
      update(item.key, { progress: 100, stage: 'finalizing' })
      try {
        await finalizeMediaAsset(assetId, upload.attemptId)
        update(item.key, { capability: undefined, stage: 'ready' })
      } catch (reason) {
        if (reason instanceof ApiError && (reason.code === 'UPLOAD_VERIFICATION_FAILED' || reason.code === 'UPLOAD_EXPIRED')) update(item.key, { capability: undefined })
        if (uploadFailure) throw uploadFailure
        throw reason
      }
    } catch (reason) {
      update(item.key, { error: storageFailure(reason, 'Upload failed.'), stage: 'failed' })
    }
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!items.length) { setMessage(t('Select at least one image or video.')); return }
    if (busy || activityId || !provider || !storageReady) return
    explicitProvider.current = true
    setBusy(true)
    setMessage('')
    const data = new FormData(event.currentTarget)
    try {
      const activity = await createRecorderActivity({ notes: String(data.get('notes') ?? '').trim() || null, operationType: String(data.get('operationType')) as 'packing' | 'unpacking', reference: String(data.get('reference') ?? '').trim() || null, storageProvider: provider })
      setActivityId(activity.id)
      for (const item of items) await uploadItem(item, activity.id)
    } catch (reason) { setMessage(storageFailure(reason, 'Unable to start this record.')); window.dispatchEvent(new Event('storage-providers-changed')) } finally { setBusy(false) }
  }

  async function finish() {
    if (!activityId) return
    setBusy(true)
    setMessage('')
    try {
      await completeRecorderActivity(activityId)
      const formData = formRef.current ? new FormData(formRef.current) : null
      setSubmittedItems(items)
      setSubmittedReference(String(formData?.get('reference') ?? '').trim())
      setActivityId(null)
      setItems([])
      setProvider('')
      explicitProvider.current = false
      setStorageLoading(true)
      formRef.current?.reset()
      setComplete(true)
      setMessage(t('Evidence record completed and secured.'))
      onCompleted?.()
    } catch (reason) { setMessage(storageFailure(reason, 'Unable to complete this record.')) } finally { setBusy(false) }
  }

  const allReady = items.length > 0 && items.every((item) => item.stage === 'ready')
  const selectedBytes = items.reduce((total, item) => total + item.file.size, 0)

  return (
    <Card className="overflow-hidden shadow-lg shadow-slate-900/5" aria-labelledby="recorder-heading">
      <CardHeader className="border-b bg-gradient-to-r from-slate-950 to-slate-900 text-white">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Badge className="border-white/10 bg-white/10 text-white"><FileCheck2 aria-hidden="true" className="size-3" /> {t('New record')}</Badge><Badge className="border-white/10 bg-white/5 text-slate-200" variant="outline"><ShieldCheck aria-hidden="true" className="size-3" /> {provider === 'google_drive' ? 'Google Drive' : provider === 's3' ? t('Application storage') : t('Storage')}</Badge></div>
        <CardTitle className="text-2xl" id="recorder-heading">{t('Document a handoff')}</CardTitle>
        <CardDescription className="max-w-2xl text-slate-300">{t('Add the handoff context, then review every photo and video before starting the secure upload.')}</CardDescription>
        <ol className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300" aria-label="New record steps"><li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">1</span> {t('Activity details')}</li><li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-white/10">2</span> {t('Add evidence')}</li><li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-white/10">3</span> {t('Review & upload')}</li></ol>
      </CardHeader>
      <CardContent className="p-0">
        <form ref={formRef} onSubmit={(event) => void start(event)}>
          <div className="grid lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]">
            <section className="border-b p-5 sm:p-7 lg:border-b-0 lg:border-r" aria-labelledby="activity-details-heading">
              <div className="mb-6 flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><PackageOpen aria-hidden="true" className="size-4" /></span><div><h3 className="font-semibold" id="activity-details-heading">{t('Activity details')}</h3><p className="mt-1 text-sm text-muted-foreground">{t('Describe what this evidence belongs to.')}</p></div></div>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="record-storage">{t('Storage')}</Label>
                  <Select id="record-storage" value={provider} disabled={busy || Boolean(activityId)} onChange={(event) => { explicitProvider.current = true; setProvider(event.target.value as 's3' | 'google_drive') }}>
                    <option value="" disabled>{t('Choose storage')}</option>
                    <option value="google_drive" disabled={!providers?.google_drive.available}>Google Drive</option>
                    <option value="s3" disabled={!providers?.s3.available}>{t('Application storage')}</option>
                  </Select>
                  {activityId ? <p className="text-xs text-muted-foreground">{t('This record keeps its storage location. Retry here after restoring access.')}</p> : <>
                    {storageLoading && <p role="status">{t('Checking storage…')}</p>}
                    {storageError && <p role="alert">{t('Unable to check storage. Retry without losing your selected files.')}</p>}
                    {!storageLoading && !storageError && !storageReady && <p role="alert">{t('Selected storage is unavailable. Connect Google Drive or choose available application storage. Your files are kept here.')}</p>}
                    {providers && !providers.google_drive.available && <p className="text-sm text-muted-foreground">{t(!providers.google_drive.configured ? 'Google Drive is not configured.' : providers.google_drive.state === 'reauthorization_required' ? 'Reconnect Google Drive to restore access.' : providers.google_drive.state === 'unavailable' ? 'Google Drive is temporarily unavailable.' : 'Google Drive is not connected.')}</p>}
                  </>}
                </div>
                <div className="space-y-2"><Label htmlFor="record-operation">{t('Operation')}</Label><Select id="record-operation" name="operationType" disabled={Boolean(activityId)}><option value="packing">{t('Packing')}</option><option value="unpacking">{t('Unpacking')}</option></Select></div>
                <div className="space-y-2"><Label htmlFor="record-reference">{t('Reference')}</Label><Input id="record-reference" name="reference" maxLength={160} disabled={Boolean(activityId)} placeholder={t('Order, shipment or package ID')} /><p className="text-xs text-muted-foreground">{t('Use an identifier your team can search later.')}</p></div>
                <div className="space-y-2"><Label htmlFor="record-notes">{t('Notes')}</Label><Textarea id="record-notes" name="notes" maxLength={2000} disabled={Boolean(activityId)} rows={5} placeholder={t('Seal condition, package state, or handoff context')} /></div>
              </div>
            </section>

            <section className="p-5 sm:p-7" aria-label="Add evidence">
              <div className="mb-5 flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Image aria-hidden="true" className="size-4" /></span><div><h3 className="font-semibold" id="evidence-files-heading">{t('Evidence files')}</h3><p className="mt-1 text-sm text-muted-foreground">{t('Make sure labels, seals and package condition are clearly visible.')}</p></div></div>{items.length > 0 && !activityId && <Button size="sm" type="button" variant="ghost" onClick={() => { setItems([]); if (fileInputRef.current) fileInputRef.current.value = '' }}><Trash2 aria-hidden="true" className="size-3.5" /> {t('Clear all')}</Button>}</div>
              <div className="mb-3 grid grid-cols-3 gap-2" aria-label={t('Add evidence options')}>
                <Button className="min-w-0 px-2 text-xs sm:text-sm" disabled={Boolean(activityId)} type="button" variant="outline" onClick={() => photoInputRef.current?.click()}><Image aria-hidden="true" className="size-4" /> <span className="truncate">{t('Take photo')}</span></Button>
                <Button className="min-w-0 px-2 text-xs sm:text-sm" disabled={Boolean(activityId)} type="button" variant="outline" onClick={() => videoInputRef.current?.click()}><Video aria-hidden="true" className="size-4" /> <span className="truncate">{t('Record video')}</span></Button>
                <Button className="min-w-0 px-2 text-xs sm:text-sm" disabled={Boolean(activityId)} type="button" variant="outline" onClick={() => fileInputRef.current?.click()}><Upload aria-hidden="true" className="size-4" /> <span className="truncate">{t('Choose files')}</span></Button>
              </div>
              <Label className="sr-only" htmlFor="record-files">{t('Evidence files')}</Label>
              <label className={`group flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-7 text-center transition-all ${dragActive ? 'scale-[1.01] border-primary bg-primary/10 shadow-inner' : items.length > 0 ? 'border-primary/50 bg-accent/35' : 'border-input bg-muted/30 hover:border-primary/60 hover:bg-accent/40'}`} htmlFor="record-files" onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }} onDragLeave={(event) => { event.preventDefault(); setDragActive(false) }} onDragOver={(event) => { event.preventDefault(); setDragActive(true) }} onDrop={dropFiles}>
                <span className={`grid size-12 place-items-center rounded-2xl bg-background text-primary shadow-sm transition-transform ${dragActive ? 'scale-110' : ''}`}>{items.length > 0 ? <Check aria-hidden="true" className="size-5" /> : <CloudUpload aria-hidden="true" className="size-5" />}</span>
                {items.length > 0 ? <><span className="mt-3 font-semibold">{items.length} {t(items.length === 1 ? 'file' : 'files')} {t('ready for review')}</span><span className="mt-1 max-w-full truncate text-xs text-muted-foreground">{items.map((item) => item.file.name).join(', ')}</span><span className="mt-2 text-xs font-medium text-primary">{t('Choose again to replace')} · {formatBytes(selectedBytes)} {t('total')}</span></> : <><span className="mt-3 font-semibold">{t('Drop evidence here or choose files')}</span><span className="mt-1 text-sm text-muted-foreground">{t('Photos and videos')} · JPEG, PNG, WebP, HEIC, MP4, MOV, WebM</span></>}
              </label>
              <Input ref={fileInputRef} className="sr-only" id="record-files" type="file" accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm" multiple disabled={Boolean(activityId)} onChange={(event) => { selectFiles(event.target.files); event.target.value = '' }} />
              <Input ref={photoInputRef} className="sr-only" id="record-photo" type="file" accept="image/*" capture="environment" disabled={Boolean(activityId)} onChange={(event) => { selectFiles(event.target.files); event.target.value = '' }} />
              <Input ref={videoInputRef} className="sr-only" id="record-video" type="file" accept="video/*" capture="environment" disabled={Boolean(activityId)} onChange={(event) => { selectFiles(event.target.files); event.target.value = '' }} />
            </section>
          </div>

          {items.length > 0 && <section className="border-t bg-muted/25 p-5 sm:p-7" aria-labelledby="review-evidence-heading">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><h3 className="text-lg font-semibold" id="review-evidence-heading">{t('Review selected evidence')}</h3><Badge variant="success"><CircleCheck aria-hidden="true" className="size-3" /> {items.length} {t('selected')}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{t('Open photos full-size and play videos to confirm the evidence is usable.')}</p></div><div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground"><Info aria-hidden="true" className="size-4 text-primary" /> {t('Check focus, lighting and identifiers')}</div></div>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Evidence upload status" aria-live="polite">
              {items.map((item) => <li className="group overflow-hidden rounded-2xl border bg-card shadow-sm" key={item.key}>
                <div className="relative"><EvidencePreview file={item.file} /><Badge className="absolute left-3 top-3 border-white/20 bg-slate-950/75 text-white backdrop-blur">{mediaType(item.file) === 'image' ? <Image aria-hidden="true" className="size-3" /> : <Video aria-hidden="true" className="size-3" />}{mediaType(item.file)}</Badge>{item.stage === 'selected' && !activityId && <Button aria-label={`Remove ${item.file.name}`} className="absolute right-3 top-3 bg-white/90 shadow-sm" size="icon" type="button" variant="outline" onClick={() => removeFile(item.key)}><Trash2 aria-hidden="true" className="size-4" /></Button>}</div>
                <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm">{item.file.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{formatBytes(item.file.size)} · {item.file.type || t('Unknown type')}</span></div>{item.stage === 'ready' && <Badge variant="success"><Check aria-hidden="true" className="size-3" /> {t('Verified')}</Badge>}</div><p className="mt-3 text-xs font-medium text-muted-foreground">{stageLabel(item.stage, t)}</p>
                  {(item.stage === 'uploading' || item.stage === 'finalizing') && <Progress className="mt-3" aria-label={`${item.file.name} upload progress`} value={item.progress}>{item.progress}%</Progress>}
                  {item.error && <p className="mt-2 text-sm text-red-700" role="alert">{item.error}</p>}
                  {item.stage === 'failed' && activityId && <Button className="mt-3" disabled={busy} size="sm" type="button" variant="outline" onClick={() => void uploadItem(item, activityId, Boolean(item.assetId))}><RotateCcw aria-hidden="true" className="size-3.5" /> {t('Retry')}</Button>}
                </div>
              </li>)}
            </ul>
          </section>}

          <div className="flex flex-col gap-4 border-t bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7"><div><p className="text-sm font-semibold">{items.length ? `${items.length} ${t(items.length === 1 ? 'file' : 'files')} · ${formatBytes(selectedBytes)}` : t('No evidence selected yet')}</p><p className="mt-1 text-xs text-muted-foreground">{t('Files are hashed, uploaded privately, then verified before completion.')}</p></div>{!activityId && <Button className="sm:min-w-48" disabled={busy || !items.length || !storageReady} size="lg" type="submit">{busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Upload aria-hidden="true" className="size-4" />}{busy ? t('Starting…') : t('Review complete · Upload')}</Button>}{activityId && !complete && <Button className="sm:min-w-48" disabled={busy || !allReady} size="lg" type="button" onClick={() => void finish()}><Check aria-hidden="true" className="size-4" /> {t('Complete record')}</Button>}</div>
        </form>
        {complete && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation"><div className="w-full max-w-2xl rounded-3xl border bg-card p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="submitted-evidence-heading"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Check aria-hidden="true" className="size-6" /></span><div><h3 className="text-xl font-semibold" id="submitted-evidence-heading">{t('Submitted evidence')}</h3><p className="mt-1 text-sm text-muted-foreground">{submittedReference || t('Record completed')} · {t('Evidence verified and secured')}</p></div></div><ul className="mt-5 grid max-h-[55vh] gap-4 overflow-y-auto sm:grid-cols-2" aria-label={t('Submitted evidence preview')}>{submittedItems.map((item) => <li className="overflow-hidden rounded-2xl border bg-card" key={item.key}><EvidencePreview file={item.file} /><div className="flex items-center justify-between gap-2 p-3"><span className="truncate text-sm font-medium">{item.file.name}</span><Badge variant="success"><Check aria-hidden="true" className="size-3" /> {t('Verified')}</Badge></div></li>)}</ul><Button className="mt-6 w-full sm:w-auto" type="button" onClick={() => { setActivityId(null); setItems([]); setSubmittedItems([]); setSubmittedReference(''); setComplete(false); setMessage(''); explicitProvider.current = false; setProvider(''); setStorageLoading(true); formRef.current?.reset(); window.dispatchEvent(new Event('storage-providers-changed')) }}>{t('Start another record')}</Button></div></div>}
        {message && <p className={`m-5 rounded-lg border p-3 text-sm sm:m-7 ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`} role={complete ? 'status' : 'alert'}>{message}</p>}
      </CardContent>
    </Card>
  )
}
