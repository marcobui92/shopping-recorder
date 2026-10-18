# Media Editor Plan — pre-upload image editing

Status: approved direction, not implemented. `feat-076` (image editor) and `feat-077`
(video trim) are tracked in `feature_list.json` as `not-started`.

## 1. Product decision

The editor sits between capture/file-selection and upload. **What the user confirms in the
editor is the file that gets uploaded** — rotate, crop, filters, text, arrows, compression.

Approved trade-off (user, 2026-10-11): the untouched source is **not** retained. Cropping an
image removes those pixels permanently and there is no path back if a dispute arises later.
This was presented explicitly and accepted: an edited evidence photo is whatever the user
decided they wanted to show.

Consequences that this decision removes (they are no longer in scope):

- no `source_asset_id` / rendition rows / derivation column;
- no double upload per picked file, so `media_upload_attempts_active_idx` (one active attempt
  per asset) and the 30 mutations/min recorder limit stay as they are;
- no change to `media_cleanup_jobs`, `discarded_at`, or the 30-day retention sweep;
- no storage doubling, no toggle in the UI, no "which version is the record" ambiguity in
  `RecorderHistory`.

## 2. Architectural consequence: backend is not touched

`POST /api/v1/recorder-activities/{id}/media-assets` binds `sizeBytes` and `sha256` declared by
the browser, and `finalize` re-hashes the exact B2 object version plus magic-byte-sniffs the
stored bytes (`backend/src/storage/s3.ts`). The backend verifies *that the stored bytes match
what the client declared*; it has no opinion about how those bytes were produced.

Therefore the editor replaces the selected file in `RecorderWorkflow.tsx` state with the edited
`Blob` before `sha256()` → `createMediaAsset` → `uploadMedia` → `finalize`. No endpoint,
migration, environment variable, or storage-adapter change is in scope for `feat-076`.

Verified against source (2026-10-11), not from the summary: `validateMedia`
(`backend/src/recorder/service.ts`) only checks the `contentType` allowlist and the size cap, and
the route schema bounds `originalFilename` at 1–255 characters with no pattern — so an
`…-edited.jpg` output name is accepted and the "backend untouched" conclusion holds.

### 2.1 What the state swap actually touches

`FileItem.file` is typed `File`, and `name`/`lastModified` are load-bearing in four places, so
"swap `File` for `Blob`" is really a small item-shape refactor (`web/src/components/RecorderWorkflow.tsx`):

- duplicate warning compares `name` + `size` + `lastModified` (`:227`);
- the item `key` is derived from the same three (`:228`);
- `contentType`/`mediaType` are spread from `describeMedia` at selection time and reused at
  upload (`:228`, `:275`) — editing a `image/heic` input to `image/jpeg` output **must overwrite
  `item.contentType`**, otherwise the declared type no longer matches the stored bytes and
  `finalize` fails `UPLOAD_VERIFICATION_FAILED`;
- `originalFilename` is sent from `item.file.name` (`:275`) and `EvidencePreview` labels use it
  (`:129`, `:132`).

So `FileItem` becomes `{ blob: Blob; name: string; … }`, and `sha256` (`:92`),
`uploadMedia` (`web/src/api.ts:285`) and `EvidencePreview` widen from `File` to `Blob` — all three
only use `arrayBuffer()`/`size`/`type`/object-URL, which `Blob` provides.

Two consequences to decide, not discover mid-implementation: the edit action must **replace the
item in place** instead of re-entering `selectFiles` (which re-runs `describeMedia` and the
duplicate warning, both written for `File` input), and an edited item's new name means the
duplicate warning no longer recognizes it as a re-selection of the same source photo.

One real contract detail: for an edited asset, the declared `contentType` and
`originalFilename` describe the **output**, while `describeMedia` validation still runs against
the **input** file (an iPhone `image/heic` becomes an `image/jpeg` output). The output must
still pass server re-detection, so the encoder and the declared type must agree.

## 3. Platform rules (Safari/iOS is a first-class target)

iPhone Safari is the primary capture device for this product, so these are constraints, not
preferences. Recorded because each one has a failure mode that is invisible in logs:

1. **Never `CanvasRenderingContext2D.filter`.** Not implemented in Safari on iOS. Filters must
   come from a library that implements its own pixel pipeline — Konva ships
   `Konva.Filters.Brighten/Contrast/Saturation/Blur/Grayscale`, which work on every engine.
   This is why the earlier "hand-write a WebGL shader" idea was dropped.
2. **Never `OffscreenCanvas`** for the bake path. Use an ordinary `<canvas>`; the bake runs once
   at export, so a worker buys nothing and OffscreenCanvas support on iOS is the shakier API.
3. **Never rotate with `createImageBitmap(blob, { rotation })`.** Safari has historically
   accepted the options dictionary while ignoring it. Rotate by drawing — since revision 1 the
   Konva `Group` wrapping the image node carries the quarter-turn, which is the same "draw it,
   don't ask the decoder" rule one level up. This also means the crop library's own export helper
   is not used (see §5).
