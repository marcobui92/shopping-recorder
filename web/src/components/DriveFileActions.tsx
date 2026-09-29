import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { getMediaAssetDriveLink, getMediaAssetDriveOpenUrl } from '../api'
import { useI18n } from '../i18n'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function DriveFileActions({ assetId }: { assetId: string }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const [manualLink, setManualLink] = useState('')

  async function copyLink() {
    setBusy(true); setCopied(false); setError(false); setManualLink('')
    try {
      const url = await getMediaAssetDriveLink(assetId)
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
      } catch { setManualLink(url) }
    } catch { setError(true) }
    finally { setBusy(false) }
  }

  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void copyLink()}><Copy aria-hidden="true" className="size-3.5" />{t(busy ? 'Getting link…' : 'Copy Drive link')}</Button>
      <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:bg-accent" href={getMediaAssetDriveOpenUrl(assetId)} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" className="size-3.5" />{t('Open in Drive')}</a>
    </div>
    <p className="text-xs text-muted-foreground">{t('Drive opens the current file. Google access is required.')}</p>
    {copied && <p role="status" className="text-xs text-emerald-700">{t('Drive link copied.')}</p>}
    {error && <p role="alert" className="text-xs text-red-700">{t('Unable to get the Drive link. Check the connection and try again.')}</p>}
    {manualLink && <label className="block space-y-1 text-xs">{t('Copy this link manually')}<Input readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} /></label>}
  </div>
}
