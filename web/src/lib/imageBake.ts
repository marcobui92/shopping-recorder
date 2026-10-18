export const MAX_OUTPUT_EDGE = 4096
// The whole frame is alive in three canvases at once (working canvas, Konva's cache scene, its
// filter copy), so the iOS ~4096² ceiling needs headroom on the area as well as the long edge.
export const MAX_CANVAS_AREA = 16_000_000
/** Below this many source pixels a "photo" is a thumbnail, so the crop box will not shrink further. */
export const MIN_CROP = 48
export const OUTPUT_QUALITY = 0.85
export const OUTPUT_CONTENT_TYPE = 'image/jpeg' as const
export const MAX_FILENAME_LENGTH = 255

export interface SourceSize {
  height: number
  width: number
}

export interface Point {
  x: number
  y: number
}

/** A rectangle in some pixel space; which space is decided by the caller. */
export interface Box {
  height: number
  width: number
  x: number
  y: number
}

export type RotationDegrees = 0 | 90 | 180 | 270

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Downsample into the largest box that both caps allow, never upscaling. A 5000×5000 source fits
 * the long edge exactly at 4096², which is the canvas ceiling itself, so the area bound bites
 * first and leaves room for the three canvases that hold it.
 */
export function clampLongEdge(size: SourceSize, maxEdge = MAX_OUTPUT_EDGE, maxArea = MAX_CANVAS_AREA): SourceSize {
  const longEdge = Math.max(size.width, size.height)
  if (longEdge <= 0) return { ...size }
  const area = size.width * size.height
  const scale = Math.min(
    longEdge > maxEdge ? maxEdge / longEdge : 1,
    area > maxArea ? Math.sqrt(maxArea / area) : 1,
  )
  if (scale === 1) return { ...size }
  return {
    height: Math.max(1, Math.round(size.height * scale)),
    width: Math.max(1, Math.round(size.width * scale)),
  }
}

/** The axis-aligned box the source occupies on screen once the group has rotated it. */
export function frameFor(source: SourceSize, rotation: RotationDegrees): SourceSize {
  return rotation % 180 === 90 ? { height: source.width, width: source.height } : { ...source }
}

/**
 * Display pixels per source pixel when the whole frame has to fit the holder. Capped at 1 because
 * upscaling a photo only makes the crop box harder to read, and it keeps the export at or above
 * source resolution.
 */
export function fitScaleFor(frame: SourceSize, box: SourceSize): number {
  if (!(frame.width > 0) || !(frame.height > 0) || !(box.width >= 1) || !(box.height >= 1)) return 1
  return Math.min(1, box.width / frame.width, box.height / frame.height)
}

/** The stage is the whole photo, so its size follows from the fit scale. */
export function stageSizeFor(frame: SourceSize, scale: number): SourceSize {
  return { height: Math.max(1, Math.floor(frame.height * scale)), width: Math.max(1, Math.floor(frame.width * scale)) }
}

export function fullBox(bounds: SourceSize): Box {
  return { height: bounds.height, width: bounds.width, x: 0, y: 0 }
}

/** Keep a box inside another box, which need not start at the origin, and no smaller than `min`. */
export function containBox(box: Box, bounds: Box, min = 1): Box {
  const width = Math.round(clamp(box.width, Math.min(min, bounds.width), bounds.width))
  const height = Math.round(clamp(box.height, Math.min(min, bounds.height), bounds.height))
  return {
    height,
    width,
    x: Math.round(clamp(box.x, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - width))),
    y: Math.round(clamp(box.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - height))),
  }
}

/** Keep a crop inside the frame and no smaller than the floor. */
export function clampBox(box: Box, bounds: SourceSize, min = 1): Box {
  return containBox(box, fullBox(bounds), min)
}

