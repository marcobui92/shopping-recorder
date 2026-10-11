import { useEffect, useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { AccountAccess } from '../components/AccountAccess'
import { GoogleDriveConnection } from '../components/GoogleDriveConnection'
import { SessionLoadingSkeleton } from '../components/SessionLoadingSkeleton'
import { getSettings, updateSettings, type AppUser } from '../api'
import type { SessionStatus } from '../sessionUserStore'
import { useI18n } from '../i18n'
import { applyTone, currentTone, TONES, type ToneId } from '../tone'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

function TonePicker() {
  const { t } = useI18n()
  const [tone, setTone] = useState<ToneId>(() => currentTone())
  function choose(id: ToneId) { setTone(id); applyTone(id) }
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{t('Pick the palette tone for the whole workspace. Text stays easy to read in every tone.')}</p>
    <div role="radiogroup" aria-label={t('Color tone')} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {TONES.map((option) => <label key={option.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border p-2 text-sm has-[:checked]:border-seal has-[:checked]:bg-seal-tint has-[:checked]:text-seal has-[:checked]:font-medium">
        <input type="radio" name="color-tone" value={option.id} checked={tone === option.id} onChange={() => choose(option.id)} className="sr-only" />
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full border border-input" style={{ background: option.paper }}>
          <span className="size-2.5 rounded-full" style={{ background: option.swatch }} />
        </span>
        <span className="truncate text-xs">{t(option.nameKey)}</span>
      </label>)}
    </div>
  </div>
}

export function SettingsPage({ sessionStatus, user, onUserChange }: { sessionStatus: SessionStatus; user: AppUser | null; onUserChange: (user: AppUser | null) => void }) {
  const { t } = useI18n()
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  function loadSettings() {
    setLoading(true); setLoadFailed(false)
    void getSettings().then((settings) => setDays(String(settings.retentionDays))).catch(() => setLoadFailed(true)).finally(() => setLoading(false))
  }
  useEffect(() => { if (!user) return; loadSettings() }, [user])
  if (!user) return sessionStatus === 'checking' ? <SessionLoadingSkeleton /> : <div className="relative mx-auto flex min-h-[calc(100dvh-9rem)] max-w-7xl items-center justify-center px-4 py-5 sm:px-6 lg:px-8"><AccountAccess onUserChange={onUserChange} user={user} /></div>
  // A load failure while the session is still being restored is expected behind a cold backend wake.
  const pendingLoad = loading || (loadFailed && sessionStatus === 'checking')
  async function save() {
    const value = Number(days)
    if (!Number.isInteger(value) || value < 1 || value > 3650) { setError(t('Enter a number of days between 1 and 3650.')); return }
    setSaving(true); setError(''); setMessage('')
    try { const settings = await updateSettings(value); setDays(String(settings.retentionDays)); setMessage(t('Settings saved.')) } catch { setError(t('Unable to save settings.')) } finally { setSaving(false) }
  }
  return <div className="relative mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-10 lg:px-8"><Card><CardHeader className="border-b bg-muted/30"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-md border border-input bg-background text-muted-foreground"><Settings2 aria-hidden="true" className="size-5" /></span><div><CardTitle>{t('Settings')}</CardTitle><CardDescription>{t('Manage your account, storage, and evidence preferences.')}</CardDescription></div></div></CardHeader><CardContent className="space-y-6 p-5 sm:p-7">{pendingLoad ? <p role="status">{t('Loading settings…')}</p> : <div className="max-w-md space-y-2"><Label htmlFor="retention-days">{t('Auto-delete evidence after (days)')}</Label><Input id="retention-days" type="number" min={1} max={3650} step={1} value={days} onChange={(event) => setDays(event.target.value)} className="font-mono tabular-nums" /><p className="text-xs text-muted-foreground">{t('Completed records keep their metadata, but stored files are deleted this many days after each record was completed. Saving also updates the deadline of records still in your archive. Choose 1 to 3650 days.')}</p></div>}{loadFailed && !pendingLoad && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-seal-crimson/30 bg-seal-crimson-tint p-3 text-sm text-seal-crimson">{t('Unable to load settings.')}<Button type="button" size="sm" variant="outline" onClick={loadSettings}>{t('Retry')}</Button></div>}{error && <p role="alert" className="rounded-lg border border-seal-crimson/30 bg-seal-crimson-tint p-3 text-sm text-seal-crimson">{error}</p>}{message && <p role="status" className="rounded-lg border border-seal/30 bg-seal-tint p-3 text-sm text-seal">{message}</p>}<div className="flex items-center gap-3"><Button disabled={loading || saving} onClick={() => void save()}><Save aria-hidden="true" className="size-4" /> {t('Save settings')}</Button><Badge variant="outline">{days} {t('days')}</Badge></div></CardContent></Card><Card><CardHeader><CardTitle>{t('Color tone')}</CardTitle></CardHeader><CardContent><TonePicker /></CardContent></Card><Card><CardHeader><CardTitle>{t('Google Drive')}</CardTitle><CardDescription>{t('Manage your Google Drive connection for personal evidence storage.')}</CardDescription></CardHeader><CardContent><GoogleDriveConnection sessionChecking={sessionStatus === 'checking'} /></CardContent></Card></div>
}
