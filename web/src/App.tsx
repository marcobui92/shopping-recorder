import { useEffect, useRef, useState } from 'react'
import { Archive, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'

import { clearStorageProvidersCache, getSession, type AppUser } from './api'
import { AccountAccess } from './components/AccountAccess'
import { HomePage } from './pages/HomePage'
import { ArchivePage } from './pages/ArchivePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { LegalPage } from './pages/LegalPage'
import { SettingsPage } from './pages/SettingsPage'
import { BrandRefreshButton } from './components/BrandRefreshButton'
import { I18nProvider, LanguageSwitcher, useI18n } from './i18n'

export function App() {
  return <I18nProvider><AppContent /></I18nProvider>
}

function AppContent() {
  const { t } = useI18n()
  const location = useLocation()
  const [user, setUser] = useState<AppUser | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const sessionRequested = useRef(false)
  function handleUserChange(nextUser: AppUser | null) {
    clearStorageProvidersCache()
    setUser(nextUser)
  }

  useEffect(() => {
    if (sessionRequested.current) return
    sessionRequested.current = true
    void getSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setSessionReady(true))
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-2 sm:gap-3 sm:px-6 lg:px-8">
          <BrandRefreshButton disabled={workspaceBusy} />
          <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-1 sm:gap-2">
            {user && <NavLink aria-label={t('Workspace')} className="inline-flex size-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground sm:h-auto sm:w-auto sm:px-3 sm:py-2" end to="/"><LayoutDashboard aria-hidden="true" className="size-4" /><span aria-hidden="true" className="hidden sm:inline">{t('Workspace')}</span></NavLink>}
            {user && <NavLink aria-label={t('Evidence archive')} className="inline-flex size-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground sm:h-auto sm:w-auto sm:px-3 sm:py-2" to="/archive"><Archive aria-hidden="true" className="size-4" /><span aria-hidden="true" className="hidden sm:inline">{t('Evidence archive')}</span></NavLink>}
            {user && <NavLink aria-label={t('Settings')} className="inline-flex size-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground sm:h-auto sm:w-auto sm:px-3 sm:py-2" to="/settings"><Settings aria-hidden="true" className="size-4" /><span aria-hidden="true" className="hidden sm:inline">{t('Settings')}</span></NavLink>}
            {user && <span className="hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex"><ShieldCheck aria-hidden="true" className="size-3.5 text-primary" /> {t('Private evidence')}</span>}
            <span className="relative" id="header-profile" />
            <AccountAccess onUserChange={setUser} showForm={false} user={user} />
            <LanguageSwitcher />
          </nav>
        </div>
      </header>
      <main className="relative overflow-hidden">
        <div aria-hidden="true" className="page-grid pointer-events-none absolute inset-x-0 top-0 h-[34rem] opacity-70" />
        {(user || location.pathname === '/') && <div hidden={location.pathname !== '/'}><HomePage onBusyChange={setWorkspaceBusy} onUserChange={handleUserChange} sessionReady={sessionReady} user={user} /></div>}
        {(user || location.pathname === '/archive') && <div hidden={location.pathname !== '/archive'}><ArchivePage onUserChange={handleUserChange} sessionReady={sessionReady} user={user} /></div>}
        {(user || location.pathname === '/settings') && <div hidden={location.pathname !== '/settings'}><SettingsPage onUserChange={handleUserChange} sessionReady={sessionReady} user={user} /></div>}
        <Routes>
          <Route path="/" element={null} />
          <Route path="/archive" element={null} />
          <Route path="/settings" element={null} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="border-t bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>LinhCj&apos;s · {t('Packing & unpacking evidence')}</span>
          <nav aria-label="Legal" className="flex gap-4"><Link className="hover:text-foreground hover:underline" to="/privacy">Privacy Policy</Link><Link className="hover:text-foreground hover:underline" to="/terms">Terms of Service</Link><span>{t('Encrypted in transit · Owner-authorized access')}</span></nav>
        </div>
      </footer>
    </div>
  )
}