/** Source pixels to stage pixels. Konva draws in stage pixels and the crop is stored in source. */
export function boxToStage(box: Box, scale: number): Box {
  return {
    height: Math.max(1, Math.round(box.height * scale)),
    width: Math.max(1, Math.round(box.width * scale)),
    x: Math.round(box.x * scale),
    y: Math.round(box.y * scale),
  }
}

/** And back, after a drag or an anchor resize, clamped into the frame. */
export function boxFromStage(box: Box, scale: number, frame: SourceSize): Box {
  if (!(scale > 0) || !Number.isFinite(scale)) return fullBox(frame)
  return clampBox({ height: box.height / scale, width: box.width / scale, x: box.x / scale, y: box.y / scale }, frame, MIN_CROP)
}

/**
 * The largest box of `aspect` (width over height, in source pixels) that fits the frame, centred on
 * where the crop is now, so picking a ratio never throws the framing away.
 */
export function cropForAspect(frame: SourceSize, aspect: number, current: Box): Box {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return clampBox(current, frame, MIN_CROP)
  const centerX = current.x + current.width / 2
  const centerY = current.y + current.height / 2
  let width = frame.width
  let height = width / aspect
  if (height > frame.height) {
    height = frame.height
    width = height * aspect
  }
  return clampBox({ height, width, x: centerX - width / 2, y: centerY - height / 2 }, frame, MIN_CROP)
}

/**
 * A quarter turn swaps the frame's axes, so a point written in the old frame has to move to where
 * those pixels now are. The mapping goes through the frame's normalised centre, which is what keeps
 * it right when the frame changes shape at the same time.
 */
export function rotatePointToFrame(point: Point, from: SourceSize, to: SourceSize, direction: 1 | -1): Point {
  if (!(from.width > 0) || !(from.height > 0) || !(to.width > 0) || !(to.height > 0)) return { ...point }
  const center = { x: (point.x - from.width / 2) / from.width, y: (point.y - from.height / 2) / from.height }
  const turned = direction === 1 ? { x: -center.y, y: center.x } : { x: center.y, y: -center.x }
  return { x: to.width / 2 + turned.x * to.width, y: to.height / 2 + turned.y * to.height }
}

/**
 * A box turns by its centre, and its own axes belong to the frame rather than to the pixels, so
 * width and height swap. Anything anchored to the pixels turns point by point instead — see
 * `rotateAnnotationToFrame`.
 */
