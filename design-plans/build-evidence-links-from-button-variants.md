# Build the evidence and Drive links from the Button variant contract

Written against: `b176849`

## Evidence chain

- Surface: `/archive` record-detail popup and evidence viewer (`web/src/components/RecorderHistory.tsx`), Drive file actions (`web/src/components/DriveFileActions.tsx`) — reached from the archive detail asset row (`:295`), the viewer footer (`:321`), and the new-record completion dialog (`RecorderWorkflow.tsx:399`).
- Problem: three link controls that share an action row with a `Button` carry their own hand-written class list instead of the button contract, so peer controls in the same row differ in corner radius, border color, shadow and focus treatment.
- Design evidence:
  - `web/src/components/ui/button.tsx:6-21` `buttonVariants` is the owning contract: base `rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`; `size.sm` = `h-9 rounded-md px-3`; `variant.outline` = `border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground`.
  - The three anchors declare `inline-flex min-h-11 items-center … rounded-lg border px-3 text-sm font-semibold hover:bg-accent`: 8px radius against the `sm` sibling's `rounded-md` (6px), the bare `border` color `--border` (`web/src/styles.css:37`, `oklch(0.9 …)`) against the variant's `--input` (`:38`, `oklch(0.86 …)`), no `shadow-sm`, `bg-background` absent, and no `focus-visible` ring.
  - Each anchor sits in the same flex row as a `<Button size="sm" variant="outline">`: `RecorderHistory.tsx:295` (next to `Open viewer`), `DriveFileActions.tsx:30` (next to `Copy Drive link`); `RecorderHistory.tsx:321` is the same control family in the viewer footer.
  - `docs/ARCHITECTURE.md:18` records that the design system "preserves … keyboard focus treatments", and the missing ring on these anchors is the one documented property they do not carry.
  - The codebase already owns the link-as-button shape: `web/src/pages/NotFoundPage.tsx:4,14` applies `buttonVariants({ className: 'mt-8', size: 'lg' })` to a `<Link>`.
  - `web/src/lib/utils.ts` `cn` is `clsx` + `tailwind-merge`, and `button.tsx:26` shows the merge order the links must copy: `cn(buttonVariants({ className, size, variant }))`.
- Owner: `buttonVariants` (`web/src/components/ui/button.tsx:6-21`), consumed through `cn`.
- Scope and affected surfaces: `web/src/components/RecorderHistory.tsx:295`, `:321`; `web/src/components/DriveFileActions.tsx:30`.
- Uncertainty: none on appearance. The anchors must keep their own `min-h-11` because `web/src/styles.css:47` applies `min-height: 2.75rem` to `button` elements only — removing it would make these links render 36px beside 44px buttons. See Exclude.

## Design decision

Express those three links with `buttonVariants` instead of a parallel class list, keeping only the row-specific utilities each one genuinely needs. This removes a second, unofficial button styling that has grown next to the primitive, so radius, border tone, shadow and focus ring stay owned in one place.

## Reuse

- `buttonVariants({ size: 'sm', variant: 'outline', className })` — `web/src/components/ui/button.tsx:6-21`.
- `cn` — `web/src/lib/utils.ts`, used the same way as `web/src/components/ui/button.tsx:26`.
- Exemplar: `web/src/pages/NotFoundPage.tsx:4,14`.

No new primitive, variant or token is introduced.

## Changes

1. `web/src/components/RecorderHistory.tsx:295` — per-asset download link
   - Change: replace the literal `className` with `cn(buttonVariants({ size: 'sm', variant: 'outline', className: 'min-h-11 shrink-0' }))`; add `import { cn } from '../lib/utils'` and bring `buttonVariants` into the existing `./ui/button` import (`:20`).
   - Preserve: `href={getMediaAssetContentUrl(asset.id) + (selected.storageProvider === 'google_drive' ? '?download=1' : '')}`, the `download` attribute, the `sr-only` `t('Download original')` label, and the `flex gap-2` row with the adjacent `Open viewer` button (`:295`).
   - Verify: the download link and `Open viewer` share corner radius, border tone and elevation, and the link shows the same `ring-2 ring-ring` focus treatment when reached by keyboard.
