# Localize the record-detail popup and application shell chrome

Written against: `b176849`

## Evidence chain

- Surface: `web/` — `/archive` record-detail popup (`RecorderHistory.tsx`), signed-in Workspace new-record card (`RecorderWorkflow.tsx`), shared shell header/footer (`App.tsx`).
- Problem: with the accepted Vietnamese-default UI, these surfaces render English labels, buttons, section names and error/notice copy. Some of the exact strings already exist in the translation dictionary and are simply not passed through `t()`, so the same screen shows both languages.
- Design evidence:
  - `docs/PRODUCT_PLAN.md:69` — "The user primarily works on a phone and approved Vietnamese as the main UI language, with English switching."
  - `feature_list.json` feat-027 (done) acceptance: "Application labels, validation, errors, status, confirmations and accessible names use the selected locale"; its own evidence records "full remaining-copy audit" as an unfinished follow-up.
  - `docs/MOBILE_LOCALIZATION_DRIVE_PLAN.md:178` puts "copy, lỗi, badge, chi tiết activity" (copy, errors, badges, activity detail) inside the audit scope — the detail popup is not excluded.
  - `web/src/i18n.tsx:163` defaults to `vi`; `web/src/i18n.tsx:169` returns the source string unchanged when a key is missing. `t()` is already used in the same components around these lines, so the mixed-language result is the contradiction, not the mechanism.
- Owner: `web/src/i18n.tsx` `translations` map + `t()` from `useI18n()` is the single owner of application-owned interface copy.
- Scope and affected surfaces: `web/src/components/RecorderHistory.tsx`, `web/src/components/RecorderWorkflow.tsx`, `web/src/App.tsx`, `web/src/i18n.tsx`.
- Uncertainty: four strings need new Vietnamese values (listed in Changes as **new key**); everything else reuses an existing key. Also unverified here: how the focused tests pin locale — see Stop conditions.

## Design decision

Route every application-owned label, option, action name, section accessible name and notice in these surfaces through the existing `t()` / `translations` owner, reusing keys that already exist. This resolves the root problem — copy that bypasses the locale owner — instead of translating one screen at a time and leaving the same bypass in the next surface.

## Reuse

- `t()` from `useI18n()` (`web/src/i18n.tsx:169`, `:173`) and the existing `translations` map (`web/src/i18n.tsx:7-156`).
- Existing exemplar for a rendered value that must be resolved at display time: `web/src/components/RecorderHistory.tsx:87` stores English reason strings and `:249` renders `{t(error)}`.
- Keys already present and currently bypassed: `Operation`, `Reference`, `Occurred`, `Notes`, `Packing`, `Unpacking`, `Saving…`, `Save correction`, `Cancel activity`, `Delete activity`, `Audit trail`, `No corrections or lifecycle actions recorded.`, `This activity has no evidence files yet.`, `Unable to load activity detail.`, `Activity deleted. Some storage cleanup remains pending.`, `Activity and stored evidence deleted.`, `Unable to delete the activity.` (`web/src/i18n.tsx:132-153`).
- Exemplar for a localized option list inside a `Select`: `web/src/components/RecorderHistory.tsx:238`.

No new primitive is required.

## Changes

1. `web/src/components/RecorderHistory.tsx` — activity detail dialog body
   - Change: wrap the currently unwrapped copy in `t()` at these sites, keeping markup and props identical:
     - `:294` empty state `This activity has no evidence files yet.`
     - `:299` label `Operation` and both option children `Packing` / `Unpacking` (mirror `:238`)
     - `:300` label `Reference`; `:301` label `Occurred`; `:302` label `Notes`
     - `:303` submit label `Saving…` / `Save correction`
     - `:305` `Cancel activity` / `Delete activity`
     - `:308` `Audit trail`; `:309` `No corrections or lifecycle actions recorded.`
   - Change (render-time resolution): wrap `{actionError}` (`:270`, `:289`), `{actionNotice}` (`:271`, `:290`) and `{detailError}` (`:276`) in `t()` exactly as `{t(error)}` already is at `:249`, so keys resolve when the string is application-owned and provider text passes through unchanged.
   - Change: `:266` pagination `aria-label="Recorder history pages"` → `aria-label={t('Recorder history pages')}` — **new key**.
   - Change: `:295` placeholder copy `Evidence is ${asset.status.replace('_', ' ')}` and the bare `{asset.status}` in the asset meta line are user-facing English built from an API enum. Replace with one dictionary-owned phrase per asset state, using the existing enum→label pattern already used for activity status at `:262` (`t(status[0].toUpperCase() + status.slice(1))`). **new keys** for the asset states that have no entry yet (`ready`, `processing`, `uploading`, `failed`, `expired` as displayed).
   - Preserve: `name` attributes, form field ids, `defaultValue` content, API enums in payloads, user-entered references/notes/filenames, `aria-labelledby` values, and the `:298` form label which is already localized.
   - Verify: in Vietnamese, opening View evidence shows Vietnamese labels for Operation/Reference/Occurred/Notes, both option lists, Save correction, Cancel/Delete activity, Audit trail, the empty-audit line, the no-files state, and any action notice; switching to English restores each string.

