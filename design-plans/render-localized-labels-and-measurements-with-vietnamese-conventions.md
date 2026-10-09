# Render localized labels and measurements with Vietnamese conventions

Written against: `b176849`

## Evidence chain

- Surface: `/archive` record list, record-detail popup and audit trail (`web/src/components/RecorderHistory.tsx`), plus the new-record card's size and stage copy (`web/src/components/RecorderWorkflow.tsx`). Captured in the running local app (Vite on `:5173`, API on `:3000`) at 1440×900 and 390×844 with the default Vietnamese locale.
- Problem: two English-era text conventions survive translation and are visible on screen.
  1. A CSS `capitalize` transform is applied to dictionary strings that already carry their own casing, so the same term appears two different ways on one screen.
  2. Dates and byte sizes are formatted with the browser's runtime locale instead of the application's selected locale, so a Vietnamese-default session shows English-style dates.
- Design evidence:
  - `feature_list.json` feat-027 (done) acceptance: "Application labels, validation, errors, status, confirmations and accessible names use the selected locale, **including HTML language and date/number/size formatting**."
  - `web/src/i18n.tsx:166` is the locale owner — it writes `document.documentElement.lang = locale`; `web/src/i18n.tsx:173` exposes `locale` through `useI18n()`.
  - Dictionary values are already sentence-cased: `web/src/i18n.tsx:135` `'Packing': 'Đóng gói'`, `'Unpacking': 'Mở gói'`; `:148` `'Draft': 'Bản nháp'`, `'Complete': 'Hoàn tất'`, `'Cancelled': 'Đã hủy'`.
  - `RecorderHistory.tsx:262` renders the operation as `<span className="capitalize">`, `:281` as `<Badge className="capitalize shrink-0">`, `:286` as `<span className="font-semibold capitalize text-foreground">`, while the filter `Select` at `:238-239` renders the identical dictionary strings with no transform.
  - `RecorderHistory.tsx:30-32` `displayDate` calls `new Intl.DateTimeFormat(undefined, …)`; `RecorderHistory.tsx:295` and `RecorderWorkflow.tsx:100-103` produce byte sizes with `toFixed(1)` and template strings.
  - Rendered proof (screenshots `/tmp/ui-audit/06-archive-1440.png`, `08-detail-390.png`, measurements `/tmp/ui-audit/measures.json` with `document.documentElement.lang === "vi"`): the list row reads `Đóng Gói` beside the status badge `Bản nháp`; the detail header reads `Đóng Gói` and `Bản Nháp`; every timestamp reads `Oct 4, 2026, 10:14 PM`.
- Owner: the `translations` map (`web/src/i18n.tsx:7-156`) owns label casing; `useI18n().locale` (`web/src/i18n.tsx:173`) owns the formatting locale.
- Scope and affected surfaces: `web/src/components/RecorderHistory.tsx`, `web/src/components/RecorderWorkflow.tsx`.
- Uncertainty: the exact Vietnamese date pattern the owner wants (`Intl` with locale `vi` yields `4 thg 10, 2026, 22:14`). If a specific pattern is required instead of locale-default `medium`/`short`, that is the owner's call — see Stop conditions.

## Design decision

Stop post-processing localized strings, and format measurements through the locale the application already owns. Casing is content, so it belongs to the dictionary rather than a CSS transform that was correct when every label was English. Dates and byte sizes belong to `Intl` with `useI18n().locale`, which is the same value `i18n.tsx:166` publishes to the document.

## Reuse

- `useI18n()` → `{ locale }` — `web/src/i18n.tsx:158,173`.
- Existing exemplar for locale-driven document state: `web/src/i18n.tsx:165-168`.
- Existing dictionary values as the single source of label casing (`web/src/i18n.tsx:135,148`).
- Exemplar for a locale-neutral control that already renders these strings without a transform: the filter `Select` at `web/src/components/RecorderHistory.tsx:238-239`.

No new primitive, token or helper module is introduced.

## Changes

1. `web/src/components/RecorderHistory.tsx` — stop re-casing dictionary strings
   - Change: remove `capitalize` from the operation `<span>` at `:262`, the operation `Badge` at `:281`, and the status `<span>` at `:286`. Keep the `t(status[0].toUpperCase() + status.slice(1))` expression at `:262` and `:286` — that capitalization builds the dictionary key (`Draft`, `Complete`, …) and is not display casing.
   - Preserve: `:309`'s `<strong className="capitalize">` for `event.action.replaceAll('_', ' ')`, which renders a raw API enum rather than a dictionary string, and every `Badge` variant, `truncate`, and separator in those rows.
   - Verify: at `/archive` in Vietnamese, the list row and the detail header both read `Đóng gói` / `Mở gói`, matching the Operation filter control, and the status reads `Bản nháp` in both places.
