import { BrandLogo } from './BrandLogo'
import { useI18n } from '../i18n'

export function BrandRefreshButton({ disabled = false, onActivate = () => window.location.reload() }: { disabled?: boolean; onActivate?: () => void }) {
  const { t } = useI18n()
  return <button
    aria-label={t("Reload LinhCj's")}
    className="flex min-w-0 shrink items-center gap-2 rounded-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-3"
    disabled={disabled}
    type="button"
    onClick={onActivate}
  >
    <BrandLogo />
  </button>
}
