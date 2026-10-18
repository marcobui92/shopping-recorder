import { expect, it } from 'vitest'

import {
  annotationStyleFor,
  boxFromStage,
  boxToStage,
  clampAnnotation,
  clampBox,
  clampLongEdge,
  cropForAspect,
  dataUrlToBlob,
  exportConfigFor,
  fitScaleFor,
  frameFor,
  fullBox,
  geometryForStroke,
  hasEdits,
  konvaFilterValues,
  maskPanels,
  MAX_CANVAS_AREA,
  MAX_OUTPUT_EDGE,
  MIN_CROP,
  MIN_STROKE,
  NEUTRAL_ADJUSTMENTS,
  outputFilename,
  removeAnnotation,
  rotateAnnotationToFrame,
  rotateBoxToFrame,
  rotatePointToFrame,
  stageSizeFor,
  strokePoints,
  translateAnnotationsForBake,
  updateAnnotation,
  type Annotation,
  type Box,
  type Point,
  type SourceSize,
} from './imageBake'

const LANDSCAPE: SourceSize = { height: 600, width: 800 }
const PORTRAIT: SourceSize = { height: 800, width: 600 }

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return { color: '#000', height: 20, id: 'a1', kind: 'text', text: 'Cracked', width: 80, y: 10, x: 10, ...overrides }
}

/** A short diagonal squiggle: three points, so it is not expressible as a single segment. */
const SQUIGGLE: Point[] = [{ x: 100, y: 200 }, { x: 140, y: 260 }, { x: 200, y: 220 }]

function bounds(box: Box): { maxX: number; maxY: number } {
  return { maxX: box.x + box.width, maxY: box.y + box.height }
}

it('bounds the long edge and the canvas area, and never upscales', () => {
  expect(clampLongEdge({ height: 6000, width: 8000 })).toEqual({ height: 3072, width: 4096 })
  expect(clampLongEdge({ height: 2000, width: 3000 })).toEqual({ height: 2000, width: 3000 })
  expect(clampLongEdge({ height: 40, width: 80 })).toEqual({ height: 40, width: 80 })

  // 5000×5000 fits the long edge at exactly 4096², which is the ceiling itself, so the area bites.
  const square = clampLongEdge({ height: 5000, width: 5000 })
  expect(square).toEqual({ height: 4000, width: 4000 })
  expect(square.height * square.width).toBeLessThanOrEqual(MAX_CANVAS_AREA)

  const widest = clampLongEdge({ height: 500, width: 20000 })
  expect(Math.max(widest.height, widest.width)).toBeLessThanOrEqual(MAX_OUTPUT_EDGE)
})

it('swaps the frame only for quarter turns', () => {
  expect(frameFor(LANDSCAPE, 0)).toEqual({ height: 600, width: 800 })
  expect(frameFor(LANDSCAPE, 90)).toEqual({ height: 800, width: 600 })
  expect(frameFor(LANDSCAPE, 180)).toEqual({ height: 600, width: 800 })
  expect(frameFor(LANDSCAPE, 270)).toEqual({ height: 800, width: 600 })
})

it('contains the whole photo without ever magnifying it', () => {
  // A 800×600 frame inside a 400×300 holder halves; the two axes agree because the holder matches.
  expect(fitScaleFor(LANDSCAPE, { height: 300, width: 400 })).toBe(0.5)
  // A tall narrow holder is bound by its width, so the photo is letterboxed vertically, never blown up.
  expect(fitScaleFor(LANDSCAPE, { height: 800, width: 200 })).toBe(0.25)
  // A small photo in a big holder stays at 1:1 — upscaling only blurs the crop edges.
  expect(fitScaleFor({ height: 60, width: 80 }, { height: 400, width: 400 })).toBe(1)
  expect(fitScaleFor({ height: 0, width: 0 }, { height: 400, width: 400 })).toBe(1)
  expect(fitScaleFor(LANDSCAPE, { height: 0, width: 400 })).toBe(1)
})

it('derives the stage from the fit and floors it to whole pixels', () => {
  expect(stageSizeFor(LANDSCAPE, 0.5)).toEqual({ height: 300, width: 400 })
  expect(stageSizeFor({ height: 599, width: 801 }, 0.5)).toEqual({ height: 299, width: 400 })
  // A sub-pixel stage still has to exist for Konva to build a canvas for it.
  expect(stageSizeFor({ height: 1, width: 1 }, 0.25)).toEqual({ height: 1, width: 1 })
})

