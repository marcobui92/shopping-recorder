# Rebalance the new-record card's two columns

Written against: b176849

## Evidence chain

- Surface: `/` (signed-in workspace) — the new-record card body at the `lg` branch (≥1024px), no files selected. Measured with Chrome DevTools Protocol `getBoundingClientRect()` / `getComputedStyle()` against the running dev app, and rendered in `/tmp/ui-audit/01-signed-in-workspace-1440.png`.
- Problem: the card body is a single-row grid whose two columns stretch to the taller one, so the wide capture column ends its content at the dashed drop zone and leaves empty card below it:
  - viewport 1440 and 1280 → `grid-template-columns: 473.45px 740.55px` (1.56:1); row height 606px; capture content ends at y=669, capture box ends at y=939 → 270px, of which 28px is the section's `sm:p-7` bottom padding → **242px of empty card**.
  - viewport 1100 → `403.25px 630.75px`, row 634px → **270px empty**; viewport 1024 → `373.61px 584.39px` → **270px empty**.
  - The screenshot shows this as the white region right of the Notes field and below the drop zone. The narrower column (Activity details, four stacked fields) is the one that is full; the wider column (three rows of capture controls) is the one that is empty.
- Design evidence: this card has two owners for the same composition and they disagree. The loading mirror `web/src/components/SessionLoadingSkeleton.tsx:17` declares `lg:grid-cols-[1.2fr_0.8fr]` for the same card — same `max-w-7xl` page shell, same `overflow-hidden rounded-2xl border bg-card shadow-sm` container, same `bg-slate-950 p-5 sm:p-7` header, same `p-4 sm:p-7` body — while the loaded card declares `lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]` at `web/src/components/RecorderWorkflow.tsx:340`. The mirror also places its media-shaped block first and its form-shaped block second, i.e. left/right inverted relative to the loaded card at `lg`.
- Owner: `web/src/components/RecorderWorkflow.tsx:340` (grid), the capture `section` at `:364`, its drop-zone `label` at `:373`, and `web/src/components/SessionLoadingSkeleton.tsx:17`.
- Scope and affected surfaces: those four locations only. The grid is `lg`-only, so `<lg` (stacked, capture first) is untouched.
- Uncertainty: whether the residual height should be absorbed by the drop zone or removed by aligning the columns to start. Resolved in favour of absorption because `lg:items-start` leaves the same whitespace unpainted and shortens the `lg:border-r` divider (`:341`), and because a larger dashed target serves the surface's primary action.

## Design decision

Give the two columns equal width and let the capture column's content fill the row it is already stretched to. `lg:grid-cols-2` resolves to `repeat(2, minmax(0, 1fr))`, so it keeps the zero-width-track overflow guard the current arbitrary value spells out by hand, removes the 1.56:1 over-provisioning of the column with less content, and — with the drop zone allowed to grow — leaves no unpainted region. The loading mirror is updated to the same track list and the same left/right arrangement so the two states of this one surface stop flipping when data arrives.

## Reuse

- `lg:grid-cols-2` (Tailwind default utility) instead of an arbitrary `minmax(0,…fr)` track list.
- Existing section/label classes on `RecorderWorkflow.tsx:364` and `:373`; only flex distribution is added.
- Exemplar for the `minmax(0, …)` requirement being preserved implicitly: `RecorderWorkflow.tsx:340` current value, and the `min-w-0` usage at `:385`.

## Changes

1. `web/src/components/RecorderWorkflow.tsx:340`
   - Change: replace `lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]` with `lg:grid-cols-2`.
   - Preserve: `grid` base class; the `order-2 … lg:order-1` / `order-1 … lg:order-2` swap on the two sections (`:341`, `:364`) — the accepted upload-first mobile ordering; the `lg:border-b-0 lg:border-r` divider on the details section.
   - Verify: at 1440px, `getComputedStyle(grid).gridTemplateColumns` returns two equal tracks (~580px each inside the 1160px body) instead of `473.45px 740.55px`.

2. `web/src/components/RecorderWorkflow.tsx:364` and `:373`
   - Change: add `flex flex-col` to the capture `section` and `flex-1` to the drop-zone `label` (`:373`) so the dashed target absorbs the row height the grid already imposes.
   - Preserve: `p-4 sm:p-7 lg:order-2` on the section; the label's `min-h-32 sm:min-h-44` floors (asserted by `web/src/components/RecorderWorkflow.test.tsx:90`), its `flex-col items-center justify-center` inner centring, `rounded-2xl border-2 border-dashed`, the `dragActive` / `items.length > 0` / idle border-background variants, and the `htmlFor="record-files"` association.
   - Verify: at 1440px with no files selected, the drop zone measures taller than its 176px floor and `capture.bottom − dropZone.bottom` is ≤ 28px (padding only) at 1440, 1280, 1100 and 1024.

3. `web/src/components/SessionLoadingSkeleton.tsx:17`
   - Change: replace `lg:grid-cols-[1.2fr_0.8fr]` with `lg:grid-cols-2`, and swap the order of the two child blocks so the form-shaped block (heading line + `h-11` + `h-24`) renders first/left and the media-shaped block (`h-36` + two-up `h-11` row) renders second/right, matching the loaded card at `lg`.
   - Preserve: `grid gap-5 p-4 sm:p-7`, the card/header container classes, `animate-pulse`, `role="status"` and the `sr-only` label.
   - Verify: the skeleton's column split and side assignment match the loaded card, so nothing changes sides when loading finishes.

## Scope

- Inherit: every state of the new-record card at `lg+` (empty form, files staged with the review section at `:383`, record created, completion dialog at `:399`) and the signed-in loading state on `/`.
- Verify: `RecorderWorkflow.test.tsx:84-92` ("uses compact phone spacing while retaining desktop field sizing") and the drop/preview tests in the same file; the `<lg` stacked layout at 900px and 390px.
- Exclude: the skeleton's `gap-5` versus the card's border divider (not part of the measured defect); the details section's `lg:grid-cols-1` field stacking (pinned by `RecorderWorkflow.test.tsx:88`); the step indicator at `:336` (separate plan); control heights (separate plan).

## Validation

- Product: an operator on a ≥1024px display opens `/`, sees two balanced columns with no empty card under the drop zone, and gets a larger dashed drop target.
- Interface: 1440, 1280, 1100, 1024 (`lg` branch); 900 and 390 (stacked branch, capture first). States: no files, one file staged, several files staged (review grid spans full width below the two columns), record created (`activityId`), completion dialog open. Drag-hover state on the enlarged drop zone still shows the `scale-[1.01] border-primary bg-primary/10` treatment.
- System: one track list shared by the card and its loading mirror; no new primitive and no new arbitrary grid value.
- Repository: `cd web && npm run test && npm run typecheck && npm run build` → all green, including `RecorderWorkflow.test.tsx`.

## Stop conditions

- Stop if the `<lg` stacked arrangement changes (the grid must stay `lg`-only and the mobile upload-first order must survive).
- Stop if `RecorderWorkflow.test.tsx` cannot pass with the `min-h-32 sm:min-h-44` floors retained, or if the assertions at `:88`/`:90` would have to be edited rather than preserved.
- Stop if making the drop zone fill the row pushes the completion dialog or review grid into a new overflow behaviour at 1024px.

## Design documentation

- After acceptance and validation: record "New-record card body uses an equal two-column split at `lg`, with the capture column's drop zone filling the row; `SessionLoadingSkeleton` mirrors that split and arrangement" in the active feature's `evidence` field in `feature_list.json` and in `progress.md`, per AGENTS.md.
