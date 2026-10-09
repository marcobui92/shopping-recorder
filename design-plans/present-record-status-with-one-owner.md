# Present record status the same way in the archive list and the detail popup

Written against: `b176849`

## Evidence chain

- Surface: `/archive` (`web/src/components/RecorderHistory.tsx`) — the record list row and the record-detail popup that the same row opens.
- Problem: one data field, `activity.status`, is presented by two different owners in the same task. The list row shows it as a `Badge` whose variant encodes the lifecycle; the detail popup shows the same value as plain foreground text inside the meta line, with the same styling as the date and storage provider.
- Design evidence:
  - `web/src/components/RecorderHistory.tsx:44` `statusVariant()` is the component's own documented status mapping: `complete` → `success`, `uploading` / `expired` → `warning`, otherwise `outline`.
  - `web/src/components/RecorderHistory.tsx:262` applies it — `<Badge variant={statusVariant(activity.status)}>{t(activity.status[0].toUpperCase() + activity.status.slice(1))}</Badge>`.
  - `web/src/components/RecorderHistory.tsx:286` renders the same `selected.status` text as `<span className="font-semibold capitalize text-foreground">` with no `Badge` and no variant.
  - `web/src/components/ui/badge.tsx:6-13` is the owning primitive; its `success` / `warning` variants already carry the emerald and amber treatments, so no new color decision is needed. The dialog's expired banner at `RecorderHistory.tsx:291` uses the same amber family.
  - `feature_list.json` feat-068 (done) records the pinned detail header as "operation badge, truncated title, status/occurred/storage meta line, close button" — status belongs in that header, and the header already uses `Badge` for operation at `:281`.
- Owner: `Badge` (`web/src/components/ui/badge.tsx`) plus `statusVariant()` (`web/src/components/RecorderHistory.tsx:44`).
- Scope and affected surfaces: `web/src/components/RecorderHistory.tsx:286` only. The list row, the expired banner, and the filter status `Select` (`:239`) already use their owners correctly.
- Uncertainty: feat-068 describes the meta line as text content; if the owner wants that line to stay plain text, this plan must not proceed. See Stop conditions.

## Design decision

Render the detail header's status with the existing `Badge` + `statusVariant(selected.status)` owner already used by the list row, keeping the current localized status text and the existing `·` separators. Status then reads the same way before and after a user opens a record, and the lifecycle color coding has one owner instead of two presentations of the same field.

## Reuse

- `Badge` primitive and its `success` / `warning` / `outline` variants: `web/src/components/ui/badge.tsx:6-13`.
- `statusVariant()` mapping: `web/src/components/RecorderHistory.tsx:44`.
- Exemplar: `web/src/components/RecorderHistory.tsx:262` (list row) and `:281` (operation `Badge` already in the same header).

No new primitive, variant, token, or color is introduced.

## Changes

1. `web/src/components/RecorderHistory.tsx:286`
   - Change: replace the status `<span className="font-semibold capitalize text-foreground">…</span>` with `<Badge className="capitalize shrink-0" variant={statusVariant(selected.status)}>{t(selected.status[0].toUpperCase() + selected.status.slice(1))}</Badge>`, in the same position, so the line stays `status · occurred · storage`.
   - Preserve: the localized status string and its capitalization, the two `aria-hidden="true"` `·` separators, the occurred-at `displayDate` value, the storage-provider label branch (`t('Application storage')` / `Google Drive`), and the header's sticky behavior recorded in feat-068.
   - Preserve: the surrounding `<p>` classes (`mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground`) — `Badge` brings its own `text-xs` (`badge.tsx:6`), so the meta line does not need a second size declaration.
   - Verify: open an `expired` record from the list — the header status now shows the same amber `warning` Badge as its list row, alongside the existing expired banner at `:291`; a `complete` record shows the green `success` Badge; a `draft` record shows the `outline` Badge.

## Scope

- Inherit: `/archive` detail popup header for every status the filter can produce (`:239` lists `draft`, `uploading`, `complete`, `expired`, `cancelled`).
- Verify: the list row at `:262` is unchanged; `web/src/components/RecorderHistory.test.tsx` detail-layout assertions (feat-068's evidence records a class assertion was touched when this header was last restructured); the bulk-delete and cancel confirmations that read `selected.status` (`:305`, `:316`).
- Exclude: `RecorderHistory.tsx:295` asset-level status text, which is a different field and is covered by the localization plan; `web/src/components/RecorderWorkflow.tsx:333` header badges, which sit on a dark gradient and carry their own accepted white-treatment classes; any change to `statusVariant`'s mapping.

## Validation

- Product: an operator who taps View evidence sees the record's lifecycle state presented exactly as it was presented in the list they came from, including an expired record whose evidence is no longer retrievable.
- Interface: every status value; both locales; 320 / 360 / 390 / 430 / 768 / 1280 CSS px — the header must keep the title truncated on one line and let the meta line wrap without pushing the close control (`:284`) out of the dialog; long Vietnamese status labels (`Đã hủy`, `Đang tải lên`) must not overlap the separators.
- System: status presentation has one owner (`Badge` + `statusVariant`) across list and detail; no parallel inline status styling is left behind.
- Repository: `cd web && npm run test -- RecorderHistory` → passes (update only assertions that matched the old status `<span>`); `cd web && npm run typecheck` → clean; `cd web && npm run build` → succeeds; `./init.sh` → passes. Record output in the active feature's `evidence` field per `AGENTS.md`.

## Stop conditions

- Stop if the owner confirms the feat-068 meta line must stay plain text; then this is a documented exception rather than a finding.
- Stop if `Badge` cannot sit inside the `<p>` without a markup change to the header (a `<div>` substitution would widen the plan beyond its stated change).
- Stop if `statusVariant` needs a new mapping for `cancelled`, which currently falls through to `outline` (`:44`); that is a lifecycle-visibility decision, not styling.

## Design documentation

- After acceptance and validation: record in `progress.md` that record status uses `Badge` + `statusVariant` in both the archive row and the detail header, and note the same in feat-068's follow-up context so the detail-header description reflects a Badge for status. No change to `docs/ARCHITECTURE.md` or `docs/API_CONTRACT.md`.
