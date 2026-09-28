import { useEffect, useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { AccountAccess } from '../components/AccountAccess'
import { SessionLoadingSkeleton } from '../components/SessionLoadingSkeleton'
import { getSettings, updateSettings, type AppUser } from '../api'
import { useI18n } from '../i18n'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

export function SettingsPage({ sessionReady, user, onUserChange }: { sessionReady: boolean; user: AppUser | null; onUserChange: (user: AppUser | null) => void }) {
  const { t } = useI18n()
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (!user) return; void getSettings().then((settings) => setDays(String(settings.retentionDays))).catch(() => setError(t('Unable to load settings.'))).finally(() => setLoading(false)) }, [user, t])
  if (!sessionReady) return <SessionLoadingSkeleton />
  if (!user) return <div className="relative mx-auto flex min-h-[calc(100dvh-9rem)] max-w-7xl items-center justify-center px-4 py-5 sm:px-6 lg:px-8"><AccountAccess onUserChange={onUserChange} user={user} /></div>
  async function save() {
    const value = Number(days)
    if (!Number.isInteger(value) || value < 1 || value > 3650) { setError(t('Enter a number of days between 1 and 3650.')); return }
    setSaving(true); setError(''); setMessage('')
    try { const settings = await updateSettings(value); setDays(String(settings.retentionDays)); setMessage(t('Settings saved.')) } catch { setError(t('Unable to save settings.')) } finally { setSaving(false) }
  }
  return <div className="relative mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8"><Card><CardHeader className="border-b bg-muted/30"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Settings2 className="size-5" /></span><div><CardTitle>{t('Settings')}</CardTitle><CardDescription>{t('Control how long verified evidence is kept before automatic deletion.')}</CardDescription></div></div></CardHeader><CardContent className="space-y-6 p-5 sm:p-7">{loading ? <p role="status">{t('Loading settings…')}</p> : <div className="max-w-md space-y-2"><Label htmlFor="retention-days">{t('Auto-delete evidence after (days)')}</Label><Input id="retention-days" type="number" min={1} max={3650} step={1} value={days} onChange={(event) => setDays(event.target.value)} /><p className="text-xs text-muted-foreground">{t('Completed records keep their metadata, but stored files are deleted after this period. Choose 1 to 3650 days.')}</p></div>}{error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<div className="flex items-center gap-3"><Button disabled={loading || saving} onClick={() => void save()}><Save className="size-4" /> {t('Save settings')}</Button><Badge variant="outline">{days} {t('days')}</Badge></div></CardContent></Card></div>
}
