import { useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import { Check, Crop, Pen, RefreshCw, RotateCcw, RotateCw, SlidersHorizontal, Type, Undo2, X } from 'lucide-react'

import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useI18n } from '../i18n'
import {
  annotationStyleFor,
  boxFromStage,
  boxToStage,
  clampAnnotation,
  containBox,
  cropForAspect,
  clampBox,
  dataUrlToBlob,
  drawWorkingCanvas,
  bakeCropToCanvas,
  exportConfigFor,
  fitScaleFor,
  frameFor,
  fullBox,
  geometryForStroke,
  hasEdits,
  konvaFilterValues,
  loadBitmap,
  maskPanels,
  MIN_CROP,
  MIN_STROKE,
  NEUTRAL_ADJUSTMENTS,
  outputFilename,
  OUTPUT_CONTENT_TYPE,
  OUTPUT_QUALITY,
  removeAnnotation,
  rotateAnnotationToFrame,
  rotateBoxToFrame,
  stageSizeFor,
  translateAnnotationsForBake,
  updateAnnotation,
  type AdjustmentState,
  type Annotation,
  type BakedCrop,
  type Box,
  type EditorState,
  type Point,
  type RotationDegrees,
  type SourceSize,
} from '../lib/imageBake'

export interface EditorResult {
  blob: Blob
  name: string
  /** What the editor was left showing, so reopening it continues from here. */
  state: EditorState
}

interface ImageEditorProps {
  blob: Blob
  initialState?: EditorState | null
  name: string
  onApply: (result: EditorResult) => void
  onCancel: () => void
}

const MARK_COLORS: readonly { label: string; value: string }[] = [
  { label: 'Red', value: '#D92B45' },
  { label: 'White', value: '#FFFFFF' },
  { label: 'Black', value: '#141414' },
]
const QUARTER_TURNS: readonly RotationDegrees[] = [0, 90, 180, 270]
const ADJUST_KEYS: readonly ('brightness' | 'contrast' | 'saturation')[] = ['brightness', 'contrast', 'saturation']
const ASPECT_PRESETS: readonly { aspect?: number; key: string; label: string }[] = [
  { key: 'full', label: 'Full frame' },
  { aspect: 1, key: '1:1', label: '1:1' },
  { aspect: 4 / 3, key: '4:3', label: '4:3' },
  { aspect: 3 / 4, key: '3:4', label: '3:4' },
  { aspect: 16 / 9, key: '16:9', label: '16:9' },
  { aspect: 9 / 16, key: '9:16', label: '9:16' },
  { key: 'custom', label: 'Custom' },
]
// Corner handles only while a ratio is locked: an edge anchor cannot respect one.
const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const ALL_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']
/** A finger has to land on a thin line, so its hit region is wider than the ink. */
const MIN_HIT_STROKE = 28
/** A sample this close to the previous one is the same pixel, so it would only bloat the polyline. */
const MIN_STROKE_STEP = 3
// react-konva diffs props by identity, so the live line's idle points must be one stable reference:
// a fresh `[]` per render would be re-applied and wipe the path the pointer handler just drew.
const NO_POINTS: number[] = []

/** 0 means the box is free; "Full frame" stands in for the frame's own ratio. */
function ratioFor(key: string, frame: SourceSize): number {
  if (key === 'custom') return 0
  const preset = ASPECT_PRESETS.find((entry) => entry.key === key)
  return preset?.aspect ?? frame.width / frame.height
}

/**
 * Konva resizes a node by setting its scale, so the drawn box has to be folded back into width and
 * height before React takes over again: applyNodeProps will not reset a scale it never applied.
 */
function foldScale(node: Konva.Node): { height: number; width: number } {
  const size = { height: Math.max(1, node.height() * node.scaleY()), width: Math.max(1, node.width() * node.scaleX()) }
  node.scaleX(1)
  node.scaleY(1)
  return size
}

function clampPoint(point: Point, box: Box): Point {
  return {
    x: Math.round(Math.min(Math.max(point.x, box.x), box.x + box.width)),
    y: Math.round(Math.min(Math.max(point.y, box.y), box.y + box.height)),
  }
}

