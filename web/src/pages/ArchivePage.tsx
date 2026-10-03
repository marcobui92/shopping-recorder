import type { AppUser } from '../api'
import type { SessionStatus } from '../sessionUserStore'
import { AccountAccess } from '../components/AccountAccess'
import { RecorderHistory } from '../components/RecorderHistory'
import { SessionLoadingSkeleton } from '../components/SessionLoadingSkeleton'

interface ArchivePageProps {
  onUserChange: (user: AppUser | null) => void
  sessionStatus: SessionStatus
  user: AppUser | null
}

export function ArchivePage({ onUserChange, sessionStatus, user }: ArchivePageProps) {
  if (!user) return sessionStatus === 'checking' ? <SessionLoadingSkeleton /> : <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-7xl items-center justify-center px-4 py-5 sm:px-6 lg:px-8"><AccountAccess onUserChange={onUserChange} user={user} /></div>
  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8"><RecorderHistory sessionChecking={sessionStatus === 'checking'} /></div>
}