export function rotateBoxToFrame(box: Box, from: SourceSize, to: SourceSize, direction: 1 | -1): Box {
  if (!(from.width > 0) || !(from.height > 0) || !(to.width > 0) || !(to.height > 0)) return box
  const nextCenter = rotatePointToFrame({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, from, to, direction)
  const width = Math.max(1, Math.round(box.height * to.width / from.height))
  const height = Math.max(1, Math.round(box.width * to.height / from.width))
  return { height, width, x: nextCenter.x - width / 2, y: nextCenter.y - height / 2 }
}

/**
 * The four dim panels around the crop. Four rects rather than a blend mode or a clip, because the
 * mask shares a canvas with the cached photo (destination-out would punch a hole in the photo too)
 * and Konva's clip has no clip-out mode at all.
 */
export function maskPanels(crop: Box, stage: SourceSize): Box[] {
  const panels: Box[] = []
  if (crop.y > 0) panels.push({ height: crop.y, width: stage.width, x: 0, y: 0 })
  const bottom = crop.y + crop.height
  if (bottom < stage.height) panels.push({ height: stage.height - bottom, width: stage.width, x: 0, y: bottom })
  if (crop.x > 0) panels.push({ height: crop.height, width: crop.x, x: 0, y: crop.y })
  const right = crop.x + crop.width
  if (right < stage.width) panels.push({ height: crop.height, width: stage.width - right, x: right, y: crop.y })
  return panels
}

export type AnnotationKind = 'stroke' | 'text'

export interface Annotation {
  color: string
  /** Box height: the font size for text, the vertical extent of the ink for a stroke. */
  height: number
  id: string
  kind: AnnotationKind
  /** Only strokes: flat `[x0,y0,x1,y1,…]` relative to the mark's own box, in source pixels. */
  points?: number[]
  /** Only strokes: the ink width, which the box does not carry. */
  strokeWidth?: number
  text?: string
  width: number
  x: number
  y: number
}

export interface AnnotationPatch {
  color?: string
  height?: number
  points?: number[]
  strokeWidth?: number
  text?: string
  width?: number
  x?: number
  y?: number
}

export interface AdjustmentState {
  brightness: number
  contrast: number
  saturation: number
}

export const NEUTRAL_ADJUSTMENTS: AdjustmentState = { brightness: 0, contrast: 0, saturation: 0 }

/**
 * A crop the user accepted, kept as a step rather than as re-encoded pixels: the base is rebuilt
 * from the pristine decode by rotating `rotation` and cutting `box`, in the source space of the base
 * at that point. Nothing is JPEG-encoded before Apply, and the Konva filters stay live sliders.
 */
export interface BakedCrop {
  box: Box
  rotation: RotationDegrees
}

/** Everything the editor was left showing, so reopening it continues instead of starting over. */
export interface EditorState {
  adjustments: AdjustmentState
  annotations: Annotation[]
  aspectKey: string
  bakes: BakedCrop[]
  crop: Box
  rotation: RotationDegrees
}

/**
 * Sliders speak -100..100. Konva's channels do not: Brighten reads brightness as -1..1, Contrast
 * wants the raw -100..100, and HSL applies saturation as an exponent (2^s), so -1 halves and 1
 * doubles instead of clamping at the ends.
 */
export function konvaFilterValues(adjustments: AdjustmentState): { brightness: number; contrast: number; saturation: number } {
  return {
    brightness: clamp(adjustments.brightness / 100, -1, 1),
    contrast: clamp(adjustments.contrast, -100, 100),
    saturation: clamp(adjustments.saturation / 100, -1, 1),
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [, contentType = OUTPUT_CONTENT_TYPE, base64 = ''] = dataUrl.match(/^data:([^;,]+)[^,]*,([\s\S]*)$/) ?? []
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: contentType })
}

export function updateAnnotation(list: Annotation[], id: string, patch: AnnotationPatch): Annotation[] {
  return list.map((annotation) => (annotation.id === id ? { ...annotation, ...patch } : annotation))
}

export function outputFilename(originalName: string): string {
  const withoutExtension = originalName.replace(/\.[^./\\]+$/, '').trim() || 'image'
  const suffix = '-edited.jpg'
  const budget = MAX_FILENAME_LENGTH - suffix.length
  return `${withoutExtension.slice(0, Math.max(1, budget))}${suffix}`
}

export function removeAnnotation(list: Annotation[], id: string): Annotation[] {
  return list.filter((annotation) => annotation.id !== id)
}

/**
 * A mark belongs to the photo, not to the crop box: it may sit anywhere inside `bounds`, and whatever
 * of it falls outside the crop is cut exactly like the pixels underneath it. Clamping marks to the
 * crop instead drags ink away from the part it was drawn to point at.
 */
export function clampAnnotation(box: Annotation, bounds: Box): Annotation {
  return {
    ...box,
    x: Math.round(clamp(box.x, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - box.width))),
    y: Math.round(clamp(box.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - box.height))),
  }
}

/** The thinnest pencil still readable as ink rather than as a hairline. */
export const MIN_STROKE = 3

/**
 * The box a freehand stroke needs to be clamped and dragged by, and the points that box is drawn
 * from. The pad is the ink half-width plus its round cap, so the visible ink — not just the centre
 * line — stays inside the box, which is what keeps "what you see" equal to "what uploads".
 *
 * Points land on whole source pixels: a turned polyline comes out of a normalised-centre mapping
 * full of fractions, and the export takes the source grid as its unit.
 */
