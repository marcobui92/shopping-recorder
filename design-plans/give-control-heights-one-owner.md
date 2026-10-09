# Give control heights one owner instead of a blanket element minimum

Written against: `b176849`

## Evidence chain

- Surface: every control in the traced recorder path — new-record form and capture toolbar (`RecorderWorkflow.tsx`), archive filter row, record list, detail popup and evidence viewer (`RecorderHistory.tsx`), Drive actions (`DriveFileActions.tsx`), profile and language controls in the shell (`AccountAccess.tsx`, `i18n.tsx`, `App.tsx`).
- Problem: `web/src/styles.css:47` applies `min-height: 2.75rem` to the `button` element, which silently overrides any height a control declares below 44px, while `Input` (`components/ui/input.tsx:6`) and the `Select` trigger (`components/ui/select.tsx:20`) declare `h-10` (40px) and are not buttons. The result is a system where declared sizes are not the rendered sizes: standard fields render 40px, standard buttons 44px, `sm` buttons 44px instead of their declared `h-9`, `icon` buttons 40×44 instead of their declared `size-10` square, and the flag trigger documented as 24×40 renders 40×44.
- Design evidence:
  - `web/src/styles.css:47` — `button, [role="button"] { min-height: 2.75rem }` inside `@layer base`.
  - `web/src/components/ui/button.tsx:10` declares `default: 'h-10 …'`, `sm: 'h-9 rounded-md px-3'`, `lg: 'h-11 …'`, `icon: 'size-10'` — every one of the three sub-44px sizes is defeated by the base rule.
  - `web/src/components/ui/input.tsx:6` and `web/src/components/ui/select.tsx:20` both declare `h-10`, so a field and the button-like control beside it in the same row (`RecorderHistory.tsx:230-232`, `SettingsPage.tsx:33`) currently render 40px and 44px.
  - Escape hatches already in the source prove the override is fought at call sites: `AccountAccess.tsx:109` (`size-10 !min-h-0`), `RecorderHistory.tsx:319-320` (`!min-h-0` on three viewer icon buttons and two navigation arrows), `GoogleDriveConnection.tsx:40-41` (`h-auto min-h-10`).
  - `feature_list.json` feat-028 (done) accepted "Primary controls target 44-by-44 CSS-pixel hit areas" and records "application controls have 44px minimum height".
  - `feature_list.json` feat-050 (done) records the flag trigger as a "borderless, shadowless 24x40px trigger"; the rendered control is 40×44.
  - **Owner decision (this session, 2026-10-04):** compact controls are allowed to be smaller than 44px. That resolves which of the two accepted decisions wins for a deliberately compact control, and keeps 44px as the minimum for standard controls.
- Owner: the primitives — `buttonVariants` (`web/src/components/ui/button.tsx:6-21`), `Input` (`input.tsx:6`), `Select` (`select.tsx:20`) — must own their own heights.
- Scope and affected surfaces: `web/src/styles.css`, `web/src/components/ui/button.tsx`, `web/src/components/ui/input.tsx`, `web/src/components/ui/select.tsx`, plus the call sites that currently patch or pair against the blanket rule.
- Uncertainty: raising every standard field from 40px to 44px shifts vertical rhythm across the recorder form, filter row and Settings card, and `RecorderHistory.test.tsx` / `RecorderWorkflow.test.tsx` contain class assertions. Verify visually at the widths listed below before accepting; this is the one change in the set that needs a rendered check rather than a source check.

## Design decision

Delete the element-level minimum and express the accepted 44px floor inside the standard sizes of the primitives, so a control's declared size is its rendered size and compactness is a deliberate call-site choice rather than something that needs `!important`. Standard controls (default/lg buttons, `Input`, `Select`, `Textarea`) become 44px — which they are supposed to be per feat-028 and which also pairs a field with its button sibling; `sm` and `icon` render exactly their declared 36px and 40px square; the flag trigger renders its documented 24×40. Within one action row, controls share a tier: the task's primary action stays standard (44px), and a compact peer is only allowed when its row partners are compact too.