export default function ImageEditor({ blob, initialState, name, onApply, onCancel }: ImageEditorProps) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)
  const holderRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const chromeLayerRef = useRef<Konva.Layer>(null)
  const imageRef = useRef<Konva.Image>(null)
  const cropNodeRef = useRef<Konva.Rect>(null)
  const cropTransformerRef = useRef<Konva.Transformer>(null)
  const markTransformerRef = useRef<Konva.Transformer>(null)
  const nodeRefs = useRef(new Map<string, Konva.Node>())

  const [source, setSource] = useState<{ canvas: HTMLCanvasElement; size: SourceSize } | null>(null)
  const [holder, setHolder] = useState<SourceSize>({ height: 0, width: 0 })
  const [rotation, setRotation] = useState<RotationDegrees>(0)
  const [aspectKey, setAspectKey] = useState('full')
  const [crop, setCrop] = useState<Box>({ height: 0, width: 0, x: 0, y: 0 })
  const [markColor, setMarkColor] = useState(MARK_COLORS[0].value)
  const [adjustments, setAdjustments] = useState<AdjustmentState>(NEUTRAL_ADJUSTMENTS)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [bakes, setBakes] = useState<BakedCrop[]>([])
  // What each accepted crop overwrote and the step list cannot rebuild: the marks its cut dropped,
  // and the preset the box was under.
  const [undoSteps, setUndoSteps] = useState<{ annotations: Annotation[]; aspectKey: string }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // While the pencil is on, a one-finger drag means "draw", so nothing else may answer to a
  // pointer — or a stroke would also drag the crop box and the mark under the finger.
  const [pencilOn, setPencilOn] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [errorKey, setErrorKey] = useState('')
  // Set by the mount effect from the carried state: the file in the list is the output of an earlier
  // save, so it is not the photo the sheet is drawing from.
  const [savedIsEdited, setSavedIsEdited] = useState(false)
  const [reverted, setReverted] = useState(false)

  // The stroke being drawn lives on the Konva node, not in React state: a finger generates a
  // pointermove per frame and re-rendering the sheet at 60Hz would drop the path behind the pointer.
  const liveLineRef = useRef<Konva.Line>(null)
  const strokeRef = useRef<{ color: string; points: Point[]; pointerId: number; width: number } | null>(null)
  // Undo and reset both rebuild the base from the pristine bytes, so a second tap while the first is
  // in flight would replay against a stack that has already moved.
  const busyRef = useRef(false)

  // Read once, at mount: the editor is keyed per file and remounts for every open, so the state a
  // previous pass left behind must not re-decode the photo when the parent re-renders.
  const initialStateRef = useRef(initialState ?? null)

  useEffect(() => { panelRef.current?.focus() }, [])

  // The holder only exists once the photo is decoded, so the observer goes in with it; measuring it
  // before then would leave the stage at its degenerate fallback size forever.
  useEffect(() => {
    const node = holderRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      setHolder({ height: Math.floor(entry.contentRect.height), width: Math.floor(entry.contentRect.width) })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [source])

  useEffect(() => {
    let active = true
    void loadBitmap(blob).then((bitmap) => {
      if (!active) return bitmap.close()
      try {
        let framed = drawWorkingCanvas(bitmap)
        // A 48MP bitmap is around 195 MB and the frame stays in three canvases from here on.
        bitmap.close()
        const initial = initialStateRef.current
        // Rebuild the base the user left from the pristine bytes, before restoring anything on top of
        // it. Raw pixels, no encode and no filters, so the sliders stay live on the result.
        for (const bake of initial?.bakes ?? []) framed = bakeCropToCanvas(framed.canvas, bake.box, bake.rotation)
        const nextRotation: RotationDegrees = initial && QUARTER_TURNS.includes(initial.rotation) ? initial.rotation : 0
        const nextFrame = frameFor(framed.size, nextRotation)
        const nextCrop = initial ? clampBox(initial.crop, nextFrame, MIN_CROP) : fullBox(framed.size)
        setSource(framed)
        setBakes(initial ? [...initial.bakes] : [])
        setRotation(nextRotation)
        setAspectKey(initial && ASPECT_PRESETS.some((preset) => preset.key === initial.aspectKey) ? initial.aspectKey : 'full')
        setCrop(nextCrop)
        setAdjustments(initial?.adjustments ?? NEUTRAL_ADJUSTMENTS)
        setAnnotations((initial?.annotations ?? []).map((mark) => clampAnnotation(mark, fullBox(nextFrame))))
        // Whether the file in the list is already the output of a previous save. A reset on such a
        // file is itself a change: the sheet ends up clean while the list still carries the ink.
        const carriedEdits = initial
          ? hasEdits({ adjustments: initial.adjustments, annotations: initial.annotations, bakes: initial.bakes, crop: initial.crop, frame: nextFrame, rotation: initial.rotation })
          : false
        setSavedIsEdited(carriedEdits)
      } catch {
        setErrorKey('Editing failed. The original file is still ready to upload.')
      }
    }).catch(() => { if (active) setErrorKey('This file cannot be edited on this device.') })
    return () => { active = false }
  }, [blob])

  const frame = source ? frameFor(source.size, rotation) : null
  // Everything the user manipulates is stored in source pixels and drawn at this one ratio, so a
  // holder resize moves nothing but the drawing, and the export lands back on the source grid.
  const scale = frame ? fitScaleFor(frame, holder) : 1
  const stage = frame ? stageSizeFor(frame, scale) : { height: 0, width: 0 }
  const cropStage = boxToStage(crop, scale)
  const output = frame ? exportConfigFor(crop, scale) : null
  // Marks are bounded by the photo and cut by the box, so the two bounds are different things: these
  // are the whole frame, in source px and in stage px.
  const frameBox = frame ? fullBox(frame) : crop
  const stageBox = { height: stage.height, width: stage.width, x: 0, y: 0 }
  const ready = Boolean(frame) && holder.width >= 1 && holder.height >= 1
  const selected = annotations.find((annotation) => annotation.id === selectedId) ?? null
  // A turn bakes away together with the crop, and a box the size of the photo cuts nothing, so the
  // button is dead until the box is smaller than the photo or the photo is turned.
  const canBake = frame !== null && (rotation !== 0 || crop.width < frame.width - 1 || crop.height < frame.height - 1)
  // The same question Apply asks, so the reset control appears exactly when there is something to
  // reset and not before — it would otherwise offer to throw away a photo the user has not touched.
  const dirty = frame !== null && hasEdits({ adjustments, annotations, bakes, crop, frame, rotation })
  // A reset that follows a previous save is the one edit `hasEdits` cannot see: the sheet is clean and
  // the file in the list is not. Without this the control emptied the sheet and `Lưu ảnh đã sửa` then
  // refused to write the clean photo back, so the discard could not be committed at all.
  const revertsSavedEdit = savedIsEdited && reverted

  // Konva only runs filters on a cached node, so this effect is what makes the sliders do anything.
  // pixelRatio 1 is not an optimization: Konva would otherwise fall back to the device ratio and an
  // iPhone at 3× would allocate the cache three times over. The hit canvas is built lazily and the
  // image never listens, so hitCanvasPixelRatio is only insurance against a future listener.
  // Never cache the layer or any ancestor of the marks: it disables the transform cache below it.
  // Keyed on `ready`, not just `source`: the stage - and with it the node - only mounts once the
  // holder has been measured, so an effect keyed on the bitmap alone would find a null ref forever.
  // And on every bake: an `imageChange` on a cached node does not redraw the cache, so an accepted
  // crop would otherwise still show - and export - the base it replaced.
  useEffect(() => {
    const node = imageRef.current
    if (!node || !source) return
    node.clearCache()
    node.cache({ hitCanvasPixelRatio: 0.1, pixelRatio: 1 })
    node.getLayer()?.batchDraw()
    return () => { node.clearCache() }
  }, [ready, source])

  // Both Transformers attach imperatively — react-konva has no `nodes` prop. The mark node lives in
  // the layer above its transformer, which holds because neither layer is transformed.
  useEffect(() => {
    const target = cropNodeRef.current
    const transformer = cropTransformerRef.current
    if (!target || !transformer) return
    transformer.nodes([target])
    transformer.getLayer()?.batchDraw()
  }, [ready])

  // Only labels get a scale Transformer. A stroke is a freehand path, and scaling one is not a way
  // to make it mean something else, so it is dragged as a whole instead.
  useEffect(() => {
    const mark = pencilOn ? undefined : annotations.find((annotation) => annotation.id === selectedId)
    const target = mark && mark.kind === 'text' ? nodeRefs.current.get(mark.id) : undefined
    const transformer = markTransformerRef.current
    if (!transformer) return
    transformer.nodes(target ? [target] : [])
    transformer.getLayer()?.batchDraw()
  }, [annotations, pencilOn, selectedId])

  const filterValues = useMemo(() => konvaFilterValues(adjustments), [adjustments])
  const activeFilters = useMemo(() => {
    const list: (typeof Konva.Filters.Brighten)[] = []
    if (filterValues.brightness !== 0) list.push(Konva.Filters.Brighten)
    if (filterValues.contrast !== 0) list.push(Konva.Filters.Contrast)
    if (filterValues.saturation !== 0) list.push(Konva.Filters.HSL)
    return list
  }, [filterValues])

  const thirds = useMemo(() => {
    const { height, width, x, y } = cropStage
    return [
      [x + width / 3, y, x + width / 3, y + height],
      [x + (2 * width) / 3, y, x + (2 * width) / 3, y + height],
      [x, y + height / 3, x + width, y + height / 3],
      [x, y + (2 * height) / 3, x + width, y + (2 * height) / 3],
    ]
  }, [cropStage.height, cropStage.width, cropStage.x, cropStage.y])

  function keepInside(box: Box, bounds: Box): (position: Point) => Point {
    const maxX = Math.max(bounds.x, bounds.x + bounds.width - box.width)
    const maxY = Math.max(bounds.y, bounds.y + bounds.height - box.height)
    return (position) => ({ x: Math.min(Math.max(position.x, bounds.x), maxX), y: Math.min(Math.max(position.y, bounds.y), maxY) })
  }

  /** Where the finger is, in the frame's own source pixels. */
  function pointerInFrame(): Point | null {
    const node = stageRef.current
    if (!node || !frame || !(scale > 0)) return null
    const position = node.getPointerPosition()
    if (!position) return null
    return clampPoint({ x: position.x / scale, y: position.y / scale }, frameBox)
  }

  /** Write the finger path onto the live node. Konva paints it; React does not know about it yet. */
  function drawLive(points: Point[]) {
    const node = liveLineRef.current
    if (!node) return
    node.points(points.flatMap((point) => [Math.round(point.x * scale), Math.round(point.y * scale)]))
    node.getLayer()?.batchDraw()
  }

  /**
   * The box a stroke's centre line may be laid in: the whole photo pulled in by the ink pad, so no
   * part of the line can be drawn off the pixels the editor has to work from.
   */
  function inkArea(width: number): Box {
    const pad = Math.max(1, Math.round(width))
    return {
      height: Math.max(1, frameBox.height - pad * 2),
      width: Math.max(1, frameBox.width - pad * 2),
      x: frameBox.x + pad,
      y: frameBox.y + pad,
    }
  }

  /** The mark a finished path becomes, or null while it is too short to be ink. */
  function strokeToMark(stroke: { color: string; points: Point[]; width: number }): Annotation | null {
    if (stroke.points.length < 2) return null
    const shaped = geometryForStroke(stroke.points, stroke.width)
    return clampAnnotation({
      color: stroke.color,
      height: shaped.box.height,
      id: `stroke${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      kind: 'stroke',
      points: shaped.points,
      strokeWidth: stroke.width,
      text: undefined,
      width: shaped.box.width,
      x: shaped.box.x,
      y: shaped.box.y,
    }, frameBox)
  }

  function togglePencil() {
    strokeRef.current = null
    drawLive([])
    setSelectedId(null)
    setPencilOn((on) => !on)
    setErrorKey('')
  }

  function startStroke(event: Konva.KonvaEventObject<PointerEvent>) {
    const stage = stageRef.current
    const position = pointerInFrame()
    if (!stage || !position || strokeRef.current) return
    const width = annotationStyleFor(crop).strokeWidth
    const point = clampPoint(position, inkArea(width))
    // Konva captures a pointer only for a listening shape, and the pencil leaves nothing listening,
    // so without this a finger that wanders off the canvas into the letterbox band loses its stroke
    // and never gets a pointerup either — the stage binds pointer events on its own div, nothing above.
    stage.setPointerCapture(event.evt.pointerId)
    strokeRef.current = { color: markColor, points: [point], pointerId: event.evt.pointerId, width }
    drawLive([point])
  }

  function moveStroke(event: Konva.KonvaEventObject<PointerEvent>) {
    const stroke = strokeRef.current
    const point = pointerInFrame()
    if (!stroke || !point || event.evt.pointerId !== stroke.pointerId) return
    const bounds = inkArea(stroke.width)
    const last = stroke.points[stroke.points.length - 1]
    const next = clampPoint(point, bounds)
    // A sample closer than a few source pixels is the same pixel, and a denser polyline only costs
    // a longer path to draw and to store.
    if (Math.abs(next.x - last.x) < MIN_STROKE_STEP && Math.abs(next.y - last.y) < MIN_STROKE_STEP) return
    stroke.points.push(next)
    drawLive(stroke.points)
  }

  function endStroke(event: Konva.KonvaEventObject<PointerEvent>) {
    const stage = stageRef.current
    const stroke = strokeRef.current
    if (!stage || !stroke) return
    // A second finger lifting also reaches the stage, and that is not the end of this stroke.
    if (event.evt.pointerId !== stroke.pointerId) return
    strokeRef.current = null
    stage.releaseCapture(stroke.pointerId)
    drawLive([])
    const mark = strokeToMark(stroke)
    if (mark) setAnnotations((current) => [...current, mark])
  }

  function abortStroke(event: Konva.KonvaEventObject<PointerEvent>) {
    const stage = stageRef.current
    const stroke = strokeRef.current
    if (!stage || !stroke || event.evt.pointerId !== stroke.pointerId) return
    // The browser took the gesture over, so the path is only half a stroke. Drop it rather than
    // commit a line the finger did not finish.
    strokeRef.current = null
    stage.releaseCapture(stroke.pointerId)
    drawLive([])
  }

  function removeLastStroke() {
    setAnnotations((current) => {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (current[index].kind === 'stroke') return current.filter((_, position) => position !== index)
      }
      return current
    })
  }

  /** Dragging a stroke moves the whole path, so only its origin changes and the points hold. */
  function commitMarkMove(node: Konva.Node, mark: Annotation) {
    if (!frame) return
    const next = clampAnnotation({ ...mark, x: Math.round(node.x() / scale), y: Math.round(node.y() / scale) }, frameBox)
    setAnnotations((current) => updateAnnotation(current, mark.id, next))
    // Put the node on the clamped box now: if the state comes back unchanged React has no new props
    // to apply, and the mark would sit where the finger stopped instead of where the box says.
    node.position(boxToStage(next, scale))
  }

  function commitCrop(node: Konva.Node) {
    if (!frame) return
    const size = foldScale(node)
    const next = boxFromStage({ ...size, x: node.x(), y: node.y() }, scale, frame)
    const ratio = ratioFor(aspectKey, frame)
    // Clamping at the frame edge can break the ratio, so re-impose it from the width instead of
    // refitting the box, which would grow it back toward the whole frame.
    setCrop(ratio > 0 ? clampBox({ ...next, height: Math.round(next.width / ratio) }, frame, MIN_CROP) : next)
  }

  function commitMark(node: Konva.Node, mark: Annotation) {
    if (!frame) return
    // For a label the node box is the text, and its height is the font size.
    const size = { height: Math.max(12, node.height() * node.scaleY()), width: Math.max(24, node.width() * node.scaleX()) }
    node.scaleX(1)
    node.scaleY(1)
    const next = clampAnnotation({
      ...mark,
      height: Math.round(size.height / scale),
      width: Math.round(size.width / scale),
      x: Math.round(node.x() / scale),
      y: Math.round(node.y() / scale),
    }, frameBox)
    setAnnotations((current) => updateAnnotation(current, mark.id, next))
  }

  /**
   * Commit the framing: the box becomes the photo, the turn goes into the pixels, and every mark
   * shifts by the box origin so it stays on the same words. Recorded as a bake step rather than
   * re-encoded, so nothing is JPEG-compressed before Apply and the sliders keep working on the new
   * base. Crops chain: each accepted box is a step in the list the base is rebuilt from.
   */
  function acceptCrop() {
    if (!source || !frame) return
    const step: BakedCrop = { box: crop, rotation }
    try {
      const baked = bakeCropToCanvas(source.canvas, step.box, step.rotation)
      setSource(baked)
      setBakes((current) => [...current, step])
      setUndoSteps((current) => [...current, { annotations, aspectKey }])
      setRotation(0)
      setAspectKey('full')
      setCrop(fullBox(baked.size))
      setAnnotations((current) => translateAnnotationsForBake(current, step.box))
      setErrorKey('')
    } catch {
      setErrorKey('Editing failed. The original file is still ready to upload.')
    }
  }

  /**
   * Undo one accepted crop. The base is rebuilt by replaying the remaining steps from the pristine
   * bytes, exactly like the restore path, so an undo costs a redraw instead of a second
   * full-resolution canvas kept for the session.
   */
  function undoCrop() {
    const previous = undoSteps[undoSteps.length - 1]
    const popped = bakes[bakes.length - 1]
    if (!previous || !popped || busyRef.current) return
    const remaining = bakes.slice(0, -1)
    busyRef.current = true
    void loadBitmap(blob)
      .then((bitmap) => {
        let framed = drawWorkingCanvas(bitmap)
        bitmap.close()
        for (const bake of remaining) framed = bakeCropToCanvas(framed.canvas, bake.box, bake.rotation)
        // The turn that went into the popped step was live before it, and the box belonged to the
        // frame that turn produced.
        setSource(framed)
        setBakes(remaining)
        setUndoSteps(undoSteps.slice(0, -1))
        setRotation(popped.rotation)
        setAspectKey(previous.aspectKey)
        setCrop(clampBox(popped.box, frameFor(framed.size, popped.rotation), MIN_CROP))
        setAnnotations(previous.annotations)
        setSelectedId(null)
        setErrorKey('')
      })
      .catch(() => setErrorKey('Editing failed. The original file is still ready to upload.'))
      .finally(() => { busyRef.current = false })
  }

  /**
   * Back to the photo as it was picked, editor still open. Everything the sheet holds is derivable
   * from the pristine bytes plus this state, so a reset is a redraw and a list of empties. On a
   * re-edit it also flags `revertsSavedEdit`, because the file in the list is still the previous
   * output and the user has to be able to write the clean photo back to it.
   */
  function resetEdit() {
    if (!dirty || busyRef.current) return
    busyRef.current = true
    void loadBitmap(blob)
      .then((bitmap) => {
        const framed = drawWorkingCanvas(bitmap)
        bitmap.close()
        setSource(framed)
        setBakes([])
        setUndoSteps([])
        setRotation(0)
        setAspectKey('full')
        setCrop(fullBox(framed.size))
        setAnnotations([])
        setAdjustments(NEUTRAL_ADJUSTMENTS)
        setSelectedId(null)
        setReverted(true)
        setErrorKey('')
      })
      .catch(() => setErrorKey('Editing failed. The original file is still ready to upload.'))
      .finally(() => { busyRef.current = false })
  }

  function pickAspect(key: string) {
    setAspectKey(key)
    if (!frame) return
    // A free box keeps the framing it has and only unlocks the ratio for the next drag.
    if (key === 'custom') return
    const aspect = ASPECT_PRESETS.find((entry) => entry.key === key)?.aspect
    setCrop(aspect ? cropForAspect(frame, aspect, crop) : fullBox(frame))
  }

  function turnQuarter(direction: -1 | 1) {
    if (!source || !frame) return
    const next = QUARTER_TURNS[(QUARTER_TURNS.indexOf(rotation) + direction + 4) % 4]
    const to = frameFor(source.size, next)
    // The box and the marks follow the pixels they cover, so a turn never throws away the framing.
    const turned = clampBox(rotateBoxToFrame(crop, frame, to, direction), to, MIN_CROP)
    setRotation(next)
    setCrop(turned)
    setAnnotations((current) => current.length === 0
      ? current
      : current.map((annotation) => clampAnnotation(rotateAnnotationToFrame(annotation, frame, to, direction), fullBox(to))))
  }

  function pickColor(value: string) {
    setMarkColor(value)
    if (selected) setAnnotations((current) => updateAnnotation(current, selected.id, { color: value }))
  }

  function addLabel() {
    if (!frame) return
    const style = annotationStyleFor(crop)
    const id = `text${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const mark: Annotation = {
      color: markColor,
      height: style.fontSize,
      id,
      kind: 'text',
      text: t('New note'),
      width: Math.round(crop.width * 0.6),
      x: crop.x + Math.round(crop.width * 0.1),
      y: crop.y + Math.round(crop.height * 0.1),
    }
    setAnnotations((current) => [...current, clampAnnotation(mark, frameBox)])
    setSelectedId(id)
    // A fresh label the drawing finger cannot grab would just sit there, so the pencil is off.
    setPencilOn(false)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!frame) return
    const deltas: Record<string, Point> = {
      ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 },
    }
    const delta = deltas[event.key]
    if (!delta) {
      if (event.key === 'Escape' && (pencilOn || selected)) {
        // The panel itself closes on Escape, so exiting the mode has to stop here first.
        event.stopPropagation()
        if (pencilOn) togglePencil()
        else setSelectedId(null)
      }
      return
    }
    event.preventDefault()
    const step = Math.max(4, Math.round(crop.width / 10))
    // Shift is the resize modifier, so it wins over the selection: otherwise selecting a label would
    // silently take the keyboard resize path away.
    if (event.shiftKey) {
      const resized = clampBox({ ...crop, height: crop.height + delta.y * step, width: crop.width + delta.x * step }, frame, MIN_CROP)
      const ratio = ratioFor(aspectKey, frame)
      setCrop(ratio > 0 ? clampBox({ ...resized, height: Math.round(resized.width / ratio) }, frame, MIN_CROP) : resized)
      return
    }
    if (selected) {
      const id = selected.id
      setAnnotations((current) => current.map((entry) => (
        entry.id === id ? clampAnnotation({ ...entry, x: entry.x + delta.x * step, y: entry.y + delta.y * step }, frameBox) : entry
      )))
      return
    }
    setCrop(clampBox({ ...crop, x: crop.x + delta.x * step, y: crop.y + delta.y * step }, frame, MIN_CROP))
  }

  function commit() {
    const chrome = chromeLayerRef.current
    const node = stageRef.current
    if (!chrome || !node || !frame || !output) return
    // A stroke still under the finger is already painted on the marks layer, so it would export
    // without being in the state we hand back. Flush it into the list first.
    const stroke = strokeRef.current
    const pending = stroke ? strokeToMark(stroke) : null
    const marks = pending ? [...annotations, pending] : annotations
    strokeRef.current = null
    drawLive([])
    if (!hasEdits({ adjustments, annotations: marks, bakes, crop, frame, rotation }) && !revertsSavedEdit) {
      setErrorKey('Nothing to apply yet. Crop, adjust or annotate first.')
      return
    }
    setErrorKey('')
    chrome.visible(false)
    try {
      // The crop box is chrome, so hide it and screenshot the stage: pixelRatio 1/scale puts the
      // bitmap back on the crop's own source pixels and samples the image cache 1:1.
      const dataUrl = node.toDataURL({ height: output.height, mimeType: OUTPUT_CONTENT_TYPE, pixelRatio: output.pixelRatio, quality: OUTPUT_QUALITY, width: output.width, x: output.x, y: output.y })
      onApply({ blob: dataUrlToBlob(dataUrl), name: outputFilename(name), state: { adjustments, annotations: marks, aspectKey, bakes, crop, rotation } })
    } catch {
      setErrorKey('Editing failed. The original file is still ready to upload.')
    } finally {
      chrome.visible(true)
    }
  }

  const percentWide = frame && frame.width > 0 ? Math.round((crop.width / frame.width) * 100) : 100
  const percentTall = frame && frame.height > 0 ? Math.round((crop.height / frame.height) * 100) : 100
  const strokeCount = annotations.filter((mark) => mark.kind === 'stroke').length

  return (
    <div className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-foreground/60 sm:place-items-center sm:p-4" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}>
      <div aria-labelledby="image-editor-heading" aria-modal="true" className="w-full max-w-3xl rounded-t-xl border bg-card p-4 shadow-lg outline-none sm:rounded-xl sm:p-6" ref={panelRef} role="dialog" tabIndex={-1}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold" id="image-editor-heading">{t('Edit photo')}</h3>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={name}>{name}</p>
          </div>
          <Button aria-label={t('Close editor')} size="icon" type="button" variant="ghost" onClick={onCancel}><X aria-hidden="true" className="size-4" /></Button>
        </div>

        {errorKey && <p className="mb-3 rounded-lg border border-seal-crimson/30 bg-seal-crimson-tint p-3 text-sm text-seal-crimson" role="alert">{t(errorKey)}</p>}

        {!source && !errorKey && <p className="grid h-40 place-items-center text-sm text-muted-foreground" role="status">{t('Opening…')}</p>}

        {frame && source && (
          <>
            <div
              aria-label={t('Move or resize the crop box')}
              className="relative mx-auto grid h-[46vh] w-full touch-none select-none place-items-center overflow-hidden rounded-lg bg-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-[52vh]"
              ref={holderRef}
              role="group"
              tabIndex={0}
              onKeyDown={onKeyDown}
            >
              {ready ? (
                <Stage
                  height={stage.height}
                  ref={stageRef}
                  width={stage.width}
                  onPointerCancel={abortStroke}
                  onPointerDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (pencilOn) startStroke(event)
                    else setSelectedId(null)
                  }}
                  onPointerMove={moveStroke}
                  onPointerUp={endStroke}
                >
                  <Layer>
                    <Group rotation={rotation} x={stage.width / 2} y={stage.height / 2}>
                      <KonvaImage
                        brightness={filterValues.brightness}
                        contrast={filterValues.contrast}
                        filters={activeFilters}
                        height={source.size.height}
                        hue={0}
                        image={source.canvas}
                        listening={false}
                        offsetX={source.size.width / 2}
                        offsetY={source.size.height / 2}
                        perfectDrawEnabled={false}
                        ref={imageRef}
                        saturation={filterValues.saturation}
                        scaleX={scale}
                        scaleY={scale}
                        width={source.size.width}
                        x={0}
                        y={0}
                      />
                    </Group>
                  </Layer>

                  {/* Chrome: everything that guides the crop, none of which reaches the file. */}
                  <Layer ref={chromeLayerRef}>
                    {maskPanels(cropStage, stage).map((panel) => (
                      <Rect fill="rgba(0,0,0,0.55)" height={panel.height} key={`${panel.x}-${panel.y}-${panel.width}`} listening={false} width={panel.width} x={panel.x} y={panel.y} />
                    ))}
                    {thirds.map((points) => (
                      <Line key={points.join('-')} listening={false} points={points} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
                    ))}
                    <Rect
                      dragBoundFunc={keepInside(cropStage, { height: stage.height, width: stage.width, x: 0, y: 0 })}
                      draggable={!pencilOn}
                      fill="transparent"
                      height={cropStage.height}
                      listening={!pencilOn}
                      onDragEnd={(event) => commitCrop(event.target)}
                      ref={cropNodeRef}
                      onTransformEnd={(event) => commitCrop(event.target)}
                      width={cropStage.width}
                      x={cropStage.x}
                      y={cropStage.y}
                    />
                    <Transformer
                      anchorCornerRadius={4}
                      anchorFill="#FFFFFF"
                      anchorSize={28}
                      anchorStroke="#8A8A8A"
                      anchorStrokeWidth={2}
                      borderStroke="#FFFFFF"
                      borderStrokeWidth={2}
                      boundBoxFunc={(_oldBox, nextBox) => ({ ...clampBox(nextBox, stage, Math.max(8, Math.round(MIN_CROP * scale))), rotation: nextBox.rotation })}
                      enabledAnchors={aspectKey === 'custom' ? ALL_ANCHORS : CORNER_ANCHORS}
                      flipEnabled={false}
                      ignoreStroke
                      keepRatio={aspectKey !== 'custom'}
                      listening={!pencilOn}
                      ref={cropTransformerRef}
                      rotateEnabled={false}
                    />
                    <Transformer
                      anchorCornerRadius={4}
                      anchorFill="#FFFFFF"
                      anchorSize={28}
                      anchorStroke="#8A8A8A"
                      anchorStrokeWidth={2}
                      borderStroke="#FFFFFF"
                      borderStrokeWidth={2}
                      boundBoxFunc={(_oldBox, nextBox) => ({ ...containBox(nextBox, stageBox, 12), rotation: nextBox.rotation })}
                      flipEnabled={false}
                      ignoreStroke
                      keepRatio={false}
                      listening={!pencilOn}
                      ref={markTransformerRef}
                      rotateEnabled={false}
                    />
                  </Layer>

                  {/* Marks live above the crop box, so a finger on a label always moves the label.
                    They are bounded by the photo rather than by the box: ink outside the box stays
                    visible over the dim mask so the user can see and move it, and the export region
                    is what cuts it, exactly like the pixels under it. The layer is never cached, so
                    the filter cache above is untouched. */}
                  <Layer>
                    {annotations.map((mark) => {
                      const drawn = boxToStage(mark, scale)
                      const bind = (node: Konva.Node | null) => { if (node) nodeRefs.current.set(mark.id, node); else nodeRefs.current.delete(mark.id) }
                      return mark.kind === 'text' ? (
                        <Text
                          dragBoundFunc={keepInside(drawn, stageBox)}
                          draggable={!pencilOn}
                          fill={mark.color}
                          fontSize={drawn.height}
                          height={drawn.height}
                          key={mark.id}
                          listening={!pencilOn}
                          onClick={() => setSelectedId(mark.id)}
                          onDragEnd={(event) => commitMark(event.target, mark)}
                          onTap={() => setSelectedId(mark.id)}
                          onTransformEnd={(event) => commitMark(event.target, mark)}
                          ref={bind}
                          text={mark.text ?? ''}
                          width={drawn.width}
                          x={drawn.x}
                          y={drawn.y}
                        />
                      ) : (
                        <Line
                          dragBoundFunc={keepInside(drawn, stageBox)}
                          draggable={!pencilOn}
                          hitStrokeWidth={Math.max(MIN_HIT_STROKE, Math.round((mark.strokeWidth ?? MIN_STROKE) * scale * 2))}
                          key={mark.id}
                          lineCap="round"
                          lineJoin="round"
                          listening={!pencilOn}
                          onClick={() => setSelectedId(mark.id)}
                          onDragEnd={(event) => commitMarkMove(event.target, mark)}
                          onTap={() => setSelectedId(mark.id)}
                          points={(mark.points ?? NO_POINTS).map((value) => Math.round(value * scale))}
                          perfectDrawEnabled={false}
                          ref={bind}
                          stroke={mark.color}
                          strokeWidth={Math.max(1, Math.round((mark.strokeWidth ?? MIN_STROKE) * scale))}
                          x={drawn.x}
                          y={drawn.y}
                        />
                      )
                    })}
                    {/* The stroke under the finger. Mounted for the whole life of the editor and
                        mutated imperatively, so a drag costs no React render: the `points` prop is
                        one stable empty array, and react-konva diffs props by identity, so it never
                        re-applies it over what the pointer handler drew. Mounting it on the mode
                        flip instead would put an unmount, a commit and a rAF redraw between the last
                        live frame and the first committed node — a blank frame at the end of every
                        stroke. */}
                    <Line
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      points={NO_POINTS}
                      perfectDrawEnabled={false}
                      ref={liveLineRef}
                      stroke={markColor}
                      strokeWidth={Math.max(1, Math.round(annotationStyleFor(crop).strokeWidth * scale))}
                      visible={pencilOn}
                      x={0}
                      y={0}
                    />
                  </Layer>
                </Stage>
              ) : (
                <p className="grid h-full place-items-center text-sm text-background" role="status">{t('Opening…')}</p>
              )}

              {/* An overlay, not a row, so turning the pencil on moves nothing the finger aims at. */}
              {pencilOn && (
                <div className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-2 rounded-lg bg-card/95 p-2 shadow-lg">
                  <p className="mr-1 hidden text-xs text-muted-foreground sm:block">{t('Drag on the photo to draw')}</p>
                  <Button disabled={strokeCount === 0} size="sm" type="button" variant="ghost" onClick={removeLastStroke}><X aria-hidden="true" className="size-3.5" /> {t('Remove last stroke')}</Button>
                  <Button size="sm" type="button" onClick={togglePencil}><Check aria-hidden="true" className="size-3.5" /> {t('Done drawing')}</Button>
                </div>
              )}
            </div>

            <p aria-live="polite" className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
              {t('Crop')} {percentWide}% × {percentTall}%
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button aria-label={t('Rotate left')} size="icon-sm" type="button" variant="outline" onClick={() => turnQuarter(-1)}><RotateCcw aria-hidden="true" className="size-4" /></Button>
              <Button aria-label={t('Rotate right')} size="icon-sm" type="button" variant="outline" onClick={() => turnQuarter(1)}><RotateCw aria-hidden="true" className="size-4" /></Button>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-input" />
              {ASPECT_PRESETS.map((preset) => {
                const active = preset.key === aspectKey
                return (
                  <Button aria-pressed={active} key={preset.key} size="sm" type="button" variant={active ? 'secondary' : 'outline'} onClick={() => pickAspect(preset.key)}>
                    {preset.key === 'full' && <Crop aria-hidden="true" className="size-3.5" />}
                    {t(preset.label)}
                  </Button>
                )
              })}
              <Button aria-expanded={showAdjust} size="sm" type="button" variant="outline" onClick={() => setShowAdjust((value) => !value)}><SlidersHorizontal aria-hidden="true" className="size-3.5" /> {t('Adjust colors')}</Button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" type="button" variant="outline" onClick={addLabel}><Type aria-hidden="true" className="size-3.5" /> {t('Text')}</Button>
              <Button aria-pressed={pencilOn} size="sm" type="button" variant={pencilOn ? 'secondary' : 'outline'} onClick={togglePencil}><Pen aria-hidden="true" className="size-3.5" /> {t('Pencil')}</Button>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-input" />
              <div className="flex items-center gap-1" role="group" aria-label={t('Mark colour')}>
                {MARK_COLORS.map((option) => (
                  <Button
                    aria-label={t(option.label)}
                    aria-pressed={markColor === option.value}
                    className="border-input"
                    key={option.value}
                    size="icon-sm"
                    type="button"
                    variant={markColor === option.value ? 'outline' : 'ghost'}
                    onClick={() => pickColor(option.value)}
                  >
                    {/* The panel is near-white, so a ring is the only thing that makes the white option a
                        circle at all; 60% ink clears 3:1 against it in every tone. */}
                    <span aria-hidden="true" className="size-4 rounded-full border border-foreground/60" style={{ backgroundColor: option.value }} />
                  </Button>
                ))}
              </div>
              {selected && !pencilOn && <Button size="sm" type="button" variant="ghost" onClick={() => { setAnnotations((current) => removeAnnotation(current, selected.id)); setSelectedId(null) }}><X aria-hidden="true" className="size-3.5" /> {t('Remove mark')}</Button>}
            </div>

            {showAdjust && (
              <div className="mt-3 grid gap-3 rounded-lg border bg-muted/40 p-3">
                {ADJUST_KEYS.map((key) => (
                  <div className="grid gap-1" key={key}>
                    <Label htmlFor={`adjust-${key}`} className="flex justify-between text-xs"><span>{t(key.charAt(0).toUpperCase() + key.slice(1))}</span><span className="font-mono tabular-nums">{adjustments[key]}</span></Label>
                    <Input id={`adjust-${key}`} max={100} min={-100} onChange={(event) => setAdjustments({ ...adjustments, [key]: Number(event.target.value) })} step={5} type="range" value={adjustments[key]} />
                  </div>
                ))}
                <Button size="sm" type="button" variant="ghost" onClick={() => setAdjustments(NEUTRAL_ADJUSTMENTS)}>{t('Reset')}</Button>
              </div>
            )}

            {selected?.kind === 'text' && !pencilOn && (
              <div className="mt-3 grid gap-1">
                <Label htmlFor="annotation-text" className="text-xs">{t('Note text')}</Label>
                <Input id="annotation-text" maxLength={80} onChange={(event) => setAnnotations((current) => updateAnnotation(current, selected.id, { text: event.target.value }))} value={selected.text ?? ''} />
              </div>
            )}
          </>
        )}

        {/* Wraps rather than widening: the two groups together need ~510px, and a footer that sets
            the sheet's width wider than a 390px screen puts the apply buttons off the device. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
            {dirty && (
              // On the left with Cancel rather than in the action group: the right side is what sets
              // the sheet's width on a phone, and a fourth button there pushed the panel past 390px.
              <Button type="button" variant="ghost" onClick={resetEdit}><RefreshCw aria-hidden="true" className="size-4" /> {t('Discard all changes')}</Button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {undoSteps.length > 0 && (
              // The footer row sets the sheet's width, and a fourth labelled button pushes it past a
              // 390px screen, so the label goes and the name stays.
              <Button aria-label={t('Undo crop')} size="sm" type="button" variant="ghost" onClick={undoCrop}>
                <Undo2 aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">{t('Undo crop')}</span>
              </Button>
            )}
            <Button disabled={!frame || !canBake} type="button" variant="outline" onClick={acceptCrop}><Crop aria-hidden="true" className="size-4" /> {t('Apply crop')}</Button>
            <Button disabled={!frame || !output} type="button" onClick={commit}>
              <Check aria-hidden="true" className="size-4" /> {t('Apply edit')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
