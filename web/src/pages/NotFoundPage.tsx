import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { buttonVariants } from '../components/ui/button'
import { useI18n } from '../i18n'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <section className="relative mx-auto flex min-h-[65vh] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center" aria-labelledby="not-found-title">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Error 404</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl" id="not-found-title">{t('This page does not exist.')}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{t('Return to the PackTrace workspace.')}</p>
      <Link className={buttonVariants({ className: 'mt-8', size: 'lg' })} to="/"><ArrowLeft aria-hidden="true" className="size-4" /> {t('Go home')}</Link>
    </section>
  )
}
