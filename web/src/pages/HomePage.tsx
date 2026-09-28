import type { AppUser } from '../api'
import { AccountAccess } from '../components/AccountAccess'
import { RecorderWorkflow } from '../components/RecorderWorkflow'
import { SessionLoadingSkeleton } from '../components/SessionLoadingSkeleton'

interface HomePageProps {
  onUserChange: (user: AppUser | null) => void
  sessionReady: boolean
  user: AppUser | null
  onBusyChange?: (busy: boolean) => void
}

export function HomePage({ onBusyChange, onUserChange, sessionReady, user }: HomePageProps) {
  if (!sessionReady) return <SessionLoadingSkeleton />
  if (!user) return <div className="relative mx-auto flex min-h-[calc(100dvh-9rem)] max-w-7xl items-center justify-center px-4 py-5 sm:px-6 lg:px-8"><AccountAccess onUserChange={onUserChange} user={user} /></div>

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="mt-4 sm:mt-8">
        <RecorderWorkflow onBusyChange={onBusyChange} />
      </div>
    </div>
  )
}
