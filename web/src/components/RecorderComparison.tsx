import { type FormEvent, useEffect, useState } from 'react'
import { Download, FileX2, LoaderCircle, Scale, Search } from 'lucide-react'

import {
  ApiError,
  getMediaAssetContentUrl,
  getRecorderActivity,
  getRecorderComparisonCandidates,
  type RecorderActivity,
  type RecorderActivityDetail,
} from '../api'
import { useI18n } from '../i18n'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'

type Side = 'packing' | 'unpacking'

function displayDate(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function candidateLabel(activity: RecorderActivity, locale: string, t: (value: string) => string): string {
  return `${displayDate(activity.occurredAt, locale)} · ${t(activity.status[0].toUpperCase() + activity.status.slice(1))}`
}

function EvidenceSide({ activity, side }: { activity: RecorderActivityDetail | null; side: Side }) {
  const { locale, t } = useI18n()
  const [mediaErrors, setMediaErrors] = useState<string[]>([])
  useEffect(() => setMediaErrors([]), [activity?.id])
  if (!activity) return <div className="grid min-h-52 place-items-center rounded-xl border border-dashed bg-muted/30 p-5 text-center text-sm text-muted-foreground"><FileX2 aria-hidden="true" className="mb-2 size-7" />{t(side === 'packing' ? 'Select a packing record to compare.' : 'Select an unpacking record to compare.')}</div>
  return <article className="rounded-xl border bg-card p-4" aria-label={t(side === 'packing' ? 'Packing evidence' : 'Unpacking evidence')}>
    <div className="flex flex-wrap items-center justify-between gap-2"><Badge>{t(side === 'packing' ? 'Packing' : 'Unpacking')}</Badge><span className="text-xs text-muted-foreground">{displayDate(activity.occurredAt, locale)}</span></div>
    <p className="mt-3 text-sm font-semibold">{activity.reference}</p>
    <p className="mt-1 text-xs text-muted-foreground">{t('Status')}: {t(activity.status[0].toUpperCase() + activity.status.slice(1))} · {activity.storageProvider === 's3' ? t('Application storage') : 'Google Drive'}</p>
    {activity.notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{activity.notes}</p>}
    {activity.assets.length === 0 ? <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t('This activity has no evidence files yet.')}</p> : <ul className="mt-4 grid gap-3">
      {activity.assets.map((asset) => <li className="overflow-hidden rounded-lg border" key={asset.id}>
        {asset.status === 'ready' ? asset.mediaType === 'image'
          ? <img className="aspect-video w-full bg-muted object-contain" alt={asset.originalFilename} loading="lazy" src={getMediaAssetContentUrl(asset.id)} onError={() => setMediaErrors((current) => current.includes(asset.id) ? current : [...current, asset.id])} />
          : <video className="aspect-video w-full bg-slate-950 object-contain" aria-label={asset.originalFilename} controls preload="metadata" src={getMediaAssetContentUrl(asset.id)} onError={() => setMediaErrors((current) => current.includes(asset.id) ? current : [...current, asset.id])} />
          : <div className="grid aspect-video place-items-center bg-muted text-sm text-muted-foreground">{t('Evidence is not ready for comparison.')}</div>}
        <div className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><strong className="block truncate text-sm">{asset.originalFilename}</strong><span className="text-xs text-muted-foreground">{(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>{mediaErrors.includes(asset.id) && <span className="mt-1 block text-xs text-red-700" role="alert">{t('Unable to load this evidence. Check your session or storage connection.')}</span>}</div>{asset.status === 'ready' && <a className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:bg-accent" href={getMediaAssetContentUrl(asset.id) + (activity.storageProvider === 'google_drive' ? '?download=1' : '')} download={asset.originalFilename}><Download aria-hidden="true" className="size-4" /><span className="sr-only">{t('Download original')}</span></a>}</div>
      </li>)}
    </ul>}
  </article>
}

export function RecorderComparison() {
  const { locale, t } = useI18n()
  const [reference, setReference] = useState('')
  const [packing, setPacking] = useState<RecorderActivity[]>([])
  const [unpacking, setUnpacking] = useState<RecorderActivity[]>([])
  const [packingId, setPackingId] = useState('')
  const [unpackingId, setUnpackingId] = useState('')
  const [packingDetail, setPackingDetail] = useState<RecorderActivityDetail | null>(null)
  const [unpackingDetail, setUnpackingDetail] = useState<RecorderActivityDetail | null>(null)
  const [mobileSide, setMobileSide] = useState<Side>('packing')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [truncated, setTruncated] = useState(false)

  async function loadDetail(side: Side, id: string) {
    if (side === 'packing') { setPackingId(id); setPackingDetail(null) } else { setUnpackingId(id); setUnpackingDetail(null) }
    if (!id) return
    setLoading(true); setError('')
    try {
      const detail = await getRecorderActivity(id)
      if (side === 'packing') setPackingDetail(detail); else setUnpackingDetail(detail)
    } catch (reason) {
      setError(reason instanceof ApiError && reason.code === 'AUTH_REQUIRED' ? t('Sign in again to compare records.') : t('Unable to load comparison evidence.'))
    } finally { setLoading(false) }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = reference.trim()
    if (!query) return
    setLoading(true); setError(''); setSearched(true); setPacking([]); setUnpacking([]); setPackingId(''); setUnpackingId(''); setPackingDetail(null); setUnpackingDetail(null)
    try {
      const result = await getRecorderComparisonCandidates(query)
      setPacking(result.packing); setUnpacking(result.unpacking); setTruncated(result.truncated)
      const nextPacking = result.packing.length === 1 ? result.packing[0].id : ''
      const nextUnpacking = result.unpacking.length === 1 ? result.unpacking[0].id : ''
      setPackingId(nextPacking); setUnpackingId(nextUnpacking)
      const [packingResult, unpackingResult] = await Promise.all([
        nextPacking ? getRecorderActivity(nextPacking) : Promise.resolve(null),
        nextUnpacking ? getRecorderActivity(nextUnpacking) : Promise.resolve(null),
      ])
      setPackingDetail(packingResult); setUnpackingDetail(unpackingResult)
    } catch (reason) {
      setPacking([]); setUnpacking([]); setPackingId(''); setUnpackingId('')
      setError(reason instanceof ApiError && reason.code === 'AUTH_REQUIRED' ? t('Sign in again to compare records.') : t('Unable to find comparison candidates.'))
    } finally { setLoading(false) }
  }

  return <Card className="mb-6 overflow-hidden" aria-labelledby="comparison-heading">
    <CardHeader className="border-b bg-muted/40"><div className="mb-2 flex items-center gap-2 text-primary"><Scale aria-hidden="true" className="size-5" /><Badge variant="outline">{t('Manual comparison')}</Badge></div><CardTitle id="comparison-heading">{t('Compare packing and unpacking')}</CardTitle><CardDescription>{t('Enter one exact reference, then choose each record yourself. References are not unique.')}</CardDescription></CardHeader>
    <CardContent className="p-5 sm:p-6">
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={search} aria-label={t('Find records to compare')}>
        <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="comparison-reference">{t('Reference')}</Label><Input id="comparison-reference" maxLength={160} value={reference} onChange={(event) => setReference(event.target.value)} placeholder={t('Exact order or shipment reference')} /></div>
        <Button disabled={loading || !reference.trim()} type="submit">{loading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Search aria-hidden="true" className="size-4" />}{t('Find comparison records')}</Button>
      </form>
      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {truncated && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">{t('More than 50 records on one side share this reference. Only the newest 50 per side are shown.')}</p>}
      {searched && !error && <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="comparison-packing">{t('Packing record')}</Label>{packing.length ? <Select id="comparison-packing" value={packingId} onChange={(event) => void loadDetail('packing', event.target.value)}><option value="">{t(packing.length > 1 ? 'Choose one packing record' : 'Choose packing record')}</option>{packing.map((activity) => <option value={activity.id} key={activity.id}>{candidateLabel(activity, locale, t)}</option>)}</Select> : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t('No packing record has this exact reference.')}</p>}</div>
        <div className="space-y-2"><Label htmlFor="comparison-unpacking">{t('Unpacking record')}</Label>{unpacking.length ? <Select id="comparison-unpacking" value={unpackingId} onChange={(event) => void loadDetail('unpacking', event.target.value)}><option value="">{t(unpacking.length > 1 ? 'Choose one unpacking record' : 'Choose unpacking record')}</option>{unpacking.map((activity) => <option value={activity.id} key={activity.id}>{candidateLabel(activity, locale, t)}</option>)}</Select> : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t('No unpacking record has this exact reference.')}</p>}</div>
      </div>}
      {searched && !error && <>
        <div className="mt-5 grid grid-cols-2 gap-2 lg:hidden" aria-label={t('Comparison side')}><Button type="button" variant={mobileSide === 'packing' ? 'default' : 'outline'} onClick={() => setMobileSide('packing')}>{t('Packing')}</Button><Button type="button" variant={mobileSide === 'unpacking' ? 'default' : 'outline'} onClick={() => setMobileSide('unpacking')}>{t('Unpacking')}</Button></div>
        {loading && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />{t('Loading comparison…')}</p>}
        <div className="mt-4 grid gap-4 lg:grid-cols-2"><div className={mobileSide === 'packing' ? '' : 'hidden lg:block'}><EvidenceSide activity={packingDetail} side="packing" /></div><div className={mobileSide === 'unpacking' ? '' : 'hidden lg:block'}><EvidenceSide activity={unpackingDetail} side="unpacking" /></div></div>
      </>}
    </CardContent>
  </Card>
}
