import { useCallback, useEffect, useState } from 'react'

import type { AppUser } from '../api'
import { getSession } from '../api'
import { AccountAccess } from '../components/AccountAccess'
import { RecorderHistory } from '../components/RecorderHistory'
import { useI18n } from '../i18n'

export function ArchivePage() {
  const { t } = useI18n()
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const handleUserChange = useCallback((current: AppUser | null) => setUser(current), [])

  useEffect(() => {
    let active = true
    void getSession().then((session) => { if (active) setUser(session) }).catch(() => { if (active) setUser(null) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    {loading ? <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground" role="status">{t('Loading…')}</p> : user ? <RecorderHistory /> : <section className="mx-auto max-w-xl"><AccountAccess onUserChange={handleUserChange} /></section>}
  </div>
}