export function geometryForStroke(points: Point[], strokeWidth: number): { box: Box; points: number[] } {
  const snapped = points.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }))
  const pad = Math.max(1, Math.round(strokeWidth))
  const left = Math.min(...snapped.map((point) => point.x))
  const top = Math.min(...snapped.map((point) => point.y))
  const right = Math.max(...snapped.map((point) => point.x))
  const bottom = Math.max(...snapped.map((point) => point.y))
  const x = left - pad
  const y = top - pad
  return {
    box: { height: Math.max(1, bottom - y + pad), width: Math.max(1, right - x + pad), x, y },
    points: snapped.flatMap((point) => [point.x - x, point.y - y]),
  }
}

/** The polyline of a stored stroke, back in the frame it belongs to. */
export function strokePoints(annotation: Annotation): Point[] {
  const flat = annotation.points ?? []
  const points: Point[] = []
  for (let index = 0; index + 1 < flat.length; index += 2) {
    points.push({ x: annotation.x + flat[index], y: annotation.y + flat[index + 1] })
  }
  return points
}

/**
 * An accepted crop becomes the new base, so everything stored against the old frame has to shift by
 * the box origin. The points are relative to the mark's own box, so only the origin moves.
 *
 * Accepting also cuts: a mark lying wholly in the dimmed area goes with those pixels rather than
 * coming back as a floating label, while one that straddles the edge keeps its shape and simply
 * stops being drawn past it.
 */
export function translateAnnotationsForBake(annotations: Annotation[], crop: Box): Annotation[] {
  if (annotations.length === 0) return annotations
  return annotations
    .filter((annotation) => annotation.x < crop.x + crop.width && annotation.x + annotation.width > crop.x
      && annotation.y < crop.y + crop.height && annotation.y + annotation.height > crop.y)
    .map((annotation) => ({
      ...annotation,
      x: Math.round(annotation.x - crop.x),
      y: Math.round(annotation.y - crop.y),
    }))
}

/**
 * Marks turn with the photo, so a label moves to where the pixels it covers now are. Its own size
 * belongs to the mark rather than to the frame's axes, so it keeps its width and height and only
 * its centre travels. A stroke instead turns point by point through the same mapping, so the ink
 * keeps covering the same pixels — which is what its box is then rebuilt from.
 */
export function rotateAnnotationToFrame(box: Annotation, from: SourceSize, to: SourceSize, direction: 1 | -1): Annotation {
  if (box.points) {
    // Thickness is only ever what was stored: for a stroke `height` is how far the ink reaches, so
    // deriving it from the box would thicken a tall squiggle on every quarter turn.
    const stroke = box.strokeWidth ?? MIN_STROKE
    const turned = geometryForStroke(strokePoints(box).map((point) => rotatePointToFrame(point, from, to, direction)), stroke)
    return { ...box, ...turned.box, points: turned.points, strokeWidth: stroke }
  }
  const turned = rotateBoxToFrame({ height: box.height, width: box.width, x: box.x, y: box.y }, from, to, direction)
  const centerX = turned.x + turned.width / 2
  const centerY = turned.y + turned.height / 2
  return { ...box, x: centerX - box.width / 2, y: centerY - box.height / 2 }
}

/**
 * The starting size of a new mark, as a share of the crop's own height in source pixels, so a label
 * or a pencil line keeps the same proportion of the finished file whatever the box is.
 */
export function annotationStyleFor(crop: Box): { fontSize: number; strokeWidth: number } {
  return {
    fontSize: Math.max(12, Math.round(crop.height * 0.09)),
    strokeWidth: Math.max(3, Math.round(crop.height * 0.015)),
  }
}

/**
 * Konva sizes the exported bitmap as `floor(logicalSize × pixelRatio)` and takes `x`/`y` verbatim,
 * so the crop is rounded to whole stage pixels and the ratio is the reciprocal of the display scale
 * — which lands the output back on the crop's own source pixels and samples the image cache 1:1.
 * Returns null for a box too small or too degenerate to draw.
 */
