# Give the recorder UI a Custody Dossier identity (feat-073 brand-new visual system)

Written against: 8300b8f

Status: AS-BUILT (2026-10-11) — all seven increments applied and verified; see the feat-073 `evidence` field in `feature_list.json` and the 2026-10-11 entry in `progress.md`. Additions beyond this plan, made by the `better-interface` audit pass: global `prefers-reduced-motion` gate, `a:focus-visible` ring, completion-dialog and drawer focus-on-open with Escape on the workflow dialog, composed accessible name on the custom Select trigger, expired status remapped from Ledger Amber to Seal Crimson, `--default-transition-duration: 100ms`, static-card shadow removal, and 4 updated Group-B test assertions.

## Evidence chain

- Surface: the whole web client — shell (`web/src/App.tsx`), `/` RecorderWorkflow, `/archive` RecorderHistory, `/settings`, `/privacy` `/terms`, 404, auth forms (`AccountAccess.tsx`). Inspected at 1440x900 and 390x844, vi default.
- Problem: the current identity is a generic SaaS kit with surviving AI tells: glass header (`bg-background/90 backdrop-blur-xl`), a decorative `.page-grid` overlay in `<main>`, `bg-primary/10` rounded icon chips, an `indigo/violet/fuchsia/cyan` gradient hero with blur blobs on the sign-in surface, and `--font-sans` declaring "DM Sans" that is never loaded (`web/index.html` has no font link) so the app silently renders the system fallback. `BrandLogo.tsx` and several components hard-code `slate-*/emerald-*/amber-*` literals instead of tokens. `LegalPage.tsx` uses `prose` classes although `@tailwindcss/typography` is not installed.
- Design evidence: the product is a chain-of-custody evidence recorder (packing/unpacking handoffs, SHA-256 digests, audit events, retention). Its own data — reference IDs, digests, timestamps, lifecycle events — is documentary. A visual identity borrowed from document control (ink on paper, ledger rules, seals) expresses that job; the teal/cyan SaaS look expresses nothing.
- Owner: `web/src/styles.css` (tokens), `web/index.html`, `web/src/App.tsx` (shell), and the domain components listed under Changes.
- Scope and affected surfaces: presentation layer of every web surface. The API contract (`web/src/api.ts`), upload pipeline (`uploadMedia`, SHA-256, finalize/complete sequence), i18n approach (`web/src/i18n.tsx` dict), session persistence and all behavior are out of scope and must not change.
- Uncertainty: none on direction; contrast ratios to be formally measured with `better-colors` during implementation.

## Design decision

Adopt a brand-new identity, **"Custody Dossier"**: the UI reads as a printed evidence file — near-monochrome ink-on-paper structure with **color reserved exclusively for evidentiary state** (verified/in-custody/pending/tampered). One memorable element (the Custody Spine); everything else quiet and disciplined. Light mode only; no dark theme this round.

### Color (light-only; hex given, stored as oklch tokens in `:root`)

| Role | Name | Hex | Notes |
|---|---|---|---|
| foreground, solid primary action fill | **Custody Ink** | `#17211D` | near-black, green undertone; white label text ~14:1 |
| app background | **Paper** | `#EDEFEA` | cool gray-green, explicitly not warm cream |
| raised card / folio surface | **Folio** | `#FAFBF8` | borders Ledger Rule `#D7D9CF`, strong rule `#B6B9AB` |
| secondary text | **Faded Ink** | `#4C564F` | ≥5.5:1 on Paper |
| brand accent, verified/complete state | **Seal Green** | `#1F6B44` | seal/"cleared"; tint `#E2EEE6` for success chips |
| pending/uploading/draft | **Ledger Amber** | `#8A5A00` | tint `#F2E8CF`; attention, not error |
| destructive/expired/needs-attention | **Seal Crimson** | `#8E2B25` | tint `#F1DFDC`; white text on fill ≥4.5:1 |

