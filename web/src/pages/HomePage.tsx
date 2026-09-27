import { useEffect, useState } from 'react'

import type { AppUser, GoogleDriveStatus } from '../api'
import { AccountAccess } from '../components/AccountAccess'
import { RecorderWorkflow } from '../components/RecorderWorkflow'
import { GoogleDriveConnection } from '../components/GoogleDriveConnection'

interface HomePageProps {
  onUserChange: (user: AppUser | null) => void
  sessionReady: boolean
  user: AppUser | null
}

export function HomePage({ onUserChange, sessionReady, user }: HomePageProps) {
  const [, setDriveStatus] = useState<GoogleDriveStatus | null>(null)
  useEffect(() => {
    const reset = () => setDriveStatus(null)
    window.addEventListener('storage-providers-changed', reset)
    return () => window.removeEventListener('storage-providers-changed', reset)
  }, [])

  if (!sessionReady) return <div className="min-h-[calc(100dvh-9rem)]" />
  if (!user) return <div className="relative mx-auto flex min-h-[calc(100dvh-9rem)] max-w-7xl items-center justify-center px-4 py-5 sm:px-6 lg:px-8"><AccountAccess onUserChange={onUserChange} user={user} /></div>

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="mt-4 sm:mt-8">
        <RecorderWorkflow />
        <GoogleDriveConnection hideWhenConnected onStatusChange={setDriveStatus} showIntro />
      </div>
    </div>
  )
}