2. `web/src/components/RecorderHistory.tsx` — format timestamps in the selected locale
   - Change: give `displayDate` the active locale (`displayDate(value, locale)` → `new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })`) and pass `locale` from `useI18n()` at its three call sites: `:262` list row, `:286` detail header, `:309` audit trail.
   - Preserve: `dateStyle: 'medium'` / `timeStyle: 'short'` shapes, the ISO values sent to the API, and `toLocalInput`/`toTimestamp` (`:34-42`), which are form-field conversions rather than display formatting.
   - Verify: the same record's timestamp renders in the Vietnamese pattern in Vietnamese and the English pattern in English, identically in the list, the detail header and the audit trail.
3. `web/src/components/RecorderHistory.tsx:295` and `web/src/components/RecorderWorkflow.tsx:100-103` — format byte sizes in the selected locale
   - Change: replace the inline `(asset.sizeBytes / 1024 / 1024).toFixed(1)` and `formatBytes`'s template output with `Intl.NumberFormat(locale, { maximumFractionDigits: 1 })` applied to the same MB/KB magnitudes, keeping the `KB` / `MB` unit labels as they are today.
   - Preserve: the KB-under-1MB rounding-to-1 behavior (`Math.max(1, …)`) that prevents "0 KB", and every call site's surrounding string (`RecorderWorkflow.tsx:375,388,397`).
   - Verify: a 1.5 MB file reads `1,5 MB` in Vietnamese and `1.5 MB` in English, in the drop-zone total, the review card and the footer summary.

## Scope

- Inherit: `/archive` list, detail popup, audit trail, evidence viewer footer, `/` new-record card and its review grid and completion dialog.
- Verify: `web/src/components/RecorderHistory.test.tsx`, `web/src/components/RecorderWorkflow.test.tsx`, `web/src/App.test.tsx` — date and size assertions may currently encode the runtime browser locale; the test locale contract must be checked before changing them.
- Exclude: the localization gaps where copy never reaches `t()` at all (`design-plans/localize-record-detail-and-shell-chrome.md` — this plan assumes that change's strings are present and only fixes how localized strings are rendered); `LegalPage.tsx` content; `docs/` timestamps; API payloads and stored ISO timestamps, which must stay unchanged.

## Validation

- Product: a Vietnamese-default operator scans the archive and opens a record and sees one consistent casing for each term plus timestamps and file sizes written the way Vietnamese readers expect, with no English-style date on any screen.
- Interface: both locales; 320 / 360 / 390 / 430 / 768 / 1280 CSS px; a record with a long reference, an expired record whose meta line wraps, an audit trail with several entries, and a multi-file selection whose total size crosses the KB/MB boundary.
- System: label casing lives only in the `translations` map, and every user-facing date/size goes through `Intl` with `useI18n().locale`; no new per-component formatting helper or `toLocaleString()` call appears.
- Repository: `cd web && npm run test` → passes; `cd web && npm run typecheck` → clean; `cd web && npm run build` → succeeds; `./init.sh` → passes. Confirm with a rendered check in the running app (the same headless-Chrome pass used to record the evidence above) and paste the resulting label/date strings into the feature's `evidence` field per `AGENTS.md`.

## Stop conditions

- Stop if the owner wants a fixed Vietnamese date pattern rather than `Intl` locale defaults; that is a formatting decision, not part of this change.
- Stop if `RecorderHistory.test.tsx` / `RecorderWorkflow.test.tsx` assert English month names under the `vi` default because the test environment pins a browser locale — the test harness, not these components, would then be the blocker.
- Stop if removing `capitalize` at `:281` or `:286` changes a `Badge`'s rendered size or wrapping; report rather than adding a compensating class.
- Do not extend this plan to translate strings that bypass `t()`; that is the other plan's scope.

## Design documentation

- After acceptance and validation: record in `progress.md` that feat-027's "date/number/size formatting" criterion is delivered through `useI18n().locale` and that dictionary values are the sole owner of label casing (no CSS casing on translated strings). Note in `docs/MOBILE_LOCALIZATION_DRIVE_PLAN.md` that the casing and `Intl` audit items are closed.