Tokens map onto existing names (`--background`, `--card`, `--foreground`, `--muted-foreground`, `--primary`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`) so primitives keep working. `--ring` = Seal Green for focus visibility on both Paper and Ink fills. Status hues are always paired with text/icon, never color alone.

### Type

- **Sans — Be Vietnam Pro** (400/500/600/700/800): UI, body, headings; chosen because it is engineered for Vietnamese diacritics and is not the Inter/DM-Sans/Geist default. `--font-sans: "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif`.
- **Mono — IBM Plex Mono** (400/500, `tabular-nums`): reserved for documentary data only — reference IDs, SHA-256 digests, timestamps, page counters, retention-days value. Never for field labels or prose.
- Self-hosted via `@fontsource/*` imported in `styles.css` (offline field use; no third-party font request leaking operator IP; hash-pinned woff2). No Google Fonts link.
- Scale (~1.2 minor third, `@theme --text-*`): xs .75 / sm .875 / base 1 / lg 1.25 / xl 1.5 / 2xl 1.875 / 3xl 2.375 rem. Body `leading-6/7`, headings `leading-tight`, display tracking `-0.02em`. No `text-transform` on translated strings (feat-072 invariant); no tracked ALL-CAPS eyebrows on new surfaces.

### Signature element — the Custody Spine

One node-and-rule motif that fuses the recorder's 3-step stepper and the archive's audit trail into the same graphic language, because both are literally the chain of custody of one package. Done node: filled Seal Green circle + check; current: ink ring + `aria-current="step"`; upcoming: hollow; nodes carry mono timestamps/labels. Horizontal variant = new-record stepper; vertical variant = audit trail. Supporting moves: solid Paper header with a single bottom hairline and a short Seal Green underline on the active nav item (replaces glass); no page-grid; icon chips replaced by hairline-boxed glyphs or mono numerals; restrained radii (`--radius` 8/6/4 — no `rounded-2xl/3xl` everywhere); corner "seal tag" (Seal Green) on completed records.

### Layout

Left-aligned content, centered only for the sign-in gate and completion dialog. Dossier card = Folio surface, 1px rule border, sectioned by hairlines rather than shadow stacks. New-record keeps the 50/50 `lg` split (details | drop zone) and mobile two-up field grid from feat-072 — the responsive intent is preserved, only the naming/scale changes. Archive detail becomes a right-side "dossier drawer" (same `role=dialog` invariants).

### Motion

≤120ms state transitions; none on hover-scale; single orchestrated reveal per surface (drawer/dialog open), all gated by `prefers-reduced-motion`. No fade-and-slide-up section entrances.

### Cliché critique (self-review before build)

- Not warm-cream+serif+terracotta: Paper is a cool gray-green, sans is a Vietnamese grotesque, accents are seal green/crimson, no serif anywhere. Revised once already (initial `#F1F1EC` was too close to `#F4F1EA`).
- Not teal/violet SaaS gradient: no gradient on any surface; primary is ink.
- Not broadsheet (zero-radius dense columns) — cards keep 8px radius and generous measure.
- Numbering `1·2·3` appears only on the stepper and audit trail, which genuinely are sequences.
- Mono appears on data strings only, not as the "small mono label" decoration tell; no `→` suffixes on links/buttons; no ALL-CAPS eyebrows added.

## Reuse

- Existing token names in `web/src/styles.css` (`:root` + `@theme inline`) — components already consume `bg-background`, `text-muted-foreground`, `Badge statusVariant`, `buttonVariants`; the flip is mostly token-level.
- feat-072 invariants stay in force: control heights owned by primitives (`min-h-11` / sm 36 / icon 40), single `Badge` status presentation, `Intl` via `useI18n().locale`, real stepper semantics.
- `CustodySpine.tsx` (new, `web/src/components/`) renders the same `<ol aria-label>` + `<li aria-current="step">` + done-check `<svg>` structure the existing RecorderWorkflow test asserts, and is reused vertically in the audit trail.
- `DeferredPage` mount-retention pattern, `#header-profile` portal anchor, Escape ladder, focus-return — all preserved verbatim.

## Test-coupling map

- **(A) Preserve exactly** (behavior/accessible-name assertions across the 13 colocated tests): link names Workspace/Evidence archive/Settings; buttons `Open profile`, `Sign out`, `Review complete · Upload`, `Complete record`, `Reset form`, `Take photo`, `Record video`, `Choose files`, `Remove <file>`, `Refresh storage`, `Start another record`, `View evidence`, `Filters`, `Clear search`, `Clear all filters`, `Previous`, `Next`, `Retry`, `Open viewer/Close detail/Close viewer/Zoom in/Zoom out/Save correction/Cancel activity/Delete activity/Delete selected/Keep/Confirm/Copy Drive link/Open in Drive/Download original`; labels `Storage`, `Operation`, `Reference`, `Notes`, `Evidence files`, `Search order or shipment reference`, `Occurred from/to`, `Select all`; roles headings `Sign in`, `Recorded handoffs`; forms `Filter recorder history`, `Correct activity metadata`; navs `Recorder history pages`, `Legal`, `Main navigation`; statuses `Loading your workspace`, `Restoring session…`; `list` `New record steps` + `aria-current` + done `<svg>`; dialog names by reference / `Evidence viewer` / `Activity detail`; texts `Drop evidence here or choose files`, `Review selected evidence`, `Submitted evidence`, `Evidence record completed and secured.`, `Page X of Y`; testids `activity-detail-backdrop`, `bulk-delete-backdrop`; `#record-photo`/`#record-video`; `.overflow-y-auto` region containing the metadata form but not the Close button; `#header-profile` presence when signed in.
- **(B) May change — update the test, keep the responsive intent**: `size-9 sm:w-auto` nav classes, `hidden sm:inline`, `gap-1 sm:gap-2`, `.grid.grid-cols-2 gap-3 lg:grid-cols-1`, Notes `h-20 sm:h-auto sm:min-h-24`, drop label `min-h-32 sm:min-h-44 py-4 sm:py-7`, detail `max-h-[calc(100dvh-1.5rem)] max-w-5xl overflow-hidden flex flex-col`, header `py-3`, login `min-h-[calc(100dvh-9rem)] items-center justify-center` + `max-w-lg`, Password `minLength=6`.

## Changes

Seven increments, each ending with `npm run test --prefix web` + `npm run typecheck --prefix web` + `npm run build --prefix web` green:

1. **Tokens + fonts** — rewrite `:root`/`@theme` in `web/src/styles.css` to the palette/scale above; `@import` `@fontsource/be-vietnam-pro` + `@fontsource/ibm-plex-mono`; delete `.page-grid`; `theme-color` + inline bg in `web/index.html`; add deps in `web/package.json`. No test expected to break.
2. **App shell** — `App.tsx`: solid header, bottom hairline, Seal Green active underline, remove glass + grid overlay; keep DeferredPage/portal anchor/aria names. Recolor `BrandLogo.tsx`, re-paper `SessionLoadingSkeleton.tsx`.
3. **RecorderWorkflow + CustodySpine** — new `CustodySpine.tsx`; rewrite workflow JSX/classes (dossier card, dashed-hairline drop zone, mono review list); upload/DnD/state logic byte-for-byte unchanged.
4. **RecorderHistory + ArchivePage** — list/filters restyle; detail → dossier drawer (dialog invariants kept); audit trail via vertical CustodySpine.
5. **Remaining surfaces** — Settings (mono days field), GoogleDriveConnection/DriveFileActions token recolor, LegalPage hand-authored prose styles (replace no-op `prose`), NotFoundPage, AccountAccess dossier header (remove gradient hero + blur blobs; keep region/labels/portal).
6. **Audit pass** — `better-interface` (+ targeted better-accessibility/colors/typography/layout) across the client; fix ranked findings.
7. **Close-out** — grep sweeps for retired literals (`backdrop-blur|page-grid|bg-primary/10|slate-9|indigo-|violet-|fuchsia-|cyan-|emerald-|from-.*to-`), fill feature evidence per AGENTS.md.

## Scope

- Inherit: every web surface at 1440 and 390, vi and en, signed-in and signed-out.
- Exclude: backend and API contract; dark mode; `i18n.tsx` dict restructure (add vi+en entries only for genuinely new strings); pre-existing untranslated archive `actionNotice` literals; feat-018.
- Stop conditions: stop any increment if preserving group-(A) names/roles in the new markup is impossible (contract conflict beats restyle); stop if `@fontsource/be-vietnam-pro` does not exist upstream (fallback: `@fontsource-variable/…` or npm-verified equivalent, record substitution); stop if `DeferredPage` + drawer restructure cannot coexist with Escape-ladder tests.

## Validation

- Product: a store operator recording a handoff sees a document-control surface — one ink primary action, one custody spine showing where the record stands; statuses are the only color on screen. Vietnamese copy renders with correct diacritics on the loaded font (not fallback).
- Interface: screenshot matrix — 5 surfaces × 1440/390 × vi/en × fresh/staged/uploading/completed states + drawer/viewer/bulk flows; keyboard tab order, Escape ladder, focus return, reduced-motion pass; AA contrast via `better-colors`.
- System: `api.ts`/`config.ts`/`sessionUserStore.ts`/`i18n.tsx` structurally untouched; no new UI dependency beyond `@fontsource/*`.
- Repository: web test suite green (updated group-B assertions documented), typecheck + build green, `./init.sh` restartable.

## Design documentation

- After acceptance: record the as-built identity (final hexes, font loading result, any substitutions) in this file's "As-built" section and in feat-073 `evidence` in `feature_list.json`, per AGENTS.md.

## Revision 1 — feat-074 (2026-10-11, user feedback: "tone màu hơi tối", "tiếng Việt ko tự nhiên")

### Palette lightening (identity kept, values lifted)
The as-built Paper `oklch(0.9493 0.0072 126)` read as dirty gray-green and Custody Ink `0.2366` was near-black on the login hero. New values, same token names:

| Token | Before | After | Hex |
| --- | --- | --- | --- |
| --background (Paper) | 0.9493 0.0072 126 | **0.976 0.005 126** | #F6F8F4 |
| --card / --primary-foreground (Folio) | 0.9866 0.0044 125 | **0.993 0.004 125** | #FCFDFA |
| Custody Ink (fg/primary/secondary-fg) | 0.2366 0.0163 168 | **0.30 0.020 168** | #24312C |
| --secondary | 0.9218 | **0.950 0.006 123** | #EEEFEB |
| --muted | 0.9339 | **0.958 0.006 123** | #F0F2ED |
| --accent / --seal-tint | 0.938 0.0169 | **0.955 0.013 157** | #E9F3ED |
| --ledger-amber-tint | 0.9324 | **0.950 0.028 89** | #F6EEDA |
| --seal-crimson-tint | 0.9174 | **0.945 0.016 30** | #F7E9E7 |
| --border, --input, --ring, --muted-foreground, state hues | unchanged (they read lighter against the lifted paper; input affordance 1.96 vs card, border hairline 1.40) |

Measured contrast (oklch→sRGB, WCAG): ink on bg 12.67 / on card 13.26; Faded Ink ≥6.6 on bg/card/muted/secondary; seal-on-tint 5.71, amber-on-tint 5.13, crimson-on-tint 7.05 (all AA); Folio-on-Ink button text 13.26. `index.html` theme-color and inline background → #F6F8F4.

### Vietnamese naturalness ruleset (values only; EN keys are the source of truth)
1. No English passive calques ("được liên kết với" → "gắn với"); prefer verb-final capability forms ("xem … được", "dùng được").
2. Cut `được/rằng/của bạn` chains; Vietnamese UI copy drops the possessive when context owns it.
3. "Bộ nhớ" is device memory — storage is "Lưu trữ".
4. Pagination/connectors as Vietnamese sites write them: "Trang 1 trong 3", "Đang đăng nhập: X".
5. Short verb-first CTAs and status strings; keep test-pinned natural values untouched.
6. Numbers/units/diacritics standard northern orthography; no `text-transform` (feat-072 invariant).

Copy rewrites land in `i18n.tsx` values; where a rewritten string is asserted in a colocated test, value + assertion change as one pair (pinned map in the feat-074 plan; all pinned strings were judged natural and are kept).
