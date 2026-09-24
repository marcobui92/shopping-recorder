import { type DragEvent, type FormEvent, useEffect, useRef, useState } from 'react'
import { Check, CircleCheck, CloudUpload, Expand, FileCheck2, FileImage, Image, Info, LoaderCircle, PackageOpen, Plus, RotateCcw, ShieldCheck, Trash2, Upload, Video } from 'lucide-react'

import {
  ApiError,
  completeRecorderActivity,
  createMediaAsset,
  createRecorderActivity,
  discardMediaAsset,
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

type SupportedContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'video/mp4' | 'video/quicktime' | 'video/webm'
type SupportedMediaType = 'image' | 'video'

interface MediaDescriptor {
  contentType: SupportedContentType
  mediaType: SupportedMediaType
}

const mediaByContentType: Record<SupportedContentType, SupportedMediaType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
}

const contentTypeAliases: Record<string, SupportedContentType> = {
  'image/jpg': 'image/jpeg',
  'image/heif': 'image/heic',
  'video/x-m4v': 'video/mp4',
}

const contentTypeByExtension: Record<string, SupportedContentType> = {
  heic: 'image/heic',
  heif: 'image/heic',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  png: 'image/png',
  webm: 'video/webm',
  webp: 'image/webp',
}

function describeMedia(file: File): MediaDescriptor | null {
  const reportedType = file.type.toLowerCase().split(';', 1)[0].trim()
  const canonicalType = contentTypeAliases[reportedType] ?? reportedType
  if (canonicalType in mediaByContentType) {
    const contentType = canonicalType as SupportedContentType
    return { contentType, mediaType: mediaByContentType[contentType] }
  }
  if (reportedType && reportedType !== 'application/octet-stream') return null
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  const contentType = extension ? contentTypeByExtension[extension] : undefined
  return contentType ? { contentType, mediaType: mediaByContentType[contentType] } : null
}

interface FileItem {
  assetId?: string
  capability?: UploadCapability
  error?: string
  file: File
  contentType: SupportedContentType
  key: string
  mediaType: SupportedMediaType
  progress: number
  stage: FileStage
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function stageLabel(stage: FileStage, t: (value: string) => string): string {
  return t(({ selected: 'Ready to upload', hashing: 'Calculating checksum', preparing: 'Preparing storage', uploading: 'Uploading', finalizing: 'Verifying file', ready: 'ready', failed: 'Needs attention' })[stage])
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function canReuseCapability(capability: UploadCapability): boolean {
  if (new Date(capability.expiresAt).getTime() <= Date.now()) return false
  if (capability.strategy !== 'server' || typeof window === 'undefined') return true
  try {
    const target = new URL(capability.url, window.location.href)
    const current = new URL(window.location.href)
    if (target.origin === current.origin) return true
    // Local development may intentionally run the API on a separate port. In
    // production, server capabilities must use the web origin so its session
    // cookie survives the Vercel rewrite.
    return current.hostname === 'localhost' || current.hostname === '127.0.0.1'
  } catch { return false }
}

function EvidencePreview({ file, mediaType, eager = false }: { file: File; mediaType: SupportedMediaType; eager?: boolean }) {
  const [failed, setFailed] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(() => eager && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '')

  useEffect(() => {
    setFailed(false)
    if (previewUrl) {
      return () => { if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrl) }
    }
    if (typeof URL.createObjectURL !== 'function') return

    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
    }
  }, [file])

  if (!previewUrl || failed) {
    return <span className="grid aspect-[4/3] w-full max-w-full place-items-center bg-secondary text-muted-foreground"><FileImage aria-hidden="true" className="size-8" /></span>
  }

  if (mediaType === 'video') {
    return <video aria-label={`Preview of ${file.name}`} className="aspect-[4/3] w-full max-w-full bg-slate-950 object-contain" controls muted preload="metadata" src={previewUrl} onError={() => setFailed(true)} />
  }

  return <a aria-label={`Open full preview of ${file.name}`} className="group/preview relative block max-w-full overflow-hidden bg-secondary" href={previewUrl} rel="noreferrer" target="_blank"><img alt={`Preview of ${file.name}`} className="aspect-[4/3] w-full max-w-full object-cover transition-transform duration-300 group-hover/preview:scale-[1.02]" src={previewUrl} onError={() => setFailed(true)} /><span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-lg bg-slate-950/75 text-white opacity-0 backdrop-blur transition-opacity group-hover/preview:opacity-100"><Expand aria-hidden="true" className="size-4" /></span></a>
}

