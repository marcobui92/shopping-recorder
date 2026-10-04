import { useEffect, useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { AccountAccess } from '../components/AccountAccess'
import { GoogleDriveConnection } from '../components/GoogleDriveConnection'
import { SessionLoadingSkeleton } from '../components/SessionLoadingSkeleton'
import { getSettings, updateSettings, type AppUser } from '../api'
import type { SessionStatus } from '../sessionUserStore'
import { useI18n } from '../i18n'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

export function SettingsPage({ sessionStatus, user, onUserChange }: { sessionStatus: SessionStatus; user: AppUser | null; onUserChange: (user: AppUser | null) => void }) {
  const { t } = useI18n()
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => { if (!user) return; void getSettings().then((settings) => setDays(String(settings.retentionDays))).catch(() => setLoadFailed(true)).finally(() => setLoading(false)) }, [user])
  if (!user) return sessionStatus === 'checking' ? <SessionLoadingSkeleton /> : <div className="relative mx-auto flex min-h-[calc(100dvh-9rem)] max-w-7xl items-center justify-center px-4 py-5 sm:px-6 lg:px-8"><AccountAccess onUserChange={onUserChange} user={user} /></div>
  // A load failure while the session is still being restored is expected behind a cold backend wake.
  const pendingLoad = loading || (loadFailed && sessionStatus === 'checking')
  async function save() {
    const value = Number(days)
    if (!Number.isInteger(value) || value < 1 || value > 3650) { setError(t('Enter a number of days between 1 and 3650.')); return }
    setSaving(true); setError(''); setMessage('')
    try { const settings = await updateSettings(value); setDays(String(settings.retentionDays)); setMessage(t('Settings saved.')) } catch { setError(t('Unable to save settings.')) } finally { setSaving(false) }
  }
  return <div className="relative mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-10 lg:px-8"><Card><CardHeader className="border-b bg-muted/30"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Settings2 className="size-5" /></span><div><CardTitle>{t('Settings')}</CardTitle><CardDescription>{t('Manage your account, storage, and evidence preferences.')}</CardDescription></div></div></CardHeader><CardContent className="space-y-6 p-5 sm:p-7">{pendingLoad ? <p role="status">{t('Loading settings…')}</p> : <div className="max-w-md space-y-2"><Label htmlFor="retention-days">{t('Auto-delete evidence after (days)')}</Label><Input id="retention-days" type="number" min={1} max={3650} step={1} value={days} onChange={(event) => setDays(event.target.value)} /><p className="text-xs text-muted-foreground">{t('Completed records keep their metadata, but stored files are deleted this many days after each record was completed. Saving also updates the deadline of records still in your archive. Choose 1 to 3650 days.')}</p></div>}{loadFailed && !pendingLoad && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t('Unable to load settings.')}</p>}{error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<div className="flex items-center gap-3"><Button disabled={loading || saving} onClick={() => void save()}><Save className="size-4" /> {t('Save settings')}</Button><Badge variant="outline">{days} {t('days')}</Badge></div></CardContent></Card><Card><CardHeader><CardTitle>{t('Google Drive')}</CardTitle><CardDescription>{t('Manage your Google Drive connection for personal evidence storage.')}</CardDescription></CardHeader><CardContent><GoogleDriveConnection sessionChecking={sessionStatus === 'checking'} /></CardContent></Card></div>
}
