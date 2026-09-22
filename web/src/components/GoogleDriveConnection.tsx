import { Cloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { connectGoogleDrive, getGoogleDriveStatus, unlinkGoogleDrive, type GoogleDriveStatus } from '../api'
import { useI18n } from '../i18n'
import { Button } from './ui/button'

export function GoogleDriveConnection({ onStatusChange, onUnlinked, showIntro = false, hideWhenConnected = false }: { onStatusChange?: (status: GoogleDriveStatus) => void; onUnlinked?: () => void; showIntro?: boolean; hideWhenConnected?: boolean } = {}) {
  const { t } = useI18n()
  const [status, setStatus] = useState<GoogleDriveStatus | null>(null)
  const [resolved, setResolved] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'connect' | 'unlink' | null>(null)
  const result = new URLSearchParams(window.location.search).get('googleDrive')
  async function refresh() {
    setError(false)
    try { const next = await getGoogleDriveStatus(); setStatus(next); onStatusChange?.(next) } catch { setError(true) } finally { setResolved(true) }
  }
  useEffect(() => { void refresh() }, [])
  async function act() {
    setBusy(true)
    setError(false)
    try {
      if (confirm === 'unlink') { await unlinkGoogleDrive(); await refresh(); setConfirm(null); onUnlinked?.(); window.dispatchEvent(new Event('storage-providers-changed')) }
      else { window.location.assign(await connectGoogleDrive()) }
    } catch { setError(true) }
    finally { setBusy(false) }
  }
  if (!resolved) return null
  if (status?.connected === true && hideWhenConnected) return null
  return <section className={showIntro ? 'rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5' : 'mt-4 space-y-3 border-t pt-3'} aria-labelledby={showIntro ? 'personal-storage-heading' : undefined}>
    {showIntro && <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Cloud aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold" id="personal-storage-heading">{t('Set up your personal storage')}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t('Connect Google Drive after signing in to keep your evidence in your own personal storage. You can also use application storage without connecting Google.')}</p></div></div>}
    <div className={showIntro ? 'mt-4 space-y-3 border-t pt-3' : 'space-y-3'} aria-label="Google Drive">
    <p className="font-medium">Google Drive</p>
    {result && <p role="status" className="text-sm">{t(result === 'connected' ? 'Google Drive connected.' : result === 'cancelled' ? 'Google connection cancelled.' : 'Google connection failed. Please retry.')}</p>}
    {!status && !error && <p role="status">{t('Checking Google Drive…')}</p>}
    {status && <p className="text-sm text-muted-foreground">{t(!status.configured ? 'Google Drive is not configured.' : status.state === 'reauthorization_required' ? 'Reconnect Google Drive to restore access.' : status.state === 'unavailable' ? 'Google Drive is temporarily unavailable.' : status.connected ? 'Google Drive connected.' : 'Google Drive is not connected.')}</p>}
    {error && <div role="alert"><p>{t('Unable to update Google Drive. Please retry.')}</p><Button type="button" variant="outline" onClick={() => void refresh()}>{t('Retry')}</Button></div>}
    {status?.configured && !confirm && <div className="flex min-w-0 flex-wrap gap-2">
      <Button className="h-auto min-h-10 max-w-full whitespace-normal break-words text-center leading-5" type="button" variant="outline" disabled={busy} onClick={() => setConfirm('connect')}>{t(status.connected ? 'Reconnect or replace Google' : 'Connect Google Drive')}</Button>
      {status.connected && <Button className="h-auto min-h-10 max-w-full whitespace-normal break-words text-center leading-5" type="button" variant="outline" disabled={busy} onClick={() => setConfirm('unlink')}>{t('Unlink Google Drive')}</Button>}
    </div>}
    {confirm && <div className="space-y-2">
      <p className="text-sm">{t(confirm === 'unlink' ? 'Drive files will be kept. Reconnect the original account to access old evidence.' : 'Opening Google leaves this page. Finish your upload first; unsaved fields and selected files may be lost. Replacing the account does not move old evidence.')}</p>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void act()}>{t('Continue')}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>{t('Cancel')}</Button></div>
    </div>}
    </div>
  </section>
}