export function exportConfigFor(crop: Box, scale: number): { height: number; pixelRatio: number; width: number; x: number; y: number } | null {
  if (!(scale > 0) || !Number.isFinite(scale) || !(crop.width >= 1) || !(crop.height >= 1)) return null
  const region = boxToStage(crop, scale)
  return { ...region, pixelRatio: 1 / scale }
}

export function hasEdits(input: {
  adjustments: AdjustmentState
  annotations: Annotation[]
  bakes: BakedCrop[]
  crop: Box
  frame: SourceSize
  rotation: RotationDegrees
}): boolean {
  const { adjustments, annotations, bakes, crop, frame, rotation } = input
  // An accepted crop reset the box to the full frame and the turn into the pixels, so neither of the
  // two checks below can see it — without this the user could accept a crop and be told there is
  // nothing to save.
  if (annotations.length > 0 || bakes.length > 0 || rotation !== 0) return true
  if (adjustments.brightness !== 0 || adjustments.contrast !== 0 || adjustments.saturation !== 0) return true
  return crop.width < frame.width - 1 || crop.height < frame.height - 1
}

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  // No options argument: Safari has historically accepted createImageBitmap options while
  // ignoring them, so rotation is carried by the Konva group instead.
  return createImageBitmap(blob)
}

/**
 * Downsample the decoded photo once, into a canvas that stays inside both caps. Rotation is not
 * applied here: the group carries it, and Konva only runs filters on a cached node whose box is
 * measured without rotation.
 */
export function drawWorkingCanvas(source: ImageBitmap): { canvas: HTMLCanvasElement; size: SourceSize } {
  const size = clampLongEdge({ height: source.height, width: source.width })
  const canvas = document.createElement('canvas')
  canvas.height = size.height
  canvas.width = size.width
  const context = canvas.getContext('2d')
  if (!context) throw new Error('CANVAS_UNAVAILABLE')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, size.width, size.height)
  return { canvas, size }
}

/**
 * Commit an accepted crop: the box is cut out of the base and becomes the new base, with the
 * quarter turn baked into the pixels so the editor can carry on with rotation 0. Raw pixels only —
 * no encode, and deliberately no filters, because the sliders have to stay live on the result.
 *
 * The rotation is a drawing transform on the context, never `createImageBitmap` options, and the
 * region is snapped to whole source pixels so the new base stays on the source grid the export
 * assumes. It cannot grow the canvas, so the caps in `clampLongEdge` keep holding across a chain.
 */
export function bakeCropToCanvas(source: HTMLCanvasElement, box: Box, rotation: RotationDegrees): { canvas: HTMLCanvasElement; size: SourceSize } {
  const unrotated: SourceSize = { height: source.height, width: source.width }
  const frame = frameFor(unrotated, rotation)
  const region = {
    height: Math.max(1, Math.min(Math.round(box.height), frame.height)),
    width: Math.max(1, Math.min(Math.round(box.width), frame.width)),
    x: Math.max(0, Math.min(Math.round(box.x), frame.width - 1)),
    y: Math.max(0, Math.min(Math.round(box.y), frame.height - 1)),
  }
  region.height = Math.min(region.height, frame.height - region.y)
  region.width = Math.min(region.width, frame.width - region.x)

  const canvas = document.createElement('canvas')
  canvas.height = region.height
  canvas.width = region.width
  const context = canvas.getContext('2d')
  if (!context) throw new Error('CANVAS_UNAVAILABLE')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  if (rotation === 0) {
    context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
  } else {
    // Same transform the Konva group applies: turn the whole frame about its centre, then slide the
    // wanted region onto the canvas origin.
    context.translate(-region.x, -region.y)
    context.translate(frame.width / 2, frame.height / 2)
    context.rotate((rotation * Math.PI) / 180)
    context.drawImage(source, -unrotated.width / 2, -unrotated.height / 2)
  }
  return { canvas, size: { height: region.height, width: region.width } }
}
