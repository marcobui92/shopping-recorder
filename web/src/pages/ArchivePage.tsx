import type { AppUser } from '../api'
import { AccountAccess } from '../components/AccountAccess'
import { RecorderHistory } from '../components/RecorderHistory'
import { SessionLoadingSkeleton } from '../components/SessionLoadingSkeleton'

interface ArchivePageProps {
  onUserChange: (user: AppUser | null) => void
  sessionReady: boolean
  user: AppUser | null
}

export function ArchivePage({ onUserChange, sessionReady, user }: ArchivePageProps) {
  if (!sessionReady) return <SessionLoadingSkeleton />
  if (!user) return <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-7xl items-center justify-center px-4 py-5 sm:px-6 lg:px-8"><AccountAccess onUserChange={onUserChange} user={user} /></div>
  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8"><RecorderHistory /></div>
}