it('keeps a crop inside its bounds and no smaller than the floor', () => {
  expect(clampBox({ height: 100, width: 200, y: -50, x: -50 }, LANDSCAPE)).toEqual({ height: 100, width: 200, y: 0, x: 0 })
  expect(clampBox({ height: 100, width: 200, y: 900, x: 9000 }, LANDSCAPE)).toEqual({ height: 100, width: 200, y: 500, x: 600 })
  expect(clampBox({ height: 900, width: 900, y: 0, x: 0 }, LANDSCAPE)).toEqual(fullBox(LANDSCAPE))

  // The floor bites before the bounds, and a frame smaller than the floor still yields a legal box.
  expect(clampBox({ height: 10, width: 10, y: 0, x: 0 }, LANDSCAPE, MIN_CROP)).toEqual({ height: 48, width: 48, y: 0, x: 0 })
  expect(clampBox({ height: 10, width: 10, y: 0, x: 0 }, { height: 20, width: 30 }, MIN_CROP)).toEqual({ height: 20, width: 30, y: 0, x: 0 })
})

it('round-trips the crop through stage pixels without drift', () => {
  const crop: Box = { height: 300, width: 400, y: 50, x: 100 }
  expect(boxToStage(crop, 0.5)).toEqual({ height: 150, width: 200, y: 25, x: 50 })
  expect(boxFromStage(boxToStage(crop, 0.5), 0.5, LANDSCAPE)).toEqual(crop)

  // A scale that does not divide the box rounds to whole stage pixels, and the way back can be a
  // source pixel off — which is why the export takes the rounded stage region, not the stored crop.
  const rescaled = boxFromStage(boxToStage({ height: 333, width: 444, y: 7, x: 13 }, 0.3), 0.3, LANDSCAPE)
  expect(Math.abs(rescaled.width - 444)).toBeLessThanOrEqual(1)
  expect(rescaled).toMatchObject({ height: 333, y: 7, x: 13 })

  // A resize dragged off the frame comes back inside; one dragged shut stops at the floor.
  expect(bounds(boxFromStage({ height: 100, width: 100, y: 500, x: 500 }, 0.5, LANDSCAPE))).toEqual({ maxX: 800, maxY: 600 })
  expect(boxFromStage({ height: 2, width: 2, y: 0, x: 0 }, 0.5, LANDSCAPE)).toEqual({ height: 48, width: 48, y: 0, x: 0 })
  expect(boxFromStage({ height: 100, width: 100, y: 0, x: 0 }, 0, LANDSCAPE)).toEqual(fullBox(LANDSCAPE))
})

it('fits a ratio preset about the crop centre it already had', () => {
  const centered = fullBox(LANDSCAPE)
  expect(cropForAspect(LANDSCAPE, 1, centered)).toEqual({ height: 600, width: 600, y: 0, x: 100 })
  expect(cropForAspect(LANDSCAPE, 16 / 9, centered)).toEqual({ height: 450, width: 800, y: 75, x: 0 })
  expect(cropForAspect(LANDSCAPE, 3 / 4, centered)).toEqual({ height: 600, width: 450, y: 0, x: 175 })
  // The frame's own ratio is the full photo again.
  expect(cropForAspect({ height: 600, width: 1200 }, 2, fullBox({ height: 600, width: 1200 })))
    .toEqual(fullBox({ height: 600, width: 1200 }))

  // Off-centre crops keep their centre instead of snapping back to the middle, then get pulled in.
  const corner = { height: 200, width: 200, y: 10, x: 10 }
  expect(cropForAspect(LANDSCAPE, 1, corner)).toEqual({ height: 600, width: 600, y: 0, x: 0 })
  expect(cropForAspect(LANDSCAPE, Number.NaN, corner)).toEqual(clampBox(corner, LANDSCAPE, MIN_CROP))
})