## Reuse

- `buttonVariants` size entries as the single place heights are declared: `web/src/components/ui/button.tsx:10`.
- Existing utility pattern already used correctly at `GoogleDriveConnection.tsx:40-41`, where an explicit `min-h-*` utility in the call site's own class list overrides the base layer without `!important`.
- Exemplar for a square icon control that already opts out: `AccountAccess.tsx:109`.
- `cn` (`web/src/lib/utils.ts`) resolves a base `min-h-11` against a call-site `min-h-0` by last-wins, which is what makes the tiers expressible without `!important`.

No new primitive or variant is introduced.

## Changes

1. `web/src/styles.css:47`
   - Change: remove `button, [role="button"] { min-height: 2.75rem }` from the `@layer base` block.
   - Preserve: `:43-48`'s `border-border` default, `scroll-smooth`, body font/background/antialiasing, the `focus-visible:outline-none` reset, `::selection`, and the `:51-53` safe-area padding.
   - Verify: no element-level height rule remains; control heights are traceable only to primitives or call-site classes.
2. `web/src/components/ui/button.tsx:10`
   - Change: add `min-h-11` to the cva base string so the standard tier keeps the accepted 44px floor; give the compact entries their own override — `sm: 'h-9 min-h-0 rounded-md px-3'`, `icon: 'size-10 min-h-0'`. `default` and `lg` need no new classes (they already reach 44px today).
   - Preserve: variant colors, `rounded-md` on `sm`, `gap-2`, `whitespace-nowrap`, disabled and focus-visible treatment.
   - Verify: `default`, `lg` render 44px as before; `sm` renders 36px; `icon` renders a 40×40 square instead of 40×44.
3. `web/src/components/ui/input.tsx:6`, `web/src/components/ui/select.tsx:20`, `web/src/components/ui/textarea.tsx:6`
   - Change: bring the standard field tier to the same floor — `h-10` → `h-11` on `Input` and on the `Select` trigger; keep `Textarea`'s `min-h-24` and let the field body grow with `h-11`-consistent line height only if the paired label spacing requires it. Add `min-h-0` to the `Select` option-row buttons at `select.tsx:21` so menu rows keep their own `min-h-10` rhythm and are unaffected by the primitive change.
   - Preserve: `rounded-lg`, `border-input`, `shadow-xs`, `text-base sm:text-sm`, the custom Select trigger/listbox interaction contract accepted in feat-039, and every `id`/`htmlFor` pairing.
   - Verify: in the archive filter row (`RecorderHistory.tsx:230-232`) the search field, `Clear search` and `Filters` share one height; in the recorder form (`RecorderWorkflow.tsx:346,358-360`) the `Storage` and `Operation` selects align with the `Reference` input.
4. Call sites that patched the old rule or documented a compact size
   - Change: `AccountAccess.tsx:109` drop `!min-h-0` (the `icon`-tier square now renders 40×40 on its own); `RecorderHistory.tsx:319-320` drop all five `!min-h-0` patches; `i18n.tsx:178` add `min-h-0` to the flag trigger's class list so it renders the feat-050-documented 24×40.
   - Preserve: `GoogleDriveConnection.tsx:40-41` keeps `h-auto` with a raised `min-h-11` so wrapping multi-line labels stay in the standard tier; the viewer's floating capture cluster (`RecorderWorkflow.tsx:371`) keeps its `size-11` round button.
   - Verify: no `!min-h-*` / `!important` height patch remains in `web/src`; the header row holds the brand mark, three 36px icon nav links, the 40×40 profile avatar and the 24×40 flag trigger without any control clipping or growing past its row.