export function RecorderWorkflow({ onCompleted }: { onCompleted?: () => void }) {
  const { t } = useI18n()
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const addToolbarRef = useRef<HTMLDivElement>(null)
  const [activityId, setActivityId] = useState<string | null>(null)
  const [allowAdditionalFiles, setAllowAdditionalFiles] = useState(false)
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
  const [addToolbarVisible, setAddToolbarVisible] = useState(true)
  const [floatingAddOpen, setFloatingAddOpen] = useState(false)

  useEffect(() => {
    const toolbar = addToolbarRef.current
    if (!toolbar || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      setAddToolbarVisible(entry.isIntersecting)
      if (entry.isIntersecting) setFloatingAddOpen(false)
    }, { threshold: 0.1 })
    observer.observe(toolbar)
    return () => observer.disconnect()
  }, [])

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
    if (!files || (activityId && !allowAdditionalFiles)) return
    const selectedFiles = Array.from(files)
    const describedFiles = selectedFiles.map((file) => ({ descriptor: describeMedia(file), file }))
    const unsupported = describedFiles.filter(({ descriptor }) => !descriptor).map(({ file }) => file)
    const validFiles = describedFiles.filter((entry): entry is { descriptor: MediaDescriptor; file: File } => Boolean(entry.descriptor))
    const duplicateFiles = validFiles.filter(({ file }) => items.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified))
    const nextItems = validFiles.map(({ descriptor, file }, index) => ({ ...descriptor, file, key: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`, progress: 0, stage: 'selected' as const }))
    if (unsupported.length && validFiles.length) setMessage(`${t('Unsupported file type:')} ${unsupported.map((file) => file.name).join(', ')}`)
    else if (unsupported.length) setMessage(`${t('Unsupported file type:')} ${unsupported.map((file) => file.name).join(', ')}`)
    else if (duplicateFiles.length) setMessage(`${t('Possible duplicate:')} ${duplicateFiles.map(({ file }) => file.name).join(', ')}`)
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

  function resetDraft() {
    if (activityId || busy) return
    setItems([])
    setMessage('')
    setProvider('')
    explicitProvider.current = false
    setStorageLoading(true)
    formRef.current?.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
    window.dispatchEvent(new Event('storage-providers-changed'))
  }

  async function discardFailedFile(item: FileItem) {
    if (!activityId || !item.assetId) return
    setBusy(true)
    try {
      await discardMediaAsset(item.assetId)
      removeFile(item.key)
      setAllowAdditionalFiles(true)
      setMessage('')
    } catch (reason) {
      update(item.key, { error: storageFailure(reason, 'Unable to remove failed evidence.') })
    } finally { setBusy(false) }
  }

  async function uploadItem(item: FileItem, currentActivityId: string, retry = false) {
    try {
      let assetId = item.assetId
      let upload: UploadCapability
      if (retry && assetId && item.capability && canReuseCapability(item.capability)) {
        upload = item.capability
        update(item.key, { error: undefined, progress: 0, stage: 'preparing' })
      } else if (retry && assetId) {
        update(item.key, { error: undefined, progress: 0, stage: 'preparing' })
        upload = (await retryMediaAsset(assetId)).upload
      } else {
        update(item.key, { error: undefined, progress: 0, stage: 'hashing' })
        const hash = await sha256(item.file)
        update(item.key, { stage: 'preparing' })
        const prepared = await createMediaAsset(currentActivityId, { contentType: item.contentType, mediaType: item.mediaType, originalFilename: item.file.name, sha256: hash, sizeBytes: item.file.size })
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
      setAllowAdditionalFiles(false)
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
      <CardHeader className="border-b bg-gradient-to-r from-slate-950 to-slate-900 p-4 text-white sm:p-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:gap-3"><Badge className="border-white/10 bg-white/10 text-white"><FileCheck2 aria-hidden="true" className="size-3" /> {t('New record')}</Badge><Badge className="border-white/10 bg-white/5 text-slate-200" variant="outline"><ShieldCheck aria-hidden="true" className="size-3" /> {provider === 'google_drive' ? 'Google Drive' : provider === 's3' ? t('Application storage') : t('Storage')}</Badge></div>
        <CardTitle className="flex items-center justify-center gap-2 text-center text-2xl" id="recorder-heading"><FileCheck2 aria-hidden="true" className="size-5 text-primary" /> {t('Document a handoff')}</CardTitle>
        <CardDescription className="hidden max-w-2xl text-slate-300 sm:block">{t('Add the handoff context, then review every photo and video before starting the secure upload.')}</CardDescription>
        <ol className="mt-5 hidden flex-wrap gap-3 text-xs text-slate-300 sm:flex" aria-label="New record steps"><li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">1</span> {t('Activity details')}</li><li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-white/10">2</span> {t('Add evidence')}</li><li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-white/10">3</span> {t('Review & upload')}</li></ol>
      </CardHeader>
      <CardContent className="p-0">
        <form ref={formRef} onSubmit={(event) => void start(event)}>
          <div className="grid lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]">
            <section className="order-2 border-b p-4 sm:p-7 lg:order-1 lg:border-b-0 lg:border-r" aria-labelledby="activity-details-heading">
              <div className="mb-4 flex items-center gap-3 sm:mb-6"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><PackageOpen aria-hidden="true" className="size-4" /></span><div><h3 className="font-semibold" id="activity-details-heading">{t('Activity details')}</h3><p className="mt-1 hidden text-sm text-muted-foreground sm:block">{t('Describe what this evidence belongs to.')}</p></div></div>
              <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-1">
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
                <div className="col-span-2 space-y-2 lg:col-span-1"><Label htmlFor="record-reference">{t('Reference')}</Label><Input id="record-reference" name="reference" maxLength={160} disabled={Boolean(activityId)} placeholder={t('Order, shipment or package ID')} /><p className="hidden text-xs text-muted-foreground sm:block">{t('Use an identifier your team can search later.')}</p></div>
                <div className="col-span-2 space-y-2 lg:col-span-1"><Label htmlFor="record-notes">{t('Notes')}</Label><Textarea className="h-20 min-h-20 sm:h-auto sm:min-h-24" id="record-notes" name="notes" maxLength={2000} disabled={Boolean(activityId)} rows={5} placeholder={t('Seal condition, package state, or handoff context')} /></div>
              </div>
            </section>

            <section className="order-1 p-4 sm:p-7 lg:order-2" aria-label="Add evidence">
              <div className="mb-3 flex items-center justify-between gap-4 sm:mb-5"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Image aria-hidden="true" className="size-4" /></span><div><h3 className="font-semibold" id="evidence-files-heading">{t('Evidence files')}</h3><p className="mt-1 hidden text-sm text-muted-foreground sm:block">{t('Make sure labels, seals and package condition are clearly visible.')}</p></div></div>{items.length > 0 && (!activityId || allowAdditionalFiles) && <Button size="sm" type="button" variant="ghost" onClick={() => { setItems([]); if (fileInputRef.current) fileInputRef.current.value = '' }}><Trash2 aria-hidden="true" className="size-3.5" /> {t('Clear all')}</Button>}</div>
              <div ref={addToolbarRef} className="mb-3 grid grid-cols-3 gap-2 sm:mb-5" aria-label={t('Add evidence options')}>
                <Button aria-label={t('Take photo')} className="min-w-0 px-1.5" disabled={Boolean(activityId) && !allowAdditionalFiles} title={t('Take photo')} type="button" variant="outline" onClick={() => photoInputRef.current?.click()}><Image aria-hidden="true" className="size-3.5" /><span className="sr-only">{t('Take photo')}</span></Button>
                <Button aria-label={t('Record video')} className="min-w-0 px-1.5" disabled={Boolean(activityId) && !allowAdditionalFiles} title={t('Record video')} type="button" variant="outline" onClick={() => videoInputRef.current?.click()}><Video aria-hidden="true" className="size-3.5" /><span className="sr-only">{t('Record video')}</span></Button>
                <Button aria-label={t('Choose files')} className="min-w-0 px-1.5" disabled={Boolean(activityId) && !allowAdditionalFiles} title={t('Choose files')} type="button" variant="outline" onClick={() => fileInputRef.current?.click()}><Upload aria-hidden="true" className="size-3.5" /><span className="sr-only">{t('Choose files')}</span></Button>
              </div>
              {!addToolbarVisible && <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 sm:hidden"><div className={`${floatingAddOpen ? 'grid' : 'hidden'} grid-cols-3 gap-2 rounded-2xl border bg-card/95 p-2 shadow-xl backdrop-blur`} aria-label={t('Add evidence options')}><Button aria-label={t('Take photo')} className="min-w-0 px-2" disabled={Boolean(activityId) && !allowAdditionalFiles} title={t('Take photo')} type="button" variant="outline" onClick={() => photoInputRef.current?.click()}><Image aria-hidden="true" className="size-3.5" /></Button><Button aria-label={t('Record video')} className="min-w-0 px-2" disabled={Boolean(activityId) && !allowAdditionalFiles} title={t('Record video')} type="button" variant="outline" onClick={() => videoInputRef.current?.click()}><Video aria-hidden="true" className="size-3.5" /></Button><Button aria-label={t('Choose files')} className="min-w-0 px-2" disabled={Boolean(activityId) && !allowAdditionalFiles} title={t('Choose files')} type="button" variant="outline" onClick={() => fileInputRef.current?.click()}><Upload aria-hidden="true" className="size-3.5" /></Button></div><Button aria-label={t('Add evidence options')} className="size-11 rounded-full p-0 shadow-lg" type="button" onClick={() => setFloatingAddOpen((open) => !open)}><Plus aria-hidden="true" className={`size-5 transition-transform ${floatingAddOpen ? 'rotate-45' : ''}`} /></Button></div>}
              <Label className="sr-only" htmlFor="record-files">{t('Evidence files')}</Label>
              <label className={`group flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-4 text-center transition-all sm:min-h-44 sm:px-5 sm:py-7 ${dragActive ? 'scale-[1.01] border-primary bg-primary/10 shadow-inner' : items.length > 0 ? 'border-primary/50 bg-accent/35' : 'border-input bg-muted/30 hover:border-primary/60 hover:bg-accent/40'}`} htmlFor="record-files" onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }} onDragLeave={(event) => { event.preventDefault(); setDragActive(false) }} onDragOver={(event) => { event.preventDefault(); setDragActive(true) }} onDrop={dropFiles}>
                <span className={`grid size-12 place-items-center rounded-2xl bg-background text-primary shadow-sm transition-transform ${dragActive ? 'scale-110' : ''}`}>{items.length > 0 ? <Check aria-hidden="true" className="size-5" /> : <CloudUpload aria-hidden="true" className="size-5" />}</span>
                {items.length > 0 ? <><span className="mt-3 font-semibold">{items.length} {t(items.length === 1 ? 'file' : 'files')} {t('ready for review')}</span><span className="mt-1 max-w-full truncate text-xs text-muted-foreground">{items.map((item) => item.file.name).join(', ')}</span><span className="mt-2 text-xs font-medium text-primary">{t('Choose again to replace')} · {formatBytes(selectedBytes)} {t('total')}</span></> : <><span className="mt-3 font-semibold">{t('Drop evidence here or choose files')}</span><span className="mt-1 text-sm text-muted-foreground">{t('Photos and videos')} · JPEG, PNG, WebP, HEIC, MP4, MOV, WebM</span></>}
              </label>
              <Input ref={fileInputRef} className="sr-only" id="record-files" type="file" accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm" multiple disabled={Boolean(activityId) && !allowAdditionalFiles} onChange={(event) => { selectFiles(event.target.files); event.target.value = '' }} />
              <Input ref={photoInputRef} className="sr-only" id="record-photo" type="file" accept="image/*" capture="environment" disabled={Boolean(activityId) && !allowAdditionalFiles} onChange={(event) => { selectFiles(event.target.files); event.target.value = '' }} />
              <Input ref={videoInputRef} className="sr-only" id="record-video" type="file" accept="video/*" capture="environment" disabled={Boolean(activityId) && !allowAdditionalFiles} onChange={(event) => { selectFiles(event.target.files); event.target.value = '' }} />
            </section>
          </div>

          {items.length > 0 && <section className="border-t bg-muted/25 p-4 sm:p-7" aria-labelledby="review-evidence-heading">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><h3 className="text-lg font-semibold" id="review-evidence-heading">{t('Review selected evidence')}</h3><Badge variant="success"><CircleCheck aria-hidden="true" className="size-3" /> {items.length} {t('selected')}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{t('Open photos full-size and play videos to confirm the evidence is usable.')}</p></div><div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground"><Info aria-hidden="true" className="size-4 text-primary" /> {t('Check focus, lighting and identifiers')}</div></div>
            <ul className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Evidence upload status" aria-live="polite">
              {items.map((item) => <li className="group min-w-0 max-w-full overflow-hidden rounded-2xl border bg-card shadow-sm" key={item.key}>
                <div className="relative"><EvidencePreview file={item.file} mediaType={item.mediaType} /><Badge className="absolute left-3 top-3 border-white/20 bg-slate-950/75 text-white backdrop-blur">{item.mediaType === 'image' ? <Image aria-hidden="true" className="size-3" /> : <Video aria-hidden="true" className="size-3" />}{item.mediaType}</Badge>{item.stage === 'selected' && !activityId && <Button aria-label={`Remove ${item.file.name}`} className="absolute right-3 top-3 bg-white/90 shadow-sm" size="icon" type="button" variant="outline" onClick={() => removeFile(item.key)}><Trash2 aria-hidden="true" className="size-4" /></Button>}</div>
                <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm">{item.file.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{formatBytes(item.file.size)} · {item.contentType}</span></div>{item.stage === 'ready' && <Badge variant="success"><Check aria-hidden="true" className="size-3" /> {t('Verified')}</Badge>}</div><p className="mt-3 text-xs font-medium text-muted-foreground">{stageLabel(item.stage, t)}</p>
                  {(item.stage === 'uploading' || item.stage === 'finalizing') && <Progress className="mt-3" aria-label={`${item.file.name} upload progress`} value={item.progress}>{item.progress}%</Progress>}
                  {item.error && <p className="mt-2 text-sm text-red-700" role="alert">{item.error}</p>}
                  {item.stage === 'failed' && activityId && <div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy} size="sm" type="button" variant="outline" onClick={() => void uploadItem(item, activityId, Boolean(item.assetId))}><RotateCcw aria-hidden="true" className="size-3.5" /> {t('Retry')}</Button><Button aria-label={`Remove ${item.file.name}`} disabled={busy} size="sm" type="button" variant="ghost" onClick={() => void discardFailedFile(item)}><Trash2 aria-hidden="true" className="size-3.5" /> {t('Remove')}</Button></div>}
                </div>
              </li>)}
            </ul>
          </section>}

          <div className="flex flex-col gap-3 border-t bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-7"><div><p className="text-sm font-semibold">{items.length ? `${items.length} ${t(items.length === 1 ? 'file' : 'files')} · ${formatBytes(selectedBytes)}` : t('No evidence selected yet')}</p><p className="mt-1 hidden text-xs text-muted-foreground sm:block">{t('Files are hashed, uploaded privately, then verified before completion.')}</p></div>{!activityId && <div className="flex w-full gap-2 sm:w-auto"><Button aria-label={t('Reset form')} className="flex-1 sm:flex-none" disabled={busy} size="lg" type="button" variant="outline" onClick={resetDraft}><RotateCcw aria-hidden="true" className="size-4" /> <span className="hidden sm:inline">{t('Reset form')}</span></Button><Button className="flex-1 sm:min-w-48 sm:flex-none" disabled={busy || !items.length || !storageReady} size="lg" type="submit">{busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Upload aria-hidden="true" className="size-4" />}{busy ? t('Starting…') : t('Review complete · Upload')}</Button></div>}{activityId && !complete && <Button className="sm:min-w-48" disabled={busy || !allReady} size="lg" type="button" onClick={() => void finish()}><Check aria-hidden="true" className="size-4" /> {t('Complete record')}</Button>}</div>
        </form>
        {complete && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation"><div className="w-full max-w-2xl rounded-3xl border bg-card p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="submitted-evidence-heading"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Check aria-hidden="true" className="size-6" /></span><div><h3 className="text-xl font-semibold" id="submitted-evidence-heading">{t('Submitted evidence')}</h3><p className="mt-1 text-sm text-muted-foreground">{submittedReference || t('Record completed')} · {t('Evidence verified and secured')}</p></div></div><ul className="mt-5 grid max-h-[55vh] gap-4 overflow-y-auto sm:grid-cols-2" aria-label={t('Submitted evidence preview')}>{submittedItems.map((item) => <li className="overflow-hidden rounded-2xl border bg-card" key={item.key}><EvidencePreview eager file={item.file} mediaType={item.mediaType} /><div className="flex items-center justify-between gap-2 p-3"><span className="truncate text-sm font-medium">{item.file.name}</span><Badge variant="success"><Check aria-hidden="true" className="size-3" /> {t('Verified')}</Badge></div></li>)}</ul><Button className="mt-6 w-full sm:w-auto" type="button" onClick={() => { setActivityId(null); setAllowAdditionalFiles(false); setItems([]); setSubmittedItems([]); setSubmittedReference(''); setComplete(false); setMessage(''); explicitProvider.current = false; setProvider(''); setStorageLoading(true); formRef.current?.reset(); window.dispatchEvent(new Event('storage-providers-changed')) }}>{t('Start another record')}</Button></div></div>}
        {message && <p className={`m-5 rounded-lg border p-3 text-sm sm:m-7 ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`} role={complete ? 'status' : 'alert'}>{message}</p>}
      </CardContent>
    </Card>
  )
}
