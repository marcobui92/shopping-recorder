import { useEffect, useState } from 'react'
import { connectGoogleDrive, getGoogleDriveStatus, unlinkGoogleDrive, type GoogleDriveStatus } from '../api'
import { useI18n } from '../i18n'
import { Button } from './ui/button'

export function GoogleDriveConnection({ onStatusChange }: { onStatusChange?: (status: GoogleDriveStatus) => void } = {}) {
  const { t } = useI18n()
  const [status, setStatus] = useState<GoogleDriveStatus | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'connect' | 'unlink' | null>(null)
  const result = new URLSearchParams(window.location.search).get('googleDrive')
  async function refresh() {
    setError(false)
    try { const next = await getGoogleDriveStatus(); setStatus(next); onStatusChange?.(next) } catch { setError(true) }
  }
  useEffect(() => { void refresh() }, [])
  async function act() {
    setBusy(true)
    setError(false)
    try {
      if (confirm === 'unlink') { await unlinkGoogleDrive(); await refresh(); window.dispatchEvent(new Event('storage-providers-changed')); setConfirm(null) }
      else { window.location.assign(await connectGoogleDrive()) }
    } catch { setError(true) }
    finally { setBusy(false) }
  }
  return <section className="mt-4 space-y-3 border-t pt-3" aria-label="Google Drive">
    <p className="font-medium">Google Drive</p>
    {result && <p role="status" className="text-sm">{t(result === 'connected' ? 'Google Drive connected.' : result === 'cancelled' ? 'Google connection cancelled.' : 'Google connection failed. Please retry.')}</p>}
    {!status && !error && <p role="status">{t('Checking Google Drive…')}</p>}
    {status && <p className="text-sm text-muted-foreground">{t(!status.configured ? 'Google Drive is not configured.' : status.state === 'reauthorization_required' ? 'Reconnect Google Drive to restore access.' : status.state === 'unavailable' ? 'Google Drive is temporarily unavailable.' : status.connected ? 'Google Drive connected.' : 'Google Drive is not connected.')}</p>}
    {error && <div role="alert"><p>{t('Unable to update Google Drive. Please retry.')}</p><Button type="button" variant="outline" onClick={() => void refresh()}>{t('Retry')}</Button></div>}
    {status?.configured && !confirm && <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm('connect')}>{t(status.connected ? 'Reconnect or replace Google' : 'Connect Google Drive')}</Button>
      {status.connected && <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm('unlink')}>{t('Unlink Google Drive')}</Button>}
    </div>}
    {confirm && <div className="space-y-2">
      <p className="text-sm">{t(confirm === 'unlink' ? 'Drive files will be kept. Reconnect the original account to access old evidence.' : 'Opening Google leaves this page. Finish your upload first; unsaved fields and selected files may be lost. Replacing the account does not move old evidence.')}</p>
      <div className="flex gap-2"><Button type="button" disabled={busy} onClick={() => void act()}>{t('Continue')}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>{t('Cancel')}</Button></div>
    </div>}
  </section>
}