2. `web/src/components/RecorderHistory.tsx:321` — viewer footer download link
   - Change: same substitution, with `className: 'min-h-11 gap-2'` retained so the icon and the visible `Download original` label keep their spacing.
   - Preserve: the viewer's `?download=1` branch on Drive records, the `download` attribute, and the footer's `justify-between` with the position counter (`:321`).
   - Verify: the footer link matches the ghost icon buttons in the viewer header (`:319`) on radius and border tone, and the footer row height is unchanged.
3. `web/src/components/DriveFileActions.tsx:30` — `Open in Drive` link
   - Change: same substitution, with `className: 'min-h-11 gap-2 whitespace-nowrap'`; add the `cn` import and use the existing `Button` import path (`:5`) for `buttonVariants`.
   - Preserve: `href={getMediaAssetDriveOpenUrl(assetId)}`, `target="_blank"`, `rel="noopener noreferrer"`, the label copy, and the `flex flex-wrap gap-2` row with `Copy Drive link` (`:28-31`).
   - Verify: the two Drive actions read as one control pair on phone width when they wrap, and the link's external-target behavior is unchanged.

## Scope

- Inherit: the archive detail popup, the nested evidence viewer, and the new-record completion dialog (`RecorderWorkflow.tsx:399` renders `DriveFileActions`).
- Verify: `web/src/components/DriveFileActions.test.tsx` and `web/src/components/RecorderHistory.test.tsx` (feat-064 and feat-030 assert these controls' behavior); the long-filename case in the asset row; the mobile archive detail layout recorded in feat-068.
- Exclude: `web/src/styles.css:47`'s blanket `button { min-height: 2.75rem }` and the `!min-h-0` / `h-auto min-h-10` patches at `AccountAccess.tsx:109`, `RecorderHistory.tsx:319-320`, `GoogleDriveConnection.tsx:40-41`, `i18n.tsx:178` — that is a separate control-sizing decision about which heights the product wants, and this plan must not preempt it. Also excluded: `web/src/App.tsx` header nav links and `LegalPage.tsx` text links, which are navigation rather than action controls.

## Validation

- Product: an operator downloads original evidence and opens a Drive file from the archive and the viewer, with the controls reading as one family and remaining keyboard-reachable.
- Interface: both locales; 320 / 360 / 390 / 430 / 768 / 1280 CSS px; a Drive record and a B2 record; a long filename that truncates in the asset row; keyboard-only focus traversal of the viewer footer and the Drive action pair; `target="_blank"` and `download` behavior unchanged.
- System: link-styled controls use the button primitive's variants; no fourth hand-written button class list remains in these surfaces.
- Repository: `cd web && npm run test -- DriveFileActions RecorderHistory` → passes; `cd web && npm run test` → full suite passes; `cd web && npm run typecheck` → clean; `cd web && npm run build` → succeeds; `./init.sh` → passes. Record output in the active feature's `evidence` field per `AGENTS.md`.

## Stop conditions

- Stop if applying `buttonVariants` changes any rendered height (a row whose link no longer matches its button sibling) — that means the control-sizing decision is entangled and needs the owner's direction, not a local workaround.
- Stop if `cn` + `buttonVariants` cannot express a link's needed spacing without adding a new variant; report rather than extending the primitive.
- Stop if a test asserts these anchors' literal class strings; that would make the class list a contract and this plan needs the owner's approval to change it.

## Design documentation

- After acceptance and validation: record in `progress.md` that action links render through `buttonVariants` and that `web/src/pages/NotFoundPage.tsx` remains the navigation-link exemplar. No `docs/ARCHITECTURE.md` change; its line 18 statement about the source-owned primitives already covers this.