it('carries the crop with the pixels through every quarter turn', () => {
  // The top-left quadrant of the 800×600 frame, then where those pixels land after each turn.
  const topLeft: Box = { height: 300, width: 400, y: 0, x: 0 }
  const turns: Array<{ from: SourceSize; to: SourceSize; expected: Box }> = [
    { from: LANDSCAPE, to: PORTRAIT, expected: { height: 400, width: 300, y: 0, x: 300 } },
    { from: PORTRAIT, to: LANDSCAPE, expected: { height: 300, width: 400, y: 300, x: 400 } },
    { from: LANDSCAPE, to: PORTRAIT, expected: { height: 400, width: 300, y: 400, x: 0 } },
    { from: PORTRAIT, to: LANDSCAPE, expected: topLeft },
  ]

  let current = topLeft
  for (const { from, to, expected } of turns) {
    current = rotateBoxToFrame(current, from, to, 1)
    expect(current).toEqual(expected)
  }
  // Four clockwise turns are the identity, so the crop is never ground down by rounding.
  expect(current).toEqual(topLeft)

  // And counter-clockwise walks straight back over the same pixels.
  expect(rotateBoxToFrame(turns[0].expected, PORTRAIT, LANDSCAPE, -1)).toEqual(topLeft)

  // A full frame stays a full frame; only its axes swap.
  expect(rotateBoxToFrame(fullBox(LANDSCAPE), LANDSCAPE, PORTRAIT, 1)).toEqual(fullBox(PORTRAIT))
})

it('dims everything the crop does not reach', () => {
  const stage: SourceSize = { height: 400, width: 400 }
  expect(maskPanels({ height: 200, width: 200, y: 100, x: 100 }, stage)).toEqual([
    { height: 100, width: 400, y: 0, x: 0 },
    { height: 100, width: 400, y: 300, x: 0 },
    { height: 200, width: 100, y: 100, x: 0 },
    { height: 200, width: 100, y: 100, x: 300 },
  ])
  expect(maskPanels(fullBox(stage), stage)).toEqual([])
  // A crop flush with one edge drops just that panel.
  expect(maskPanels({ height: 200, width: 200, y: 0, x: 100 }, stage)).toEqual([
    { height: 200, width: 400, y: 200, x: 0 },
    { height: 200, width: 100, y: 0, x: 0 },
    { height: 200, width: 100, y: 0, x: 300 },
  ])
})

it('renames the edited output to the single supported encoder format', () => {
  expect(outputFilename('IMG_0042.HEIC')).toBe('IMG_0042-edited.jpg')
  expect(outputFilename('package.opening.png')).toBe('package.opening-edited.jpg')
  expect(outputFilename('no-extension')).toBe('no-extension-edited.jpg')
  expect(outputFilename('   ')).toBe('image-edited.jpg')
})

it('stays inside the originalFilename contract limit', () => {
  const edited = outputFilename(`${'x'.repeat(400)}.heic`)
  expect(edited.length).toBeLessThanOrEqual(255)
  expect(edited.endsWith('-edited.jpg')).toBe(true)
})

it('patches and removes annotations by id', () => {
  const list = [annotation(), annotation({ id: 'a2', kind: 'stroke' })]

  const patched = updateAnnotation(list, 'a2', { x: 99 })
  expect(patched.find((entry) => entry.id === 'a2')?.x).toBe(99)
  expect(patched.find((entry) => entry.id === 'a1')?.x).toEqual(10)

  expect(removeAnnotation(patched, 'a1').map((entry) => entry.id)).toEqual(['a2'])
})

it('maps slider values onto the channels Konva expects', () => {
  expect(konvaFilterValues({ brightness: 0, contrast: 0, saturation: 0 })).toEqual({ brightness: 0, contrast: 0, saturation: 0 })
  expect(konvaFilterValues({ brightness: 40, contrast: -25, saturation: 80 })).toEqual({ brightness: 0.4, contrast: -25, saturation: 0.8 })
  expect(konvaFilterValues({ brightness: 500, contrast: 500, saturation: -500 })).toEqual({ brightness: 1, contrast: 100, saturation: -1 })
})

it('decodes the exported data URL without a fetch', () => {
  const payload = btoa('evidence')
  const blob = dataUrlToBlob(`data:image/jpeg;base64,${payload}`)
  expect(blob.type).toBe('image/jpeg')
  expect(blob.size).toBe(8)
})

