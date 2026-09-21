import { BrandLogo } from './BrandLogo'
import { useI18n } from '../i18n'

export function BrandRefreshButton({ onActivate = () => window.location.reload() }: { onActivate?: () => void }) {
  const { t } = useI18n()
  return <button
    aria-label={t('Reload PackTrace')}
    className="flex min-w-0 shrink items-center gap-2 rounded-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:gap-3"
    type="button"
    onClick={onActivate}
  >
    <BrandLogo />
  </button>
}
