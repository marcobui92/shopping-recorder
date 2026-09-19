import { useCallback, useEffect, useState } from 'react'
import { CircleAlert, Cloud, LoaderCircle, RefreshCw, Wifi } from 'lucide-react'

import { ApiError, getHealth } from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { useI18n } from '../i18n'

type Status =
  | { kind: 'loading' }
  | { kind: 'online'; value: string }
  | { kind: 'error'; message: string }

export function HealthStatus() {
  const { t } = useI18n()
  const [status, setStatus] = useState<Status>({ kind: 'loading' })

  const checkHealth = useCallback(async () => {
    setStatus({ kind: 'loading' })
    try {
      const response = await getHealth()
      setStatus({ kind: 'online', value: response.status })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to check API availability.'
      setStatus({ kind: 'error', message })
    }
  }, [])

  useEffect(() => { void checkHealth() }, [checkHealth])

  if (status.kind === 'loading') {
    return <div className="flex items-center gap-2 rounded-xl border bg-card/80 px-4 py-3 text-sm text-muted-foreground shadow-sm" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" /> {t('Checking API connection…')}</div>
  }

  if (status.kind === 'error') {
    return (
      <Card className="max-w-sm border-destructive/25 bg-red-50/80" role="alert">
        <CardContent className="flex items-start gap-3 p-4">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="min-w-0"><p className="text-sm font-semibold text-red-900">{t('API unavailable')}</p><p className="mt-1 text-sm text-red-700">{status.message}</p><Button className="mt-3" size="sm" type="button" variant="outline" onClick={() => void checkHealth()}><RefreshCw aria-hidden="true" className="size-3.5" /> {t('Try again')}</Button></div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm overflow-hidden bg-card/90 shadow-lg shadow-primary/5" role="status">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Cloud aria-hidden="true" className="size-5" /></span><div><p className="text-sm font-semibold">{t('Recorder service')}</p><p className="text-xs text-muted-foreground">{t('Ready for evidence')}</p></div></div>
          <Badge variant="success"><Wifi aria-hidden="true" className="size-3" /> {t('API is')} {status.value}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-center"><div><strong className="block text-sm">Private</strong><span className="text-[11px] text-muted-foreground">Storage</span></div><div><strong className="block text-sm">SHA-256</strong><span className="text-[11px] text-muted-foreground">Verified</span></div><div><strong className="block text-sm">Live</strong><span className="text-[11px] text-muted-foreground">API</span></div></div>
      </CardContent>
    </Card>
  )
}