it('keeps marks on the photo and lets the crop box cut them', () => {
  const frame: Box = { height: 600, width: 800, y: 0, x: 0 }
  const draggedAway = clampAnnotation(annotation({ y: 900, x: 900 }), frame)
  expect(draggedAway).toMatchObject({ x: 720, y: 580 })
  expect(bounds(draggedAway)).toEqual({ maxX: 800, maxY: 600 })

  // A mark dragged past the near edge stops at the photo, not at whatever the box happens to be.
  expect(clampAnnotation(annotation({ y: -40, x: -40 }), frame)).toMatchObject({ x: 0, y: 0 })
  // A mark larger than the frame cannot be contained, so it parks at the origin rather than
  // inverting into a negative coordinate.
  expect(clampAnnotation(annotation({ height: 800, width: 900, y: 500, x: 500 }), frame)).toMatchObject({ x: 0, y: 0 })

  // The crop is not a bound: ink laid over its edge stays exactly where it was put, and the export
  // region is what cuts the part outside.
  const crop: Box = { height: 200, width: 300, y: 100, x: 100 }
  const hanging = clampAnnotation(annotation({ y: 250, x: 340 }), frame)
  expect(hanging).toMatchObject({ x: 340, y: 250 })
  expect(bounds(hanging).maxX).toBeGreaterThan(crop.x + crop.width)
})

it('wraps a stroke in the box its ink needs, and reads the polyline back out of it', () => {
  const shaped = geometryForStroke(SQUIGGLE, 10)
  // The pad is the ink width, so the box holds the drawn line rather than only its centre.
  expect(shaped.box).toEqual({ height: 80, width: 120, x: 90, y: 190 })
  expect(shaped.points).toEqual([10, 10, 50, 70, 110, 30])
  // The points are relative to the box, so the polyline comes back in the frame.
  expect(strokePoints(annotation({ kind: 'stroke', ...shaped.box, points: shaped.points, strokeWidth: 10 }))).toEqual(SQUIGGLE)

  // A stroke below one pixel still pads by a pixel, and a fractional sample is snapped, so what is
  // stored stays on the source grid the export takes as its unit.
  expect(geometryForStroke([{ x: 100.4, y: 200 }, { x: 300, y: 500 }], 0).box).toEqual({ height: 302, width: 202, x: 99, y: 199 })

  // A truncated flat array is a missing point, not a NaN: the dangling coordinate is dropped.
  expect(strokePoints(annotation({ kind: 'stroke', height: 10, width: 10, x: 5, y: 5, points: [1, 2, 3] })))
    .toEqual([{ x: 6, y: 7 }])

  // A stroke drawn against the edge of the photo has a box the pad pushes outside it; the clamp
  // moves the origin, so the ink keeps its shape and simply stops being drawn off the pixels.
  const edged = geometryForStroke([{ x: 5, y: 300 }, { x: 40, y: 300 }], 10)
  expect(edged.box).toEqual({ height: 20, width: 55, x: -5, y: 290 })
  expect(clampAnnotation(annotation({ kind: 'stroke', ...edged.box, points: edged.points }), { height: 600, width: 800, y: 0, x: 0 }))
    .toMatchObject({ x: 0, y: 290, points: [10, 10, 45, 10] })
})

it('turns a point through the frame it belongs to', () => {
  // Right-pointing arrow in the 800×600 frame, walked one quarter turn at a time. The mapping is a
  // normalised centre times the new frame, so these are checked as close rather than exact: a sixth
  // is not representable and `1/6 × 600` comes back a hair under 100.
  const tail = { x: 100, y: 200 }
  const head = { x: 300, y: 200 }
  const turned = rotatePointToFrame(tail, LANDSCAPE, PORTRAIT, 1)
  expect(turned.x).toBeCloseTo(400, 6)
  expect(turned.y).toBeCloseTo(100, 6)
  const turnedHead = rotatePointToFrame(head, LANDSCAPE, PORTRAIT, 1)
  expect(turnedHead.x).toBeCloseTo(400, 6)
  expect(turnedHead.y).toBeCloseTo(300, 6)
  // A right-pointing segment becomes a downward one, which is what a clockwise turn looks like.
  const leftTail = rotatePointToFrame(tail, LANDSCAPE, PORTRAIT, -1)
  expect(leftTail.x).toBeCloseTo(200, 6)
  expect(leftTail.y).toBeCloseTo(700, 6)
  const leftHead = rotatePointToFrame(head, LANDSCAPE, PORTRAIT, -1)
  expect(leftHead.x).toBeCloseTo(200, 6)
  expect(leftHead.y).toBeCloseTo(500, 6)
  // Four turns are the identity, and the box mapping reuses this one, so they cannot drift apart.
  const back = rotatePointToFrame(turned, PORTRAIT, LANDSCAPE, -1)
  expect(back.x).toBeCloseTo(tail.x, 6)
  expect(back.y).toBeCloseTo(tail.y, 6)
})