2. `web/src/components/RecorderWorkflow.tsx` — new-record card
   - Change: `:97` stage map value `ready: 'ready'` becomes a dictionary lookup with a value that matches its five sibling entries in `web/src/i18n.tsx:142` (`'ready'` is currently **a new key**; suggested value `Sẵn sàng`, matching the `Sẵn sàng tải lên` style).
   - Change: `:336` `aria-label="New record steps"`, `:364` `aria-label="Add evidence"` (`:366` already uses `t('Add evidence options')`), `:385` `aria-label="Evidence upload status"` → route through `t()`; `Add evidence` already has a key (`web/src/i18n.tsx:138`), the other two are **new keys**.
   - Preserve: `:375` format string `JPEG, PNG, WebP, HEIC, MP4, MOV, WebM` (format identifiers, not prose), filenames, MIME values, and the localized preview-name strings built from user content.
   - Verify: a Vietnamese user sees a localized stage line for a finished upload and no English section names in the browser's accessibility tree for the capture and review regions.

3. `web/src/App.tsx` — shell
   - Change: `:71` `aria-label="Main navigation"` and `:103` `aria-label="Legal"` plus the two footer `<Link>` labels `Privacy Policy` / `Terms of Service` → route through `t()`; all four are **new keys** (`:103`'s sibling span already uses `t()`).
   - Preserve: brand string `LinhCj's` (`:102`) and route paths `/privacy`, `/terms`.
   - Verify: the footer legal links render in the selected locale and the header nav region is named in that locale.

4. `web/src/i18n.tsx`
   - Change: add only the new keys listed above to `translations`, placed next to the related existing group so the map's existing organization holds. Do not restructure or reorder existing entries.
   - Verify: `t()` returns a Vietnamese value for each key at `:169`; no key is added for a string that already exists.

## Scope

- Inherit: every consumer of the changed components — `/` Workspace, `/archive`, and the shared header/footer on all routes including `/settings`.
- Verify: `web/src/components/RecorderHistory.test.tsx` (`:88`, `:137`, `:141`, `:203`, `:215` query English accessible names), `web/src/App.test.tsx`, `web/src/components/RecorderWorkflow.test.tsx`.
- Exclude: `web/src/pages/LegalPage.tsx` — long-form legal content is owner-approved copy and must not be machine-translated by this change; `web/src/components/AccountAccess.tsx:150` `Email` and `:149` placeholder `warehouse.operator` are field/identity examples, revisit only with a stated decision; the indigo/violet login hero (feat-051) and logo palette (feat-040) are accepted identity exceptions and stay untouched.

## Validation

- Product: a Vietnamese-default operator records a handoff, opens it from the archive, corrects its metadata and reads its audit trail without seeing English application copy in the dialog or shell.
- Interface: both locales, before and after login, at 320 / 360 / 390 / 430 / 768 / 1280 CSS px (feat-028 acceptance); states: empty audit trail, no-evidence activity, expired evidence, failed upload notice, bulk-delete notice, pagination visible; long Vietnamese strings must not widen the meta line or break `truncate` on the title.
- System: all application-owned copy resolves through the one `translations` map; no second lookup table, per-component string constants, or inline conditionals on `locale` are introduced.
- Repository: `cd web && npm run test` → all tests pass; `cd web && npm run typecheck` → clean; `cd web && npm run build` → succeeds; `./init.sh` → passes. Record the command output in the active feature's `evidence` field per `AGENTS.md`.

## Stop conditions

- Stop if the focused tests run under the `vi` default while asserting English accessible names (`RecorderHistory.test.tsx:88`, `:137`, `:141`, `:203`, `:215`) — that would mean the test locale contract, not the components, governs these assertions, and widening the change into the test harness needs the owner's decision.
- Stop if any string listed as "already has a key" turns out to have no matching entry, rather than inventing a replacement value.
- Stop if localizing the asset-status copy at `RecorderHistory.tsx:295` requires an API or contract change; that is outside this plan.
- Stop if the change would need a new shared primitive; report instead of creating one.

## Design documentation

- After acceptance and validation: record in `progress.md` that feat-027's documented "full remaining-copy audit" is complete for the recorder detail dialog, new-record card and shell chrome, listing the added keys; note in `docs/MOBILE_LOCALIZATION_DRIVE_PLAN.md:178` that the activity-detail and badge audit items are done, with `LegalPage.tsx` explicitly still open. Add the work as one feature in `feature_list.json` with the test output as evidence.
