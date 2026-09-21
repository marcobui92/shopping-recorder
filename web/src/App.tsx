import { ShieldCheck } from 'lucide-react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'

import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { LegalPage } from './pages/LegalPage'
import { BrandLogo } from './components/BrandLogo'
import { I18nProvider, LanguageSwitcher, useI18n } from './i18n'

export function App() {
  return <I18nProvider><AppContent /></I18nProvider>
}

function AppContent() {
  const { t } = useI18n()
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 shrink items-center gap-2 font-semibold tracking-tight sm:gap-3" to="/">
            <BrandLogo />
          </Link>
          <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-2">
            <NavLink className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground sm:inline-flex" end to="/">{t('Workspace')}</NavLink>
            <span className="hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex"><ShieldCheck aria-hidden="true" className="size-3.5 text-primary" /> {t('Private evidence')}</span>
            <span className="relative" id="header-profile" />
            <LanguageSwitcher />
          </nav>
        </div>
      </header>
      <main className="relative overflow-hidden">
        <div aria-hidden="true" className="page-grid pointer-events-none absolute inset-x-0 top-0 h-[34rem] opacity-70" />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="border-t bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>PackTrace · {t('Packing & unpacking evidence')}</span>
          <nav aria-label="Legal" className="flex gap-4"><Link className="hover:text-foreground hover:underline" to="/privacy">Privacy Policy</Link><Link className="hover:text-foreground hover:underline" to="/terms">Terms of Service</Link><span>{t('Encrypted in transit · Owner-authorized access')}</span></nav>
        </div>
      </footer>
    </div>
  )
}