it('keeps a stroke over the same pixels through every quarter turn', () => {
  const shaped = geometryForStroke(SQUIGGLE, 10)
  const stored: Partial<Annotation> = { kind: 'stroke', ...shaped.box, points: shaped.points, strokeWidth: 10 }
  let stroke = annotation(stored)

  // Clockwise, (x, y) of the 800×600 frame becomes (600 − y, x) of the portrait, point by point.
  stroke = rotateAnnotationToFrame(stroke, LANDSCAPE, PORTRAIT, 1)
  expect(strokePoints(stroke)).toEqual([{ x: 400, y: 100 }, { x: 340, y: 140 }, { x: 380, y: 200 }])
  // Thickness is only ever what was stored. Deriving it from the box would read the vertical extent
  // of the ink as its width and thicken a tall squiggle on every turn.
  expect(stroke.strokeWidth).toBe(10)

  stroke = rotateAnnotationToFrame(stroke, PORTRAIT, LANDSCAPE, 1)
  expect(strokePoints(stroke)).toEqual([{ x: 700, y: 400 }, { x: 660, y: 340 }, { x: 600, y: 380 }])

  stroke = rotateAnnotationToFrame(stroke, LANDSCAPE, PORTRAIT, 1)
  expect(strokePoints(stroke)).toEqual([{ x: 200, y: 700 }, { x: 260, y: 660 }, { x: 220, y: 600 }])

  // Four turns are the identity, the box included, so a chain of turns never grinds the ink down.
  stroke = rotateAnnotationToFrame(stroke, PORTRAIT, LANDSCAPE, 1)
  expect(strokePoints(stroke)).toEqual(SQUIGGLE)
  expect({ height: stroke.height, width: stroke.width, x: stroke.x, y: stroke.y }).toEqual(shaped.box)

  // And one turn left is where three turns right leave it.
  expect(strokePoints(rotateAnnotationToFrame(annotation(stored), LANDSCAPE, PORTRAIT, -1)))
    .toEqual([{ x: 200, y: 700 }, { x: 260, y: 660 }, { x: 220, y: 600 }])

  // A stroke that carries no width is still ink, not a hairline.
  const bare = annotation({ height: 20, width: 120, x: 90, y: 190, kind: 'stroke', points: [10, 10, 50, 70, 110, 30] })
  expect(rotateAnnotationToFrame(bare, LANDSCAPE, PORTRAIT, 1).strokeWidth).toBe(MIN_STROKE)
})

it('turns a label with the photo without spinning it', () => {
  const label = annotation({ height: 20, width: 80, y: 0, x: 0 })
  // The mark's centre follows the pixels it covers, but its own box is the mark's, not the frame's,
  // so a label keeps its size instead of being squashed into the turned axes.
  const turned = rotateAnnotationToFrame(label, LANDSCAPE, PORTRAIT, 1)
  expect(turned).toMatchObject({ height: 20, width: 80, y: 30, x: 550 })
  expect(rotateAnnotationToFrame(turned, PORTRAIT, LANDSCAPE, -1)).toMatchObject({ height: 20, width: 80, y: 0, x: 0 })
})

it('moves marks with the box when an accepted crop becomes the photo', () => {
  const crop: Box = { height: 400, width: 600, y: 80, x: 120 }
  const shaped = geometryForStroke(SQUIGGLE, 10)
  const list = [
    annotation({ height: 20, text: 'Cracked', width: 80, y: 100, x: 140 }),
    annotation({ kind: 'stroke', ...shaped.box, points: shaped.points, strokeWidth: 10 }),
  ]
  const shifted = translateAnnotationsForBake(list, crop)
  expect(shifted[0]).toMatchObject({ y: 20, x: 20 })
  // The stroke's origin moves; its points are relative to its own box, so the ink holds its shape.
  expect(shifted[1]).toMatchObject({ y: shaped.box.y - 80, x: shaped.box.x - 120, points: shaped.points })
  expect(strokePoints(shifted[1])).toEqual(SQUIGGLE.map((point) => ({ x: point.x - 120, y: point.y - 80 })))
  // An empty list comes back as the same array rather than a copy to rebuild the tree for.
  expect(translateAnnotationsForBake([], crop)).toEqual([])
})

