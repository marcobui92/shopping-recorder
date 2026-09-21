export function BrandLogo() {
  return <span className="inline-flex min-w-0 items-center gap-2" aria-label="PackTrace">
    <svg aria-hidden="true" className="size-9 shrink-0 sm:size-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="44" height="44" rx="14" fill="#EEF2FF" stroke="#818CF8" strokeWidth="1.5" />
      <path d="M14 20L24 14L34 20L24 26L14 20Z" stroke="#4F46E5" strokeWidth="2.25" strokeLinejoin="round" />
      <path d="M14 20V31L24 37L34 31V20M24 26V37" stroke="#1E293B" strokeWidth="2.25" strokeLinejoin="round" />
      <path d="M12 14.5C14.1 10.9 17.6 9 22 9H25.5" stroke="#4F46E5" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M25 6.5L28 9.5L25 12.5" stroke="#4F46E5" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 33.5C33.9 37.1 30.4 39 26 39H22.5" stroke="#65A30D" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M23 41.5L20 38.5L23 35.5" stroke="#65A30D" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span className="truncate text-[1.05rem] font-extrabold tracking-[-0.04em] text-foreground sm:text-xl">Pack<span className="text-primary">Trace</span></span>
  </span>
}
