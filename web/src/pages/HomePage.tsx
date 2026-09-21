import { useCallback, useEffect, useState } from 'react'
import { Archive, CheckCircle2, FileCheck2, LockKeyhole, Plus } from 'lucide-react'

import type { AppUser, GoogleDriveStatus } from '../api'
import { AccountAccess } from '../components/AccountAccess'
import { HealthStatus } from '../components/HealthStatus'
import { RecorderWorkflow } from '../components/RecorderWorkflow'
import { RecorderHistory } from '../components/RecorderHistory'
import { GoogleDriveConnection } from '../components/GoogleDriveConnection'
import { useI18n } from '../i18n'

export function HomePage() {
  const { t } = useI18n()
  const [user, setUser] = useState<AppUser | null>(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [mobileView, setMobileView] = useState<'new' | 'history'>('new')
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null)
  const handleUserChange = useCallback((current: AppUser | null) => setUser(current), [])
  useEffect(() => {
    const reset = () => setDriveStatus(null)
    window.addEventListener('storage-providers-changed', reset)
    return () => window.removeEventListener('storage-providers-changed', reset)
  }, [])

  return (
    <div className={`relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${user ? 'py-4 sm:py-8' : 'py-12 sm:py-16'}`}>
      {!user && <section aria-labelledby="page-title" className="relative grid items-center gap-10 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary shadow-sm"><FileCheck2 aria-hidden="true" className="size-4" /> {t('Evidence recorder')}</div>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl lg:text-7xl" id="page-title">{t('Proof for every packing handoff.')}</h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">{t('Capture packing and unpacking evidence, verify every file, and keep each operational record accountable.')}</p>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="size-4 text-primary" /> {t('File-level verification')}</span>
            <span className="flex items-center gap-2"><LockKeyhole aria-hidden="true" className="size-4 text-primary" /> {t('Private application storage')}</span>
          </div>
        </div>
        <div className="lg:justify-self-end"><HealthStatus /></div>
      </section>}

      <div className={user ? 'hidden' : 'mt-12 sm:mt-16'}><AccountAccess onUserChange={handleUserChange} /></div>
      {user && <div className="mt-8 space-y-5 sm:space-y-8">
        <GoogleDriveConnection hideWhenConnected onStatusChange={setDriveStatus} showIntro />
        <nav className="sticky top-[4.5rem] z-30 -mx-1 flex rounded-2xl border bg-card/95 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80" aria-label={t('Recorder workspace sections')}>
          <button className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${mobileView === 'new' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`} type="button" aria-current={mobileView === 'new' ? 'page' : undefined} onClick={() => setMobileView('new')}><Plus aria-hidden="true" className="size-4" /> {t('New record')}</button>
          <button className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${mobileView === 'history' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`} type="button" aria-current={mobileView === 'history' ? 'page' : undefined} onClick={() => setMobileView('history')}><Archive aria-hidden="true" className="size-4" /> {t('Evidence archive')}</button>
        </nav>
        <div className={mobileView === 'new' ? '' : 'hidden'} aria-hidden={mobileView !== 'new'}><RecorderWorkflow onCompleted={() => setHistoryRefreshKey((value) => value + 1)} /></div>
        <div className={mobileView === 'history' ? '' : 'hidden'} aria-hidden={mobileView !== 'history'}><RecorderHistory refreshKey={historyRefreshKey} /></div>
      </div>}
    </div>
  )
}