it('cuts the ink an accepted crop leaves behind', () => {
  const crop: Box = { height: 400, width: 600, y: 80, x: 120 }
  const list = [
    annotation({ height: 20, text: 'Cracked', width: 80, y: 100, x: 140 }),
    // Wholly inside the dimmed area, so it goes with those pixels instead of coming back as a
    // floating label over the new photo.
    annotation({ height: 20, id: 'out', text: 'Scratched', width: 80, y: 500, x: 10 }),
    // Straddling the box edge: it keeps its shape and simply stops being drawn past the new photo.
    annotation({ height: 20, id: 'edge', text: 'Dent', width: 80, y: 100, x: 660 }),
  ]
  const shifted = translateAnnotationsForBake(list, crop)
  expect(shifted.map((mark) => mark.id)).toEqual(['a1', 'edge'])
  expect(shifted[0]).toMatchObject({ x: 20, y: 20 })
  expect(shifted[1]).toMatchObject({ id: 'edge', x: 540, y: 20 })
  // The new photo is the box itself, 600 wide, so the surviving label does hang past it on purpose.
  expect(bounds(shifted[1]).maxX).toBeGreaterThan(600)
})

it('sizes a new mark as a share of the crop, with a floor for a box too small to read', () => {
  expect(annotationStyleFor({ height: 600, width: 800, y: 0, x: 0 })).toEqual({ fontSize: 54, strokeWidth: 9 })
  expect(annotationStyleFor({ height: MIN_CROP, width: MIN_CROP, y: 0, x: 0 })).toEqual({ fontSize: 12, strokeWidth: 3 })
})

it('exports the crop at its own source resolution', () => {
  const crop: Box = { height: 300, width: 400, y: 50, x: 100 }
  const config = exportConfigFor(crop, 0.5)
  expect(config).toEqual({ height: 150, pixelRatio: 2, width: 200, y: 25, x: 50 })
  // Konva floors `size × pixelRatio`, so the bitmap is exactly the crop's source pixels.
  expect(Math.floor(config!.height * config!.pixelRatio)).toBe(crop.height)
  expect(Math.floor(config!.width * config!.pixelRatio)).toBe(crop.width)

  expect(exportConfigFor(crop, 0)).toBeNull()
  expect(exportConfigFor(crop, Number.NaN)).toBeNull()
  expect(exportConfigFor({ height: 0, width: 400, y: 0, x: 0 }, 0.5)).toBeNull()
})

it('only reports edits when something actually changed', () => {
  const base = { adjustments: NEUTRAL_ADJUSTMENTS, annotations: [], bakes: [], crop: fullBox(LANDSCAPE), frame: LANDSCAPE, rotation: 0 as const }

  expect(hasEdits(base)).toBe(false)
  expect(hasEdits({ ...base, rotation: 90 })).toBe(true)
  expect(hasEdits({ ...base, annotations: [annotation()] })).toBe(true)
  expect(hasEdits({ ...base, adjustments: { ...NEUTRAL_ADJUSTMENTS, brightness: 20 } })).toBe(true)
  expect(hasEdits({ ...base, crop: { height: 300, width: 800, y: 0, x: 0 } })).toBe(true)
  expect(hasEdits({ ...base, crop: { height: 600, width: 400, y: 0, x: 0 } })).toBe(true)
  // An accepted crop reset the box to the full frame and folded the turn into the pixels, so only
  // the bake list can see it — without this the user could cut the photo and be told there is
  // nothing to save.
  expect(hasEdits({ ...base, bakes: [{ box: { height: 300, width: 400, y: 0, x: 0 }, rotation: 0 as const }] })).toBe(true)
  // Sub-pixel rounding on the crop is not an edit the user made.
  expect(hasEdits({ ...base, crop: { height: 599.4, width: 799, y: 0, x: 0 } })).toBe(false)
})