4. **Cap the working canvas at 4096px on the long edge and 16M px in area.** iOS Safari enforces a
   maximum canvas area and an oversized canvas can silently render blank or be dropped under
   memory pressure. iPhone photos are 12–48MP, so the cap is mandatory, and it doubles as the
   "compress" feature. The edge cap alone is not enough: a 5000x5000 source clamps to exactly
   4096x4096 = 16,777,216 px, which *is* the ceiling with no headroom, and the frame is alive in
   three canvases at once (working canvas + Konva's cache scene + its filter copy).
5. **HEIC asymmetry.** Safari decodes HEIC, Blink-based browsers on Android/Windows do not.
   Feature-detect by attempting the decode; on failure hide the "Sửa" action and upload the
   original unmodified. Editing on iPhone converts HEIC → JPEG as a side effect, which is an
   improvement for later viewing.
6. `init.sh` runs production dependency audits and Pintura-style editors are not on public npm —
   see §5 for why installing `pintura` would be a mistake.

## 4. Interaction shape

**The whole photo, with a selection box on it** (revision 2, amended for the pencil in §12 and for
where marks may live in §13; the window-model revisions this section previously specified are
recorded in §9/§10 and were rejected by the user testing them:
*"thừa toggle Frame/marks … có ô frame để kéo xong ok thì crop"*).

The Konva `Stage` is the photo, not a window into it. It is contain-fitted to the holder and never
upscaled, so all of the image is on screen at once. Framing is a rectangle the user drags and resizes
on top of it and then confirms — the model every camera app uses. There is no view zoom and no
framing/marks mode toggle: a smaller box *is* the zoom, and the box and the marks are different
objects, so both can be directly manipulable at the same time. The one toggle left is `Bút vẽ`
(§12), and it is a different kind of thing: freehand drawing owns the pointer for the duration of a
gesture, so it cannot coexist with grabbing a mark, whereas framing and marking can.

- `frame = frameFor(source.size, rotation)` — the axis-aligned box the rotated photo occupies, in
  source px. `scale = fitScaleFor(frame, holder) = min(1, min(holder.w/frame.w, holder.h/frame.h))`,
  `stage = stageSizeFor(frame, scale) = floor(frame × scale)`.
- The crop rect and every mark are stored in **source px**. A holder resize therefore remaps
  nothing — it only changes the drawing — and the export lands back on the source grid. Rotation is
  the one operation that moves them, and it moves them with the pixels they cover.
- Mark type sizes derive from the crop rect in source px (`fontSize = max(12, rect.h × 0.09)`,
  stroke `× 0.015`), so a mark keeps the same share of the *finished file* whatever the box size or
  the screen.
- Layer stack, topmost hit wins: cached photo → dim mask (`listening={false}`, four `Rect`s rather
  than `clipFunc` or a blend mode, because the mask sits above a cached node and `destination-out`
  is the thing most likely to misrender on iOS Safari) → crop `Rect` with its own `Transformer` →
  marks with theirs. Both transformers use `anchorSize={28}` — a Konva anchor is a real `Rect`, so
  that number *is* the finger hit area.
- Aspect presets: `Nguyên khung`, `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `Tuỳ chọn`. Picking a ratio
  refits the box about its own centre; `Tuỳ chọn` unlocks `keepRatio` and all eight anchors, while a
  locked ratio keeps only the four corners, because an edge anchor cannot respect a ratio.
- Export screenshots the stage with the chrome layer hidden:
  `stage.toDataURL({ x, y, width, height, pixelRatio: 1/scale })` on the rect rounded to integer
  stage px → `floor(rect / scale)` source px, so the file is at source resolution. The node's own
  scale times the export ratio is exactly 1, which is what keeps the image cache sampled 1:1.
- Keyboard parity without a pointer: the focusable holder keeps `role="group"` and `tabIndex={0}`;
  `Shift`+arrows always resize the crop box — `Shift` means "the box", so a selection does not take
  the shortcut away (§13) — while plain arrows move the selected mark, or the box when nothing is
  selected; `Escape` exits pencil mode, then deselects, and only then reaches the dialog's own
  dismiss.
- **Marks belong to the photo, not to the box** (§13). A label or a stroke is clamped to the frame,
  so it can be drawn anywhere on the image, and whatever of it falls outside the crop is cut exactly
  like the pixels underneath it. Ink outside the box stays painted — the marks layer sits *above* the
  dim mask and carries no clip — because the user has to be able to see and grab what they drew;
  moving the mask above the marks would hide it and let the transparent crop `Rect` steal the hit.
  `Cắt ảnh` bakes the box into the photo, and a mark lying wholly inside the dimmed area is dropped
  there rather than translated, since the new photo cannot contain it.
- **An accepted crop is undoable** (§14). `Hoàn tác cắt` appears in the footer as soon as there is a
  bake to pop, and restores the previous base, box, turn, preset and mark list. The base is rebuilt by
  replaying the remaining steps from the pristine bytes — the same path a re-open uses — so an undo
  costs a redraw and never a second full-resolution canvas, which matters on the 48MP photo §3 warns
  about. The footer row sets the sheet's width, so below `sm` the button keeps its accessible name and
  loses its label: with the label shown it pushed the panel to 504px on a 390px screen.
- **`Bỏ mọi thay đổi` puts the sheet back to the photo as it was picked** (§15) — bakes, marks, turn,
  preset and sliders — while the editor stays open, because before it the only way back was `Hủy`,
  which closed the sheet too. It appears only while the edit is non-empty (the same `hasEdits`
  question `Lưu ảnh đã sửa` asks, so it can never offer to throw away an untouched photo) and it
  touches nothing outside the editor: the file in the list keeps its bytes, hash and preview.
- The footer wraps instead of widening. Four labelled buttons need ~510px and a 390px screen is the
  product's primary target, so the row is `flex-wrap` with `ml-auto` on the action group: two 44px
  lines at 390, one line at 1440, panel width 388px in both states, nothing past the panel edge.

The pre-edit blob is kept in memory for the session only, so "Sửa lại" re-encodes the source once
rather than the already-compressed output, and it never leaves the device.

**Accepted tradeoff.** With no view zoom, a 48MP photo is displayed roughly 356px wide on a phone,
so the box is placed on a small preview. That is the normal cost of the box model and was chosen
deliberately; the 28px anchors and the `Shift`+arrow resize step are what make it usable on a finger
screen.


## 5. Library evidence (npm registry, 2026-10-11)

| Package | License | State found | Verdict |
|---|---|---|---|
| `react-easy-crop` | MIT | v6.2.4, single dep (`normalize-wheel`) | used for the two-pass revision, **removed in revision 1** — the stage is the crop window now, so nothing needs a second framing library |
| `konva` | MIT | v10.7.1, zero deps, own filter pipeline | the whole editor: framing, marks and filters |
| `filerobot-image-editor` | MIT | `latest` = **5.0.0-beta.159**, no stable v5; pulls `react-konva@19` + `styled-components@5` | rejected: beta as `latest` in the evidence path, and a second styling system to override against the Custody Dossier tokens (`feat-073`/`075`) |
| `tui-image-editor` | MIT | 3.15.3, pinned to `fabric@^4.2.0` | rejected: stale canvas dependency |
| `pintura` | — | 0.3.10 — an unrelated abandoned Node package (`ws@0.4`, `formidable`, `rql`) | **do not install**; the real Pintura Image Editor is commercial (€749/dev/yr) and not on public npm |
| `pictureeye` | — | 404 on public npm | commercial distribution only |

Peer deps are compatible: `web/` is on `react`/`react-dom` `^19.2.8` and Konva 10 supports it.
The editor must be lazy-loaded (`React.lazy`) so the capture flow keeps its current first-load
cost on mobile.

## 6. Testability constraint

`web/` tests run Vitest + jsdom, which has no real canvas 2D context. Everything that is not
pixel output must live in pure modules so it is unit-testable — export-geometry math (crop rect
in source pixels, rotation dimension swap, 4096 clamp), output-mime/filename derivation, editor
state reducer, and the capability probe result shape. Rendering correctness is proven on
devices, not in jsdom, and the version numbers in §3 must be confirmed on real hardware before
they are cited as settled.

## 7. Video (deferred, `feat-077`)

`trim` and `speed` were in the original wish list. Speed and burned-in markup require
re-encode; trim does not.

- **Trim only, no re-encode** (demux → copy samples → remux) is the operation immune to the
  codec mess below and keeps `feat-076`'s "no backend change" property. Candidate
  implementation is `mediabunny` (MIT, zero-dependency TypeScript on WebCodecs, MP4/WebM
  read/write, no COOP/COEP requirement — important because enabling cross-origin isolation would
  jeopardise the B2 direct PUT and the version-pinned 307 signed GET used by the viewer).
  `ffmpeg.wasm` is ruled out: the multithreaded build needs `SharedArrayBuffer`.
- **The asymmetry to probe, not assume**: iPhones record HEVC/H.265, often 10-bit HDR, and
  Chrome cannot decode or encode HEVC. The same clip can edit on iPhone and fail on Android.
  Detection must therefore be per-codec on the actual file —
  `VideoDecoder.isConfigSupported()` / `VideoEncoder.isConfigSupported()` — never by user agent.
- `feat-077` is blocked on that device probe plus a measured re-encode time for a real
  multi-hundred-MB clip (server cap is 500 MiB video). If trim-only remux proves portable, video
  stays in the browser; if heavy ops are required later, a backend FFmpeg pipeline becomes a
  separate decision requiring approval (async job, no precedent for a queue in this codebase,
  and it breaks the client-declared-hash contract).

## 8. Open items before implementation

1. Physical Safari-iPhone + Chrome-Android QA is still an open gap repeated throughout
   `progress.md`; `feat-076` must not be marked done without it, because every risk in §3 is
   Safari-specific and invisible to jsdom.
2. Confirm Konva's `Transformer` touch ergonomics on a small phone screen for stacked text +
   freehand pencil annotations.
3. Fix output quality/cap values by measuring real uploads against the 25 MiB image limit rather
   than guessing.

## 9. Implementation record (2026-10-11, feat-076)

Built to §1–§7. Two things §4 called for are now proven rather than assumed, and one was
implemented differently:

> **Superseded by §10 on 2026-10-12.** Items 1 and 2 below describe the two-pass
> `react-easy-crop` build, which revision 1 deleted. They are kept because item 2 is the record of
> a silent no-op that only running the app found. Item 3 (`File`, not `Blob`) still stands.

1. **Re-edit reads the pristine bytes (§4, confirmed).** The editor is always fed
   `FileItem.preEdit ?? file`, where `preEdit` holds the pre-edit blob for the session only —
   never hashed, uploaded or persisted. Measured: after edit 1 turned a 1200x900 source into a
   900x900 file, reopening reported `img.reactEasyCrop_Image` naturalWidth 1200x900, so the second
   save re-encodes the source once, not the output. Two departures from §4's wording: the affordance
   is the same pencil action as the first edit rather than a distinct "Sửa lại" label, and it
   reopens **pass 1** (framing), not pass 2, so the user can also re-crop. The filename stays
   `seal-edited.jpg` instead of growing a second `-edited` suffix.
2. **The crop really reaches the bake (§4, after a fix).** `react-easy-crop` passes percentages as
   the *first* `onCropComplete` argument; the pixel rect was being fed into `normalizeCrop`, which
   clamped it to the full frame — cropping and every aspect preset were silently inert, and a
   rotation-only edit baked the whole rotated frame. Found only by running the app: a 1:1 crop of a
   1200x900 source now yields an 880x880 markup stage instead of the previous 880x660 full frame.
3. **`File`, not `Blob` (§2, cheaper).** §2 anticipated widening `sha256`, `uploadMedia`,
   `EvidencePreview` and `api.ts` to accept a `Blob`. `applyEdit` instead rebuilds a `File`
   (`new File([blob], name, { lastModified, type })`), so `FileItem.file` keeps its `File` type and
   the upload path is untouched. `FileItem.sourceKey` keeps the *pre-edit* identity
   (`name-size-lastModified` of the original) so the duplicate warning still matches a user
   re-selecting the same source after editing it.

Also verified: the edited upload passes server-side re-hash and magic-byte detection
(**Đã xác minh**), and the editor chunk (361.93 kB, 109.75 kB gzip) is lazy, so the capture flow
keeps its current first-load cost. The evidence-card icon buttons take their accessible name from
`t()` — Vietnamese screen readers hear `Sửa seal.jpg` / `Xóa seal.jpg`, measured in Chrome at
`lang=vi` — which also translated the pre-existing `Remove` label on that card so the pair does not
switch languages mid-list.

Open items 1 and 2 of §8 are **still open** — no physical iPhone or Android device was reachable, so
every §3 Safari risk and the Konva touch ergonomics remain unproven, and feat-076 stays `in-progress`
for that reason. Open item 3 is partially answered: on the 1200x900 test card the bake compressed
18 kB → 6 kB at `OUTPUT_QUALITY` with the 4096px clamp, well inside the 25 MiB image limit, but
real-photo compression has not been measured.

## 10. Revision 1 (2026-10-12): one pass, and the filters that never worked

The user tested the build in §9 and rejected the split — framing and adjustment had to happen in
one pass — and reported that `Đã sửa: <file>` rendered as a red error banner. Investigating the
first point found something worse.

**The brightness/contrast/saturation sliders had never done anything.** Konva's `filters` setter
only sets `_filterUpToDate = false`; the pixel pipeline lives in `_getCachedSceneCanvas`, reached
only from `_drawCachedSceneCanvas`, which runs only when the node has a canvas cache — i.e. only
after an explicit `node.cache()`. Neither Konva, nor react-konva, nor our code ever called it.
Measured in the live editor: mean canvas luminance 155.072 at brightness 0, 155.072 at +100 and
155.072 at −100 — byte-identical. So `feat-076` acceptance criterion 3 was false, and this was the
third silent no-op in the same component after §9's inert crop and inert aspect presets. None of
them failed a test, a typecheck or a build.

**The fix, and the four rules that come with it:**

1. `imageNode.cache({ hitCanvasPixelRatio: 0.1, pixelRatio: 1 })`, in an effect keyed on the source
   bitmap alone. `pixelRatio: 1` is mandatory, not an optimization: Konva falls back to
   `window.devicePixelRatio`, so an iPhone at 3× would allocate the cache scene *and* its filter
   copy at 12288x9216 and blank.
2. Never cache the `Layer` or any ancestor of the marks. Caching an ancestor disables the absolute
   transform cache for everything below it and corrupts drag math.
3. Rotation belongs on the wrapping `Group`, never on the cached `Image`: `cache()` measures itself
   with `getClientRect({ skipTransform: true })`, which ignores rotation, so a rotated image node
   caches an unrotated box and resamples a 4096-wide bitmap through a rotated CTM on every redraw.
4. Never replace these with CSS string filters (`'brightness(40%)'`) — Konva's native-string path
   uses `ctx.filter`, which §3 rules out on iOS.

Measured after the fix: mean luminance 92.40 → 255.00 (+100) → 0.00 (−100) → 92.40 on reset; mean
chroma 195.56 → 235.78 at saturation +100 and 98.17 at −100.

**Geometry, measured through the exported bytes.** A 693x520 window at zoom 2 on a 1200x900 source
exports 599x450 — exactly `floor(window / k)` — with JPEG magic bytes `FF D8 FF`. At zoom 1 with the
native aspect it exports 1199x900; the missing pixel is `fitWindow`'s floor of the window size, not
a resample. Panning the window to a source corner (touch drag, and identically via the keyboard
path) produces a JPEG that samples pure `#E81123` at the centre and at both corners of a quadrant
card, so the crop reaches the bytes and the editor output is what uploads.

**A harness trap worth recording.** Headless Chrome's `Input.dispatchMouseEvent` with
`mousePressed` emits `pointermove` but **no `pointerdown` at all**, so every "drag" built from it
silently does nothing while the rest of the probe keeps reporting success. Drive gestures with
`Input.dispatchTouchEvent` or the keyboard. Two of the earlier §9 measurements were made this way
against a fixture whose quadrant boundaries sat at 2/3 of the frame rather than 1/2 — a viewport
crop of a larger page — which is what made the inert drag look like a partial one.

**Two real bugs found by running it, neither reachable from jsdom.** The `ResizeObserver` effect
had `[]` dependencies while the measured holder only mounts once the photo has decoded, so the
stage stayed at its degenerate 1x1 fallback forever. And the first pan draft applied screen-space
pointer deltas in frame space, which is correct only at rotation 0.

**The banner.** `RecorderWorkflow` derived its colour and `role` from the `complete` boolean, so
every message that was not a completion — including a successful edit — rendered crimson as
`role="alert"`. The tone now follows the message's own kind, defaulting to `error`, and the edited
line measures `role="status"` in the seal tint.

**The preview died on every edit.** `EvidencePreview` seeded `previewUrl` in `useState` and its
`[file]` effect began with `if (previewUrl) return …`. On a file swap React runs the previous
cleanup first, which revokes the old address, and then the new effect body reads the *stale*
non-empty state from the render that scheduled it — so it took that early return and never called
`createObjectURL` for the edited bytes. The card kept pointing at a revoked URL: the thumbnail still
showed the pre-edit pixels (Chrome holds the decoded bitmap) and the full-size link opened nothing.
Measured before the fix: `href` unchanged across the edit and `fetch(href)` → `Failed to fetch`,
`img.naturalWidth` 1200 while the edited `File` was 5455 bytes. The address is now created and
revoked inside one effect run, keyed only on `file`, and the render-time `eager` seed went with it —
its only caller was the completion dialog, whose items never change file, and it saved one paint
frame at the cost of exactly this class of bug. Measured after: a fresh blob URL, `fetch` →
`{ok: true, size: 5455, type: image/jpeg}`, `img.naturalWidth` 799 (the real post-edit crop), and
the completion dialog still resolves its preview.

Deleted with the rewrite: `react-easy-crop` (and its entry in §5), `normalizeCrop`,
`outputSizeForCrop`, `cropOffsetInRotatedFrame`, `bakeCropRotate`, `nodeToPan`. The lazy editor
chunk went from 361.93 kB to 340.00 kB. §8's open items 1 and 2 are **still open** for the same
reason as before: no physical device was reachable.

## 11. Revision 2 (2026-10-15): the crop box, and the mode toggle that disappeared

The user tested revision 1 against a screenshot of its toolbar: *"bố cục sắp xếp lộn xộn, thừa toggle
Frame/marks. Crop nên có phần custom nữa, có ô frame để kéo xong ok thì crop."* §4 now specifies the
rectangle model that request asked for. This section is what running that rewrite measured.

**Why the toggle existed and why deleting it was free.** Revision 1's stage was the crop window, so a
one-finger drag had two candidate meanings — pan the photo, or move this label — and a mode toggle was
the only way to disambiguate. With the stage as the whole photo, the box and the marks are two
different objects under two different fingers, and the ambiguity is gone. `mode` state, the two
`aria-pressed` chips and the zoom slider were deleted together; the probe counts **0** mode buttons
and **0** `range` inputs in the editor. Nothing was added to replace them, which is the check that the
toggle was genuinely load-bearing on the old geometry and not on the new one.

**The four decisions taken before writing it**, from the same conversation: no photo zoom at all (a
smaller box *is* the zoom); a quarter turn carries the box and the marks with the pixels they covered
rather than resetting the crop; marks clamp inside the box so WYSIWYG survives; the toolbar becomes
two grouped rows.

### Geometry, measured through the exported bytes

Fixture: the 1200x900 four-quadrant card (`#E81123` / `#107C10` / `#0078D7` / `#FFB900`, seams at
600 and 450), 1440x1000 viewport, `vi` locale, every gesture driven with
`Input.dispatchTouchEvent`. Stage **693x520** with the readout at `Vùng cắt 100% × 100%` and all four
quadrant colours present at the stage corners — the whole photo is on screen at once, which is the
revision-2 acceptance shape.

- Bottom-right anchor dragged in → `46% × 46%` → export **555x417**, all five samples pure `#E81123`,
  magic `FF D8 FF`. 555 = `floor(960 / (693/1200))`, so `floor(rect / scale)` held exactly.
- Interior drag commanded `+760,+560` on a frame that allows `+660,+495`: clamped, and the export
  samples pure `#FFB901` — the box stopped at the edge and the file shows the bottom-right quadrant.
- Keyboard only, no pointer: 5 `Shift`+`Left` → `59% × 59%` → **707x531** crossing both seams (all
  four quadrant counts nonzero). Then 14 `Right` (14x60 overshoots the 600 bound) → centre sample
  `#107C0F`, i.e. the box clamped at the right edge and moved, proving the two arrow paths are
  distinct from the resize path.
- `1:1` on this frame → `75% × 100%` → **900x900**, square. `Tuỳ chọn` then a free edge drag →
  `58% × 100%`, an aspect no preset can express. `Nguyên khung` restores `100% × 100%`, and applying
  in that state is refused with `Chưa có thay đổi nào. Hãy cắt khung, chỉnh màu hoặc thêm chú thích.`
  with the dialog still open — the same proof, from the other side, that a full-frame box counts as
  no edit.
- **The rotation remap, which was the riskiest decision.** Box over the top-left quadrant at `59%`,
  rotate right: frame 1200x900 → 900x1200, stage **390x520**, readout still `59% × 59%`, and the
  exported 530x708 JPEG samples `#E81123` at its centre. Had the box stayed put in frame coordinates
  it would have exported blue. The box moved with the pixels.
- Filters still reach the bytes after the rewrite (revision 1's §10 fix was not regressed):
  brightness −100 → all-black corners, contrast +100 → `#FF0000`/`#007200`/`#0062FF`/`#FFFF00`,
  saturation −100 → the four greys, exported 1199x900 carrying the desaturated values, and
  `Đặt lại` returning the editor to the no-edit refusal.

### The clamp, which took three tries to measure honestly

Plan item 6 was first reported as a bug — "a drag on a selected label moves the crop box instead" —
and it was **the probe that was wrong**, twice over.

1. The earlier attribution attempts (stale marks hit canvas, cross-layer `Transformer`, anchors
   blanketing a 28px label) all failed because they reasoned about hit order rather than observing it.
   Reading Konva 10.7.1's own source is what settled the mechanism: `Node.isDragging()` is per-node
   (`DD._dragElements.get(this._id).dragStatus === 'dragging'`), the drag element belongs to whatever
   node the pointerdown landed on, and `Transformer._proxyDrag` only makes the transformer *also*
   report dragging. So the authoritative test is `stage.on('pointerdown'/'dragstart')` plus before and
   after node positions — not `getBoundingClientRect()`.
2. With that instrumentation the aim itself was stale: the editor sheet **reflows when a text mark is
   selected**, because the note-field row appears. At 1440 the stage moves 38px, at 390x844 **120px**
   (stage top 289 → 169). Any rect captured before the selection is wrong by that much, which is what
   made a label drag land on the crop box. Every gesture after that was calibrated per-move from
   `stage.getPointerPosition()` — echo the pointer through `stage.on('pointermove', …)` once and
   compare the echoed coordinate with the intended one to get frame→stage `k` before touching anything.

Recalibrated, the no-mode design holds: selected label, centre aim → `pointerdown Text[] dragstart
Text[]`, Text (41,31)→(81,61), crop **unchanged**; unselected label, same result; bare crop interior →
`pointerdown Rect[]` and the box moves, label still; and pushing a label toward the dim area stops
with Text (243,339) 246x28 inside crop (80,60,409,307) — `label inside crop: true`. Zero exceptions.

### Probe traps worth keeping

- **A `getBoundingClientRect()` captured before a state change is stale**, and in this component the
  state change is "the text field row appeared". Recalibrate per gesture, from Konva.
- **Reaching the live Konva stage from React.** react-konva 19.3.0 is a function component holding the
  stage in a `useRef`, and the `<canvas>`/`.konvajs-content` elements are created by Konva, so they
  carry **no** fiber key. Start at the React-created holder div, BFS the fibers and inspect
  `stateNode`, `ref.current`, `memoizedProps.ref` and the hook chain
  (`memoizedState.next…`) for an object with `getLayers`.
- **A transparent canvas pixel reads `(0,0,0,0)`.** Colour assertions must carry an `a > 0` guard or
  an empty stage passes as black.
- **Konva paints on rAF.** Read twice and require stability before asserting.
- An interpolated arrow predicate must be parenthesized — `` `(${test})(...)` `` — or `if (fn)` is
  always truthy and every "hit" is reported.
- Still standing from §10: headless Chrome's `Input.dispatchMouseEvent` emits **no `pointerdown`**, so
  drags must use `Input.dispatchTouchEvent`.
- **A `//` comment inside a JSX child list is text, not a comment.** Hit twice in this feature; the
  second time it put a footer rationale sentence on screen at every width (§15). Nothing complains —
  not Vite, not `tsc`, not the layout probe — so the check is the screenshot.
- One test-side race of the same family: `RecorderWorkflow.test.tsx` asserted on the preview `img`
  before the rewritten `EvidencePreview` effect had resolved it. It now waits on
  `findByAltText('Preview of seal.jpg')`.

### Findings this revision produced and did not change

- **The phone toolbar is 4 lines, not the 2 rows that were agreed.** `rowHeights: [80, 36]` at
  390x844 — the chips wrap. Making it two rows needs either a horizontal chip scroller (which puts a
  control behind a scroll edge, one of the `better-interface` escalation triggers) or shorter/absent
  labels. Left as an owner decision rather than guessed at.
- **Selecting a mark shifts the stage 120px upward at 390** (see above), and the sheet already
  overflows the viewport by ~70px at rest, so the apply footer is reachable only by scrolling. Not
  introduced here — it is the bottom-anchored sheet meeting a row that appears on selection.
- The **white colour swatch is nearly invisible** on the white panel.
- `document.scrollWidth` 2027@1440 / 422@390 is **pre-existing page-level overflow**, three
  `INPUT.flex h-11 w-full` inputs in the form, measured identically with the editor closed. Its own
  feature, not this one. Inside the editor, `panelScroll === panelClient` at both widths: no overflow
  added.
- `Shift`+arrows resize **only when nothing is selected** — `onKeyDown`'s `if (selected)` branch
  (ImageEditor.tsx:331) precedes the `shiftKey` branch, so with a mark selected Shift is inert and the
  mark moves. §4's wording is loose about this.

Two of the five above — the invisible white swatch and the `Shift`+arrow ordering — were fixed on
2026-10-18; see §13. The other three are still owner decisions.

### Gates

`npm run test --prefix web` → 11 files, 101 tests passed (19 in `imageBake.test.ts`). `tsc -b` clean —
note that `npx tsc -b` from the repo *root* installs and runs the unrelated `tsc@2.0.4` stub and
exits 1; it must run from `web/`. `npm run build --prefix web` green: lazy `ImageEditor` chunk
**340.93 kB / 104.38 kB gzip**, `index` 425.93 kB / 128.09 kB gzip, css 50.07 kB. `./init.sh` exit 0,
and the full flow still uploads afterwards: `Đã sửa: card-edited.jpg` as a status, card preview
`naturalWidth 875` with `fetch` → `{ok: true, size: 6629, type: 'image/jpeg'}`, record completed,
`EXCEPTIONS []`.

§8 items 1 and 2 are **still open** for the third time: no physical iPhone or Android was reachable,
so `anchorSize={28}` and `MIN_CROP=48` are still numbers someone typed, not numbers a finger chose,
and every §3 Safari risk is still unproven. feat-076 stays `in-progress`.

## 12. Revisions 3–4 (2026-10-15 → 10-17): `Cắt ảnh`, and the arrow replaced by a pencil

Two changes on top of §11's box model.

**Revision 3 — committing a framing without leaving the editor.** `Cắt ảnh` in the footer bakes the
current box and turn into the base: `bakeCropToCanvas` draws from the *pristine* decode, the accepted
box becomes the whole photo, `rotation` resets, and the step is appended to a `bakes` list that is
replayed on every redraw, so crops chain and nothing is JPEG-compressed before `Apply edit`. Marks
shift with it (`translateAnnotationsForBake`). Alongside that, `EditorState` now round-trips:
`applyEdit` stores the state on `FileItem.editState` and a re-opened editor receives it as
`initialState`, so "Sửa ảnh" a second time restores the framing, the marks and the sliders instead of
starting from zero.

**Revision 4 — the arrow is gone.** The owner tested the build and said
*"T muốn pencil để tự vẽ gì mình thích"* — a tool for drawing whatever they like, not a shape. What
survived of revision 3 (bake, carry-over, the pointer gate) stayed; `ArrowPoints`, `arrowGeometry`,
`arrowEndpoints`, the `<Arrow>` node, the tail/head endpoint handles and the per-mark accept bar were
deleted outright, with no flag and no leftover `kind`.

- **`Bút vẽ` is a mode, not a per-stroke accept.** Many strokes in a row is the point: the chip
  (`aria-pressed`) turns drawing on, every drag adds a stroke, and the bar offers only
  `Bỏ nét cuối` and `Xong`. No ✓/✗ per mark.
- **Model**: `AnnotationKind = 'stroke' | 'text'`, with `points?: number[]` as a flat
  `[x0,y0,x1,y1,…]` in source px **relative to the mark's own box** — the same convention the arrow
  used, which is why `clampAnnotation` and `translateAnnotationsForBake` needed no change.
  `geometryForStroke` snaps every point to whole source pixels first and pads the box by
  `max(1, round(strokeWidth))`, so the visible ink — not just the centre line — is inside the box.
  A quarter turn maps the polyline point by point through `rotatePointToFrame` and rebuilds the box
  from it; thickness is only ever what was stored, because for a stroke `height` is ink extent and
  deriving width from it would thicken a tall squiggle on every turn.
- **No thickness control**: width comes from `annotationStyleFor(crop).strokeWidth` (crop height ×
  0.015, floor 3), so a stroke keeps its share of the file across a crop chain. A tap with no
  movement draws nothing.

### What the pencil taught about this stack

- **react-konva diffs props by identity**, not by value (`node_modules/react-konva/lib/makeUpdates.js:102-107`).
  The in-progress path is one permanently mounted `<Line>`, `visible={pencilOn}`, idle at a
  module-level `const NO_POINTS: number[] = []`; a fresh `[]` per render would be re-applied and wipe
  the path the pointer handler just drew. During a stroke the handler mutates the node
  (`liveLine.points(next)` + `getLayer().batchDraw()`) and **only `pointerup` writes React state** —
  otherwise a phone re-renders the whole sheet ~60×/s, since Konva dispatches every touchmove
  synchronously.
- **`stage.setPointerCapture(pointerId)` on pointerdown is required, not optional.** Konva captures a
  pointer only for a *listening* shape (`konva/lib/Stage.js:556-561`) and drawing makes every shape
  deaf, so a finger that wanders into the letterbox band would drop the stroke **and never receive a
  `pointerup`** — the stage binds its pointer events on its own `content` div, with no window-level
  fallback. `releaseCapture` runs on both the up and the cancel path, so a leaked capture cannot make
  marks ungrabbable for the rest of the session.
- A second finger mid-stroke is ignored (the stroke records its own `pointerId`), samples are kept
  only ≥ 3 source px apart, and `hitStrokeWidth={max(28, strokeWidth × scale × 2)}` makes a thin line
  grabbable without ever touching `toDataURL`.
- Mark drawing sets `listening={false}` on the crop `Rect`, both mark nodes and the mark
  `Transformer`, and clears `selectedId` on entry — the Transformer had no gate at all, so a
  previously selected label was draggable by the drawing finger.

Revision 4 did not get its own probe run; the pencil path was measured end-to-end later, through the
exported bytes, in §13.

## 13. Revision 5 (2026-10-18): the two fixes, and marks moved onto the photo

The owner chose "sửa 2 lỗi code tồn" from §11's unfixed list, then changed a rule while testing:
*"pencil nên draw trên full frame, để khi crop thì chỉ crop phần available có đc k"*. That supersedes
revision 2's *"Marks are clamped inside the crop box, on drag and whenever the box moves"* — the
clamp was moving ink away from the words it was drawn to point at.

- **Two bounds, not one.** §4's `frameBox = fullBox(frame)` (source px) bounds the marks and the
  pointer; `stageBox` bounds the drag transformers. The `useEffect` that re-clamped every mark on
  each `crop` change is deleted, and the marks `Layer` lost the `clip` revision 4 added — ink outside
  the box stays painted over the dim mask so it can be seen and grabbed, and the export region cuts
  it exactly like the pixels underneath.
- **`Cắt ảnh` drops what lies wholly in the dimmed area** (`translateAnnotationsForBake` filters on
  intersection before shifting), because the new base cannot contain a mark the new photo doesn't
  have. Partially overlapping marks shift by the origin as before.
- **`Shift`+arrows resize whether or not a mark is selected** — the `shiftKey` branch now precedes
  `if (selected)`, since Shift is what means "the box".
- **The white swatch edge is `border-foreground/60`**: 3.76:1 against the Folio panel
  (`rgb(145,125,131)` vs `rgb(255,252,251)`), clearing WCAG 2.2 1.4.11 in every tone. The shipped
  value was `/20` = 1.45:1, and the intermediate `border-input` measured 1.97:1.

### Measured, through the exported bytes

CDP `Input.dispatchTouchEvent`, vi locale, `/tmp/card.png` (1200×900, four quadrant colours),
1440×1000; stage 693×520 at scale 520/900 = 0.57778.

- Crop 298×224 (`43% × 43%`). Stroke A inside the box at stage (56,57) 110×91 and stroke B outside at
  (354,281) 306×206 **both paint** — black ink across the whole stage (bbox x 57→664, y 58→491,
  2099 px).
- Dragging the box to (180,180) leaves B byte-identical and the box returns home exactly: the box no
  longer drags marks around with it.
- `Apply edit` → `card-edited.jpg`, `image/jpeg`, 3997 bytes, **515×387**, ink 926 px with box
  x 101→293 / y 102→262 — A carried into the file, B cut off at the crop edge.
- A fresh editor then `Cắt ảnh`: C inside (46,47 source px) survives, D outside (344,270) is dropped,
  the readout goes to `100% × 100%` and the survivor reads `Line@80,81 173×155` in stage px, which is
  exactly its source box ÷ 0.57778 — the mark kept covering the same pixels.
- Re-opening the edited file restores crop {0,0,516,387} with the mark intact, so the carry-over from
  revision 3 holds across the new bounds. `EXCEPTIONS []`.
- The keyboard fix: 5×`Shift+ArrowLeft` with nothing selected → 693×520 → 409×307; **with a Text mark
  selected** → 409×307 → 242×181, which the old branch order cannot do; a plain `ArrowLeft` then moves
  Text x 41 → 0 with the crop byte-identical.

### Probe trap

Comparing a mark's **stage** position across an operation that changes the scale reads as an
off-by-one defect when it is correct behaviour; convert back to source px first, which is where every
mark is stored.

### Deliberate non-change

`hasEdits` still counts any annotation as an edit, even one lying wholly outside the box, so such a
mark keeps `Apply edit` enabled and is then cut. The request was that cropping keep "phần available",
not that an off-box mark become invisible to Apply.

### Gates

`npm run test --prefix web` → **107 passed / 11 files** (24 in `imageBake.test.ts`), `npx tsc -b`
from `web/` → clean, `npm run build --prefix web` → lazy `ImageEditor-BEI3y2KI.js`
**344.86 kB / 105.57 kB gzip**, `index` 427.81 kB / 128.70 kB gzip, css 50.55 kB.
Probe: `node /tmp/f076-frame-draw.mjs` (built from `/tmp/_head.mjs` + `/tmp/f076-frame-draw-body.mjs`).

§8 items 1 and 2 are **still open** — no physical device was reachable, so `MIN_HIT_STROKE`, the 3 px
sampling step and the stroke width are still unvalidated by a real finger — and the two owner
decisions from §11 (toolbar collapse below 640px, the bottom-anchored sheet) are still undecided.
feat-076 stays `in-progress`.

## 14. Revision 6 (2026-10-18): an accepted crop could not be taken back

Reported from testing: *"Đang ko reset đc accept crop"*. Measured first, in the running app: after
`Cắt ảnh` the button correctly disables, but **no control in the dialog returns the cut-away area** —
`Nguyên khung` binds to the *current* frame, which is now the baked 708×531 photo rather than the
1200×900 it was cut from, so the only way out is `Hủy`, which discards the marks and the sliders too.
The bake was a one-way door with no handle.

- **`Hoàn tác cắt`** appears in the footer whenever `bakes` has a step to pop and restores the whole
  pre-bake state: base, box, turn, aspect preset and the mark list. Only the base is derivable from
  the step list, so the stack keeps `{ annotations, aspectKey }` per step — the marks the cut dropped
  cannot be rebuilt from anything else.
- **The base is re-decoded and replayed, not cached.** `loadBitmap(blob)` → `drawWorkingCanvas` →
  `bakeCropToCanvas` over the remaining steps, which is exactly the re-open path at
  `ImageEditor.tsx:172-184`. Holding one canvas per accepted crop instead would add ~195 MB per step
  on a 48MP photo (§3's standing warning), and an undo is rare enough to pay a redraw for. An
  `undoingRef` gate keeps a second tap from replaying against a stack that already moved.
- **Restoring the turn is the part that could have gone wrong.** A bake folds the live rotation into
  the pixels and resets `rotation` to 0, so undo must put the *live* turn back on an un-rotated base,
  and the popped box belongs to the frame that turn produces — not to the base's own axes. Measured:
  turn right + box 119×159 → bake (base 590×787, group 0°) → undo restores group **90°** on
  **1200×900** with the box byte-identical.
- **The footer row sets the sheet's width.** The first version kept the button's label at every width
  and pushed the panel from 388 to **504px clientWidth on a 390px screen** — the whole dialog wider
  than the device. The label is now `hidden sm:inline` with `aria-label` always, which holds the
  panel at 397px and leaves the accessible name `Hoàn tác cắt` (40px wide button, nothing past the
  panel edge).
- Also in this change: three dead i18n keys left by revision 4's deleted arrow (`Accept arrow`,
  `Discard arrow`, `Drag on the photo to draw the arrow`) are gone — unreferenced anywhere in `web/src`.

### Gates

`npm run test --prefix web` → **107 passed / 11 files**, `npx tsc -b` from `web/` → clean,
`npm run build --prefix web` → lazy `ImageEditor-B8malPjP.js` **345.80 kB / 105.78 kB gzip**,
`./init.sh` → exit 0. Probes: `node /tmp/f076-reset.mjs` (the one-way door, before the fix),
`node /tmp/f076-undo.mjs` (single bake + a two-step chain, marks restored exactly,
`Đã sửa: card-edited.jpg` after the dance), `node /tmp/f076-undoturn.mjs` (the rotation case),
`node /tmp/f076-undo390.mjs` (the phone-width layout). `EXCEPTIONS []` in all four.

Device QA (§8 items 1 and 2) and the two §11 owner decisions are unchanged and still open; an
accepted crop is now reversible inside the session, but a *re-opened* editor starts with an empty
undo stack — the pre-bake mark lists of a previous session were never recorded anywhere, and
inventing them by translating back would silently return fewer marks than were dropped.

## 15. Revision 7 (2026-10-18): a way back to the photo as it was picked

Asked for directly: *"Nên có button reset edit."* The owner chose the **in-editor** reading of that
over a revert-the-saved-file button when offered both, which is what this section implements: §14's
undo only takes back one accepted crop, and the only other way to an untouched photo was `Hủy`, which
closes the sheet with it.

- **`Bỏ mọi thay đổi`** (EN key `Discard all changes`) clears bakes, marks, turn, preset and sliders
  and leaves the editor open on the pristine photo. The implementation is §14's rebuild path with an
  empty step list: `loadBitmap(blob)` → `drawWorkingCanvas` → set the empties. It shares one `busyRef`
  guard with the undo, since both re-decode and neither may replay against state that already moved.
- **It is visible only while the edit is non-empty**, using the same `hasEdits({ adjustments,
  annotations, bakes, crop, frame, rotation })` question `commit()` asks. That is what keeps it from
  being a button that offers to destroy nothing, and it means the control disappears the moment the
  reset lands.
- **Why no confirmation dialog.** The trigger asks for confirmation, undo or a distinct treatment for a
  destructive action, and this one has the third: it is a ghost button, it sits with `Hủy` on the far
  side of the row from the two solid actions, and it is only reachable while there is an edit in
  progress. What it can destroy is bounded to drawing done in this sheet — the file in the list, its
  hash and its preview are untouched until `Lưu ảnh đã sửa` is pressed, and that button now refuses
  after a reset. A `destructive` colour would have been the wrong semantic hue for it.
- **The footer wraps instead of widening.** Measured with the label at every width, the row pushed the
  sheet to **521px clientWidth on a 390px screen** (four labelled buttons need ~510px). `flex-wrap`
  plus `ml-auto` on the action group: at 390 the row is two 44px lines (96px total) inside a
  **388px** panel with the actions flush to its right edge and nothing past it; at 1440 it stays one
  44px line. That is also why `Hoàn tác cắt` stayed icon-only below `sm` — together the two groups fit
  on one line only above 640px.

### Measured

CDP, vi, `/tmp/card.png` 1200×900:

- At rest the button is absent; one stroke makes it appear; pressing it returns base **1200×900**,
  group 0°, crop 324×243@0,0 (the stage's own box for the full frame), `Vùng cắt 100% × 100%`, no
  marks — and `Lưu ảnh đã sửa` then answers *"Chưa có thay đổi nào. Hãy cắt khung, chỉnh màu hoặc thêm
  chú thích."*, which is the proof the state really is empty rather than merely redrawn.
- Everything at once — brightness 45, `3:4`, a quarter turn, an accepted crop (base 810×1080), one
  label and two strokes — one tap returns base 1200×900, rot 0, sliders `brightness=0 contrast=0
  saturation=0`, marks `[]`, and both `Bỏ mọi thay đổi` and `Hoàn tác cắt` disappear.
- Drawing after a reset works and the save is from the pristine base: `Đã sửa: card-edited.jpg`.
- A **re-opened** editor (revision 3's carried state) shows the button while the carried marks make the
  edit non-empty, and reset clears those too.
- 390×844 @dpr2: panel 388px at rest and 388px with the button visible, `offPanel: []`, footer 44 →
  96px.
- The final pass at both widths is clean: `strayCommentRendered: false`, `strayNodes: []`,
  `EXCEPTIONS []` (screenshot `/tmp/ui-verify/f076p/f076-reset-390-fixed.png`).

### The footer comment that became UI text

Worth recording because it is the second time this session, and only a screenshot caught it: a `//`
comment written directly above the footer `<div>` **inside the JSX return** is not a comment — it is
text children, so the phrase "Wraps rather than widening: the two groups together need ~510px…"
rendered as visible copy between the crop grid and the buttons. The compiler and `tsc` are both
silent about it (it parses as a `JSXText` node), and the probe that measures panel width, button
positions and `offPanel` saw nothing wrong, because the stray text is inside the panel and displaces
no layout. In a sheet this dense, read the screenshot after every footer edit; `{/* … */}` is the
only comment that lives in a JSX child list.

### Gates

`npm run test --prefix web` → **107 passed / 11 files**, `npx tsc -b` from `web/` → clean,
`npm run build --prefix web` → lazy `ImageEditor-3N5FCXZY.js` **346.44 kB / 105.90 kB gzip**,
`./init.sh` → exit 0. Probes `node /tmp/f076-reset2.mjs` (the three states above),
`/tmp/f076-reset390.mjs` and `/tmp/f076-reset390b.mjs` (the phone footer, with a real bake so undo and
reset are both on screen at once), `/tmp/f076-resettext.mjs` (stray-text sweep at 390 and 1440 after
the comment fix), `EXCEPTIONS []` in each.

Unchanged: device QA (§8 items 1 and 2) and the two §11 owner decisions. A reset is not undoable — it
is the last-resort control, and the undo that would cover it would have to snapshot everything §14's
undo stack already holds plus the sliders, for a button whose whole job is throwing that away.

## 16. Revision 8 (2026-10-18): the discard could not be committed

Reported from testing: *"discard all change nhưng k apply đc."* §15's control reset the **sheet** and
nothing else, which is right for a file that has never been saved and a dead end for one that has.
Measured first, in the running app (`/tmp/f076-repro.mjs`): save one stroke (`card.png` →
`card-edited.jpg`, 8019 ink px at ±12 of the mark colour) → reopen → `Bỏ mọi thay đổi` → marks `[]`,
base 1200×900, the reset button gone as designed → `Lưu ảnh đã sửa` → **"Chưa có thay đổi nào…"**,
dialog still open. The discard had nowhere to go: the only exits were `Hủy`, which puts the inked file
back, or applying an edit that no longer exists.

The bug is one bad comparison. `hasEdits()` asks whether the sheet differs from **the photo**, and
after a reset nothing does. What the user is actually asking is whether the sheet differs from **what
is already saved** — and on a re-edit those two questions have different answers.

- `savedIsEdited` is computed once, in the mount effect, by running `hasEdits()` over the **carried**
  state against the frame those bytes produce. The frame comes free there (the pristine decode plus the
  replayed bakes), which is exactly what a standalone `EditorState` does not have.
- `reverted` is set by `resetEdit()`. `revertsSavedEdit = savedIsEdited && reverted` is the second
  half of the Apply gate in `commit()`; the visible refusal, the enabled button and the export path are
  otherwise untouched, so a reset in a fresh sheet still refuses — correctly, because there the file in
  the list *is* the photo.

The owner picked this shape over the two alternatives when they were put side by side (restore the
pristine `File` and close the sheet; or reset and let Apply write the clean photo back): **the sheet
stays open and Apply writes the clean photo back**. Cost of that choice, recorded honestly: the revert
is a re-encode, so `card-edited.jpg` comes back at 1199×899 with a new hash and a new size rather than
as the original bytes. It is the same JPEG pipeline as any other apply, and `preEdit` is not overwritten,
so repeating the dance re-encodes the pristine decode each time and never compounds generation loss.

Measured (`/tmp/f076-revert.mjs`, CDP touch, vi, `/tmp/card.png`):

- **A — never-saved file.** stroke → reset → Apply → *"Chưa có thay đổi nào…"*, dialog open, and the
  card still holds the original `1200x900`, `inkPixels: 0`.
- **B — saved crop taken back.** `43% × 43%` → `Cắt ảnh` → Apply → the file is `516x387`. Reopen (marks
  and the smaller crop carried, reset offered) → `Bỏ mọi thay đổi` → **Apply closes the dialog** and the
  file is `1199x899` — the whole frame back, not the crop.
- **C — after the revert.** Reopening shows a clean sheet: `marks []`, and the button list is
  `["Nguyên khung", "Cắt ảnh", "Lưu ảnh đã sửa"]` with no `Bỏ mọi thay đổi`. `savedIsEdited` is false
  because the state that was just written has no edits, so the control does not offer to discard a
  photo that is already discarded. `EXCEPTIONS []`.

### Gates

`npm run test --prefix web` → **107 passed / 11 files**, `npx tsc -b` from `web/` → clean,
`npm run build --prefix web` → lazy `ImageEditor-BviYsV7X.js` **346.66 kB / 105.97 kB gzip**,
`./init.sh` → exit 0.

Device QA (§8 items 1 and 2) and the two §11 owner decisions are unchanged. The harness lesson from
this round: the earlier probes had been riding on a still-running headless Chrome whose profile held
the session — killing it left `/tmp/_head.mjs` at a login screen, because the harness never sets a
cookie despite reading one. `login()` now fills `#account-username` / `#account-password` and submits,
against a local-only probe account whose throwaway password lives in `/tmp` and in no repo file.
