# Make the new-record step indicator reflect record state

Written against: b176849

## Evidence chain

- Surface: `/` (signed-in workspace) — the three-step `<ol>` in the new-record card header, `web/src/components/RecorderWorkflow.tsx:336`. Rendered at 1440px (`/tmp/ui-audit/01-signed-in-workspace-1440.png`) and inspected in source; the same header is visible in `/tmp/ui-audit/03-review-section-1440.png`.
- Problem: the indicator's presentation is hard-coded. Step 1's chip is always `bg-primary text-primary-foreground` and steps 2 and 3's chips are always `bg-white/10`, so the header states "Activity details is the current step" for every state of the record — before any file is chosen, after files are staged and listed for review, and after the record has been created and its files are uploading. The element is labelled "New record steps" but cannot express steps.
- Design evidence: the same component already defines the progression this indicator claims to track, and keys three other regions to it — the review section renders only when evidence is staged (`:383`, `{items.length > 0 && …}`), the footer submit CTA is `Review complete · Upload` while the record does not exist and becomes `Complete record` once it does (`:397`, `!activityId` / `activityId`), and the completion dialog opens on `complete` (`:399`). The indicator is the only element on this surface that ignores those states, which is a direct contradiction in user-facing presentation within the same task.
- Owner: `web/src/components/RecorderWorkflow.tsx:336` (the `<ol>` inside `CardHeader`), and the state it must read — `items` (`:143`), `activityId` (`:141`), `complete` (`:147`) — all already in scope at that line.
- Scope and affected surfaces: the header `<ol>` only; `sm` and above, since the indicator is `hidden … sm:flex`.
- Uncertainty: none for the state mapping — every boundary below is an existing render condition in this file. The done-step chip value is taken from an existing exemplar rather than chosen.

## Design decision

Derive each step's presentation from the record state the component already holds, using the same boundaries the review section, the footer CTA and the completion dialog already use, so the indicator advances exactly when the surface's demanded action changes. Present a completed step with the success chip this surface already uses for its confirmed state, and keep the current step's existing `bg-primary text-primary-foreground` treatment. No new state, no new primitive, and no change to which labels appear or where the indicator sits.

## Reuse

- Current step: existing `bg-primary text-primary-foreground` (`:336`).
- Upcoming step: existing `bg-white/10` (`:336`).
- Done step: `bg-emerald-100 text-emerald-700` with the lucide `Check` glyph — the accepted "verified/complete" chip on this exact surface, exemplar `web/src/components/RecorderWorkflow.tsx:399` (`<span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Check … />`), also used by `Badge variant="success"` (`web/src/components/ui/badge.tsx:6-13`).
- `Check` is already imported in `RecorderWorkflow.tsx`; `aria-current="step"` is the native stepper semantics for the existing `<ol>`/`<li>` structure.

## Changes

1. `web/src/components/RecorderWorkflow.tsx` — add the phase derivation next to the other derived values (`allReady` at `:327`, `selectedBytes` at `:328`):

   ```tsx
   const stepReached = complete ? 4 : activityId ? 3 : items.length > 0 ? 2 : 1
   ```

   - Change: one expression; no new state or effect.
   - Preserve: `items`, `activityId` and `complete` as the only inputs — `resetDraft` and "Start another record" (`:397`, `:399`) already clear them, so the indicator returns to step 1 without extra wiring.
   - Verify: with no files and no record the value is 1; after staging one file it is 2; after the record is created it is 3; with the completion dialog open it is 4.

2. `web/src/components/RecorderWorkflow.tsx:336` — render the `<ol>` from that value.
   - Change: for step index 1 (`Activity details`), 2 (`Add evidence`), 3 (`Review & upload`), give each `<li>`'s chip one of three presentations: `index < stepReached` → `grid size-6 place-items-center rounded-full bg-emerald-100 text-emerald-700` containing `<Check aria-hidden="true" className="size-3.5" />` instead of the numeral; `index === stepReached` → the current `grid size-6 place-items-center rounded-full bg-primary text-primary-foreground` with its numeral; `index > stepReached` → the current `grid size-6 place-items-center rounded-full bg-white/10` with its numeral. Add `aria-current="step"` to the `<li>` of the current step only, and omit it when `stepReached === 4`.
   - Preserve: `className="mt-5 hidden flex-wrap gap-3 text-xs text-slate-300 sm:flex"` on the `<ol>`, the `size-6` chip geometry, the `flex items-center gap-2` `<li>` layout, the three existing `t()` labels, and the `aria-label="New record steps"` string exactly as written — its localization is owned by `design-plans/localize-record-detail-and-shell-chrome.md`; do not wrap it here.
   - Verify: on a ≥640px viewport the highlighted numeral moves 1 → 2 → 3 as files are staged and the record is created, and completed steps show a check on the dark header; below `sm` the indicator stays hidden.

3. `web/src/components/RecorderWorkflow.test.tsx` — add one focused test in the existing style of the file (the drop helper at `:93-99` shows how evidence is staged in tests).
   - Change: assert the current step's accessible state is step 1 on a fresh render, and after a `fireEvent.drop` of one image the check appears on step 1 and step 2 becomes current.
   - Preserve: all existing assertions, including `:84-92`.
   - Verify: `cd web && npx vitest run src/components/RecorderWorkflow.test.tsx` passes with the new case.

## Scope

- Inherit: every record state shown at `sm` and above on `/`, including the interrupted-record path where `activityId` is already set (the indicator opens on step 3, matching the `Complete record` CTA).
- Verify: the `hidden … sm:flex` phone branch (feat-044 compact form) is unchanged; the completion dialog still renders its own success chip.
- Exclude: the indicator's `aria-label` copy (localization plan); the grid ratio and drop-zone height (`design-plans/rebalance-the-new-record-card-columns.md`); control heights (`design-plans/give-control-heights-one-owner.md`); any per-field validation of Activity details — nothing on this surface gates submission on the details fields, so the indicator must not imply that it does.

## Validation

- Product: while recording a handoff on a tablet or desktop, the operator can tell from the header which part of the flow is left, and the header agrees with the button the surface is asking them to press.
- Interface: 1440 and 768px; states: fresh form, one file staged, several files staged, file upload in progress (`activityId` set, per-file `Progress` at `:389`), record completed (dialog at `:399`), and `Reset form` returning to step 1. Long Vietnamese labels (`Thông tin hoạt động`, `Thêm bằng chứng`, `Xem lại và tải lên`) must still wrap without clipping in the `flex-wrap` row at 640px, in both locales.
- System: the indicator now reads the same three state variables as the review section, footer CTA and completion dialog instead of maintaining its own notion of progress; no new primitive.
- Repository: `cd web && npm run test && npm run typecheck && npm run build` → all green.

## Stop conditions

- Stop if a state exists where `activityId` is set but `items.length === 0` and the surface offers no step-3 action — the mapping assumes `activityId` implies the review/upload phase.
- Stop if `Check` is not already imported in `RecorderWorkflow.tsx` at execution time, or if adding it requires a new icon dependency.
- Stop if the accepted decisions in `feature_list.json` for the recorder header (feat-044, feat-047) turn out to pin the indicator's static presentation.

## Design documentation

- After acceptance and validation: record "The new-record step indicator is derived from `items.length` / `activityId` / `complete` — step 1 while nothing is staged, step 2 while evidence is staged and unsubmitted, step 3 once the record exists, all done on completion; completed steps use the surface's emerald success chip" in the active feature's `evidence` field in `feature_list.json` and in `progress.md`, per AGENTS.md.