5. Paired rows that mixed tiers because of the old rule
   - Change: resolve the tier per the stated rule — the asset action row (`RecorderHistory.tsx:295`: `Open viewer` + download link) and the Drive action row (`DriveFileActions.tsx:29-30`: `Copy Drive link` + `Open in Drive`) are primary evidence actions, so move both peers to the standard 44px tier; `RecorderHistory.tsx:257` bulk bar and `:263` `View evidence`, whose row partners are text and an icon square, stay compact.
   - Preserve: if `design-plans/build-evidence-links-from-button-variants.md` has landed, those links inherit `buttonVariants` and only their `min-h-*` class changes here; if it has not, leave the links' own class lists alone and let that plan's `min-h-11` stand.
   - Verify: no action row contains two different control heights at any width.

## Scope

- Inherit: every route and dialog in `web/` — `/`, `/archive`, `/settings`, `/privacy`, `/terms`, the 404 page, the new-record completion dialog, the activity detail popup and the evidence viewer.
- Verify: `web/src/App.test.tsx` (header shell assertions), `web/src/components/RecorderWorkflow.test.tsx`, `web/src/components/RecorderHistory.test.tsx` (feat-066 and feat-068 evidence both record class-level assertions), `web/src/components/DriveFileActions.test.tsx`, `web/src/components/AccountAccess.test.tsx`, `web/src/components/GoogleDriveConnection.test.tsx`.
- Exclude: the always-44px floating mobile capture button (`RecorderWorkflow.tsx:371`), which already matches the standard tier; the `page-grid` background utility (`styles.css:56-62`); the accepted indigo/violet identity (`AccountAccess.tsx:134-143`, `BrandLogo.tsx`) and the `min-height`-free anchors in `App.tsx` nav, which are navigation, not actions.

## Validation

- Product: an operator completes a record on a phone — capture, upload, complete — and opens, corrects and downloads evidence from the detail popup and viewer, with every primary control at least 44px and every compact control square and untouchable-by-accident.
- Interface: 320 / 360 / 390 / 430 / 768 / 1280 CSS px (feat-028's accepted widths) in both locales; measure the rendered box of the `sm` `View evidence` button, the viewer's icon buttons, the flag trigger (expected 24×40), one `Input` and one `Select` trigger, and the header row height; confirm no horizontal growth at 320px and that the mobile capture cluster (`RecorderWorkflow.tsx:371`) still clears the safe-area padding.
- System: heights are declared in exactly one layer per control (the primitives), with a documented call-site override for deliberate compactness; the previous `!important` pattern is gone and no parallel sizing helper appears.
- Repository: `cd web && npm run test` → all tests pass (update only assertions that encoded the old blanket 44px); `cd web && npm run typecheck` → clean; `cd web && npm run build` → succeeds; `./init.sh` → passes. Record the measurements and command output in the active feature's `evidence` field per `AGENTS.md`.

## Stop conditions

- Stop if raising the standard field tier to 44px makes the compact phone recorder form (`RecorderWorkflow.tsx:343-361`, feat-044) overflow or push the upload CTA below the fold at 320px — the 44px floor then needs the owner's confirmation rather than a local fix.
- Stop if the owner's "compact may be smaller" decision turns out to apply to the standard fields as well; that would invert the direction of change 3.
- Stop if `min-h-11` in the cva base cannot be overridden by a call-site `min-h-0` through `cn`; that means the merge order is a dependency and the primitive needs reworking, which is outside this plan.
- Do not combine this plan with a palette, spacing-scale or typography change; height ownership is the only decision here.

## Design documentation

- After acceptance and validation: record in `docs/ARCHITECTURE.md` (near line 18, the design-system paragraph) that control heights are owned by the primitives with a 44px standard tier and a declared compact tier, superseding the base-layer element minimum; record in `progress.md` that feat-028's 44px floor is now delivered by the primitives and that feat-050's 24×40 flag trigger renders as documented. Update the active feature entry in `feature_list.json` with the measured boxes as evidence.
