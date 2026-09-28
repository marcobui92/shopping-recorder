import { useI18n } from '../i18n'

export function SessionLoadingSkeleton() {
  const { t } = useI18n()

  return <div
    aria-label={t('Loading your workspace')}
    className="relative mx-auto min-h-[calc(100dvh-9rem)] max-w-7xl animate-pulse px-4 py-6 sm:px-6 sm:py-10 lg:px-8"
    role="status"
  >
    <span className="sr-only">{t('Loading your workspace')}</span>
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="space-y-3 bg-slate-950 p-5 sm:p-7">
        <div className="h-5 w-28 rounded-full bg-white/15" />
        <div className="mx-auto h-7 w-56 max-w-full rounded bg-white/20" />
      </div>
      <div className="grid gap-5 p-4 sm:p-7 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="h-36 rounded-xl bg-muted" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-11 rounded-lg bg-muted" />
            <div className="h-11 rounded-lg bg-muted" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-5 w-36 rounded bg-muted" />
          <div className="h-11 rounded-lg bg-muted" />
          <div className="h-24 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  </div>
}
