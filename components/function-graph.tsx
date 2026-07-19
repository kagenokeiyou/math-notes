import { cn } from 'cnfast'
import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { curveLinear, line } from 'd3-shape'
import katex from 'katex'
import { Children, isValidElement, useId, type ReactNode } from 'react'

/**
 * An ascending numeric interval. Graph axes must be finite; curve domains may
 * use `-Infinity` and `Infinity` and are clipped to the graph's x-domain.
 */
export type FunctionDomain = readonly [number, number]

/**
 * Props for the SVG function graph.
 *
 * The graph owns the outer viewBox while the plotted region keeps the requested
 * aspect ratio. Tick labels and the optional legend consume space outside that
 * region; annotations are clipped to it and never change its dimensions.
 */
export interface FunctionGraphProps {
  /** Curves and optional annotations to render. At least one curve is required. */
  children: ReactNode
  /** Visible x-axis interval. Defaults to `[-10, 10]`. */
  xDomain?: FunctionDomain
  /** Visible y-axis interval. Defaults to `[-10, 10]`. */
  yDomain?: FunctionDomain
  /** Width divided by height of the plotted region. Defaults to `1`. */
  aspectRatio?: number
  /** Shared tick spacing for both axes. Axis-specific values take precedence. */
  tickStep?: number
  /** Tick spacing for the x-axis. */
  xTickStep?: number
  /** Tick spacing for the y-axis. */
  yTickStep?: number
  /** Whether to draw the neutral grid. Defaults to `true`. */
  showGrid?: boolean
  /** Whether to render numeric tick labels. Defaults to `true`. */
  showTicks?: boolean
  /** Whether to render the curve legend. Defaults to `true`. */
  showLegend?: boolean
  /** Additional classes for the outer figure. */
  className?: string
}

/** A function curve and its optional legend/style metadata. */
export interface FunctionCurveProps {
  /** Stable identifier used by `FunctionPoint` and `FunctionLine`. */
  id?: string
  /** Function to sample for the visible x-domain. */
  fn: (x: number) => number
  /** Legend label. A complete `$...$` value is rendered as KaTeX. */
  label?: string
  /** Explicit CSS color. Otherwise a theme-aware series color is assigned. */
  color?: string
  /**
   * Non-overlapping x intervals in which the curve is drawn. Infinite
   * endpoints are allowed and are clipped to `FunctionGraph.xDomain`.
   */
  domains?: readonly FunctionDomain[]
  /** x values at which the sampled path must be split. */
  undefinedPoints?: readonly number[]
}

/** A coordinate in graph units. */
export interface FunctionPointCoordinate {
  x: number
  y: number
}

/** A point annotation, either at a static y value or on a referenced curve. */
export interface FunctionPointProps {
  /** x coordinate of the point. */
  x: number
  /** Static y coordinate. Mutually exclusive with `curveId`. */
  y?: number
  /** Curve id whose function value should be used at `x`. */
  curveId?: string
  /** Explicit CSS color. Otherwise the referenced curve's color is inherited. */
  color?: string
  /** Circle radius in SVG display units. Defaults to `4`. */
  size?: number
  /** Draw a filled circle. Defaults to `true`. */
  filled?: boolean
  /** Tooltip content shown on hover, focus, or touch. `$...$` uses KaTeX. */
  tooltip?: string
}

/** A line annotation: an arbitrary segment or a full-width/height reference line. */
export interface FunctionLineProps {
  /** Start of an arbitrary segment. Must be paired with `to`. */
  from?: FunctionPointCoordinate
  /** End of an arbitrary segment. Must be paired with `from`. */
  to?: FunctionPointCoordinate
  /** x coordinate of a vertical reference line. */
  x?: number
  /** y coordinate of a horizontal reference line. */
  y?: number
  /** Optional curve id from which the default color is inherited. */
  curveId?: string
  /** Explicit CSS color. Takes precedence over an inherited curve color. */
  color?: string
  /** Draw a dashed line instead of a solid line. Defaults to `false`. */
  dashed?: boolean
  /** Tooltip content shown on hover, focus, or touch. `$...$` uses KaTeX. */
  tooltip?: string
}

interface Interval {
  start: number
  end: number
  openStart: boolean
  openEnd: boolean
}

type DefinedSamplePoint = FunctionPointCoordinate

type SamplePoint = DefinedSamplePoint | { x: number; y: null }

interface ColorAssignment {
  color?: string
  colorClass?: string
}

interface PreparedCurve extends ColorAssignment {
  key: string
  name: string
  fn: (x: number) => number
  label?: string
  domains?: readonly FunctionDomain[]
  undefinedPoints?: readonly number[]
}

interface PreparedPoint extends ColorAssignment {
  id: string
  x: number
  y: number
  tooltip: string
  size: number
  filled: boolean
}

interface PreparedLineBase extends ColorAssignment {
  id: string
  tooltip: string
  dashed: boolean
}

type PreparedLine =
  | (PreparedLineBase & {
      kind: 'segment'
      from: FunctionPointCoordinate
      to: FunctionPointCoordinate
    })
  | (PreparedLineBase & { kind: 'vertical'; x: number })
  | (PreparedLineBase & { kind: 'horizontal'; y: number })

interface PreparedGraphChildren {
  curves: PreparedCurve[]
  points: PreparedPoint[]
  lines: PreparedLine[]
}

interface GraphLayout {
  xTicks: number[]
  yTicks: number[]
  formatXTick: (value: number) => string
  formatYTick: (value: number) => string
  plotLeft: number
  plotRight: number
  plotTop: number
  plotBottom: number
  viewWidth: number
  viewHeight: number
  xScale: NumericScale
  yScale: NumericScale
}

interface GraphLayoutOptions {
  xDomain: FunctionDomain
  yDomain: FunctionDomain
  aspectRatio: number
  xTickStep: number | undefined
  yTickStep: number | undefined
  showTicks: boolean
  showGrid: boolean
}

interface ScreenLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

type NumericScale = ScaleLinear<number, number, never>

const DEFAULT_DOMAIN: FunctionDomain = [-10, 10]
const DEFAULT_ASPECT_RATIO = 1
const SAMPLE_COUNT = 1000
const PLOT_WIDTH = 360

// Tick labels use a monospace face. These measured character dimensions keep
// the outer viewBox tight while reserving enough room for negative labels.
const AXIS_LABEL_GAP = 8
const TICK_CHARACTER_WIDTH = 6.6
const TICK_CHARACTER_HEIGHT = 14
const TICK_BASELINE_OFFSET = 4
const PLOT_EDGE_PADDING = 3

const DEFAULT_TICK_COUNT = 8
const MAX_TICK_COUNT = 1000

// Tooltips are CSS-only, so the graph needs no client-side state. The hit line
// is wider than the visible line to make a thin reference line easy to hover.
const TOOLTIP_WIDTH = 128
const TOOLTIP_HEIGHT = 64
const TOOLTIP_OFFSET = 8
const ANNOTATION_HIT_WIDTH = 8
const TOUCH_ANNOTATION_HIT_WIDTH = 24

const SERIES_COLORS = [
  'text-blue-600 dark:text-blue-400',
  'text-rose-600 dark:text-rose-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-amber-600 dark:text-amber-400',
  'text-violet-600 dark:text-violet-400',
  'text-cyan-600 dark:text-cyan-400',
] as const

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateFiniteDomain(value: unknown, name: string): FunctionDomain {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isFiniteNumber(value[0]) ||
    !isFiniteNumber(value[1]) ||
    value[0] >= value[1] ||
    !isFiniteNumber(value[1] - value[0])
  ) {
    throw new Error(`${name} must be [min, max] with finite numbers and min < max.`)
  }

  return [value[0], value[1]]
}

function validateCurveDomain(value: unknown, name: string): FunctionDomain {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'number' ||
    Number.isNaN(value[0]) ||
    typeof value[1] !== 'number' ||
    Number.isNaN(value[1]) ||
    value[0] >= value[1]
  ) {
    throw new Error(
      `${name} must be [min, max] with min < max; -Infinity is allowed for min and Infinity for max.`,
    )
  }

  return [value[0], value[1]]
}

function validateTickStep(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined

  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`${name} must be a finite number greater than 0.`)
  }

  return value
}

function validateAspectRatio(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error('aspectRatio must be a finite number greater than 0.')
  }

  return value
}

function validateBoolean(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`${name} must be true or false.`)
  return value
}

function validateIdentifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`)
  }
  return value.trim()
}

function validateColor(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name}.color must be a non-empty CSS color string.`)
  }
  return value.trim()
}

function validateTooltip(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name}.tooltip must be a non-empty string.`)
  }
  return value
}

function validateCoordinate(value: unknown, name: string): FunctionPointCoordinate {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${name} must be an object with finite numeric x and y values.`)
  }

  const coordinate = value as { x?: unknown; y?: unknown }
  if (!isFiniteNumber(coordinate.x) || !isFiniteNumber(coordinate.y)) {
    throw new Error(`${name} must be an object with finite numeric x and y values.`)
  }

  return { x: coordinate.x, y: coordinate.y }
}

function createTicks(
  scale: NumericScale,
  domain: FunctionDomain,
  step: number | undefined,
  stepName: 'xTickStep' | 'yTickStep',
): number[] {
  if (step === undefined) return scale.ticks(DEFAULT_TICK_COUNT)

  const span = domain[1] - domain[0]
  if (span / step > MAX_TICK_COUNT) {
    throw new Error(
      `${stepName} creates more than ${MAX_TICK_COUNT} ticks for this domain; increase its value.`,
    )
  }

  // A tiny tolerance avoids dropping a boundary tick when division produces
  // a value such as 2.9999999999999996 for an otherwise exact multiple.
  const epsilon = Math.max(Math.abs(step) * 1e-12, Number.EPSILON)
  const firstIndex = Math.ceil((domain[0] - epsilon) / step)
  const lastIndex = Math.floor((domain[1] + epsilon) / step)
  const count = lastIndex - firstIndex + 1

  if (count > MAX_TICK_COUNT) {
    throw new Error(
      `${stepName} creates more than ${MAX_TICK_COUNT} ticks for this domain; increase its value.`,
    )
  }

  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const value = (firstIndex + index) * step
    return Object.is(value, -0) ? 0 : value
  })
}

function estimateTickLabelWidth(label: string): number {
  return Math.ceil(Array.from(label).length * TICK_CHARACTER_WIDTH)
}

function formatAnnotationNumber(value: number): string {
  const rounded = Number(value.toPrecision(6))
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

function resolveColor(
  curve: PreparedCurve | undefined,
  explicitColor: string | undefined,
): ColorAssignment {
  if (explicitColor !== undefined) return { color: explicitColor }
  if (!curve) return {}
  return curve.color !== undefined ? { color: curve.color } : { colorClass: curve.colorClass }
}

function getColorStyle(color: string | undefined): { color: string } | undefined {
  return color === undefined ? undefined : { color }
}

function getCurveById(
  curvesById: Map<string, PreparedCurve>,
  rawCurveId: unknown,
  name: string,
): PreparedCurve {
  const curveId = validateIdentifier(rawCurveId, `${name}.curveId`)
  const curve = curvesById.get(curveId)
  if (!curve) {
    throw new Error(`${name}.curveId "${curveId}" does not match any FunctionCurve id.`)
  }
  return curve
}

function preparePoint(
  props: FunctionPointProps,
  index: number,
  curvesById: Map<string, PreparedCurve>,
): PreparedPoint {
  const name = `FunctionPoint ${index + 1}`
  if (!isFiniteNumber(props.x)) throw new Error(`${name}.x must be a finite number.`)

  const hasY = props.y !== undefined
  const hasCurveId = props.curveId !== undefined
  if (hasY === hasCurveId) {
    throw new Error(`${name} must provide either y or curveId, but not both.`)
  }

  const explicitColor = validateColor(props.color, name)
  const explicitTooltip = validateTooltip(props.tooltip, name)
  const size = props.size ?? 4
  if (!isFiniteNumber(size) || size <= 0) {
    throw new Error(`${name}.size must be a finite number greater than 0.`)
  }

  const filled = props.filled ?? true
  if (typeof filled !== 'boolean') throw new Error(`${name}.filled must be true or false.`)

  const curve = hasCurveId ? getCurveById(curvesById, props.curveId, name) : undefined
  let y: number

  if (curve) {
    try {
      y = curve.fn(props.x)
    } catch {
      throw new Error(`${name} could not evaluate ${curve.name} at x=${props.x}.`)
    }
    if (!isFiniteNumber(y)) {
      throw new Error(`${name} requires ${curve.name}.fn(${props.x}) to return a finite number.`)
    }
  } else {
    y = props.y as number
    if (!isFiniteNumber(y)) throw new Error(`${name}.y must be a finite number.`)
  }

  return {
    id: `point-${index}`,
    x: props.x,
    y,
    tooltip:
      explicitTooltip ?? `$(${formatAnnotationNumber(props.x)},${formatAnnotationNumber(y)})$`,
    ...resolveColor(curve, explicitColor),
    size,
    filled,
  }
}

function prepareLine(
  props: FunctionLineProps,
  index: number,
  curvesById: Map<string, PreparedCurve>,
): PreparedLine {
  const name = `FunctionLine ${index + 1}`
  const hasFrom = props.from !== undefined
  const hasTo = props.to !== undefined
  const hasSegment = hasFrom || hasTo
  const hasVertical = props.x !== undefined
  const hasHorizontal = props.y !== undefined
  const geometryCount = [hasSegment, hasVertical, hasHorizontal].filter(Boolean).length

  if (geometryCount !== 1 || (hasSegment && (!hasFrom || !hasTo))) {
    throw new Error(`${name} must provide exactly one geometry: x, y, or both from and to.`)
  }

  const explicitColor = validateColor(props.color, name)
  const explicitTooltip = validateTooltip(props.tooltip, name)
  const dashed = props.dashed ?? false
  if (typeof dashed !== 'boolean') throw new Error(`${name}.dashed must be true or false.`)

  const curve =
    props.curveId === undefined ? undefined : getCurveById(curvesById, props.curveId, name)

  if (hasSegment) {
    const from = validateCoordinate(props.from, `${name}.from`)
    const to = validateCoordinate(props.to, `${name}.to`)
    return {
      id: `line-${index}`,
      kind: 'segment',
      from,
      to,
      tooltip:
        explicitTooltip ??
        `$(${formatAnnotationNumber(from.x)},${formatAnnotationNumber(from.y)}) \\to (${formatAnnotationNumber(to.x)},${formatAnnotationNumber(to.y)})$`,
      ...resolveColor(curve, explicitColor),
      dashed,
    }
  }

  if (hasVertical) {
    if (!isFiniteNumber(props.x)) throw new Error(`${name}.x must be a finite number.`)
    return {
      id: `line-${index}`,
      kind: 'vertical',
      x: props.x,
      tooltip: explicitTooltip ?? `$x=${formatAnnotationNumber(props.x)}$`,
      ...resolveColor(curve, explicitColor),
      dashed,
    }
  }

  if (!isFiniteNumber(props.y)) throw new Error(`${name}.y must be a finite number.`)
  return {
    id: `line-${index}`,
    kind: 'horizontal',
    y: props.y,
    tooltip: explicitTooltip ?? `$y=${formatAnnotationNumber(props.y)}$`,
    ...resolveColor(curve, explicitColor),
    dashed,
  }
}

function collectGraphChildren(children: ReactNode): PreparedGraphChildren {
  const elements = Children.toArray(children)
  if (elements.length === 0) {
    throw new Error('FunctionGraph requires at least one FunctionCurve child.')
  }

  const curves: PreparedCurve[] = []
  const curvesById = new Map<string, PreparedCurve>()
  const pointProps: FunctionPointProps[] = []
  const lineProps: FunctionLineProps[] = []

  elements.forEach((child, index) => {
    if (!isValidElement(child)) {
      throw new Error(
        `FunctionGraph child ${index + 1} must be FunctionCurve, FunctionPoint, or FunctionLine.`,
      )
    }

    if (child.type === FunctionCurve) {
      const props = child.props as FunctionCurveProps
      const curveName = `FunctionCurve ${curves.length + 1}`
      if (typeof props.fn !== 'function') {
        throw new Error(`${curveName}.fn must be a function.`)
      }
      if (props.label !== undefined && typeof props.label !== 'string') {
        throw new Error(`${curveName}.label must be a string.`)
      }

      const color = validateColor(props.color, curveName)
      const curveId =
        props.id === undefined ? undefined : validateIdentifier(props.id, `${curveName}.id`)

      if (curveId !== undefined && curvesById.has(curveId)) {
        throw new Error(`FunctionCurve id "${curveId}" is duplicated; every id must be unique.`)
      }

      const curve: PreparedCurve = {
        key: `curve-${curves.length}`,
        name: curveId === undefined ? curveName : `FunctionCurve "${curveId}"`,
        fn: props.fn,
        label: props.label,
        color,
        domains: props.domains,
        undefinedPoints: props.undefinedPoints,
        colorClass:
          color === undefined ? SERIES_COLORS[curves.length % SERIES_COLORS.length] : undefined,
      }
      curves.push(curve)
      if (curveId !== undefined) curvesById.set(curveId, curve)
      return
    }

    if (child.type === FunctionPoint) {
      pointProps.push(child.props as FunctionPointProps)
      return
    }

    if (child.type === FunctionLine) {
      lineProps.push(child.props as FunctionLineProps)
      return
    }

    throw new Error(
      `FunctionGraph child ${index + 1} must be FunctionCurve, FunctionPoint, or FunctionLine.`,
    )
  })

  if (curves.length === 0) {
    throw new Error('FunctionGraph requires at least one FunctionCurve child.')
  }

  return {
    curves,
    points: pointProps.map((props, index) => preparePoint(props, index, curvesById)),
    lines: lineProps.map((props, index) => prepareLine(props, index, curvesById)),
  }
}

function intersectDomains(curve: PreparedCurve, xDomain: FunctionDomain): Interval[] {
  if (curve.domains !== undefined && !Array.isArray(curve.domains)) {
    throw new Error(`${curve.name}.domains must be an array of [min, max] intervals.`)
  }

  const requestedDomains = curve.domains?.map((domain, index) =>
    validateCurveDomain(domain, `${curve.name}.domains[${index}]`),
  ) ?? [xDomain]

  if (requestedDomains.length === 0) {
    throw new Error(`${curve.name}.domains must contain at least one interval.`)
  }

  const sortedDomains = [...requestedDomains].sort((a, b) => a[0] - b[0])
  for (let index = 1; index < sortedDomains.length; index += 1) {
    if (sortedDomains[index][0] < sortedDomains[index - 1][1]) {
      throw new Error(`${curve.name}.domains must not contain overlapping intervals.`)
    }
  }

  const mergedDomains: FunctionDomain[] = []
  for (const domain of sortedDomains) {
    const previous = mergedDomains.at(-1)
    if (previous && domain[0] === previous[1]) {
      mergedDomains[mergedDomains.length - 1] = [previous[0], domain[1]]
    } else {
      mergedDomains.push(domain)
    }
  }

  const visibleIntervals: Interval[] = []
  for (const [start, end] of mergedDomains) {
    const visibleStart = Math.max(start, xDomain[0])
    const visibleEnd = Math.min(end, xDomain[1])
    if (visibleStart < visibleEnd) {
      visibleIntervals.push({
        start: visibleStart,
        end: visibleEnd,
        openStart: false,
        openEnd: false,
      })
    }
  }

  if (curve.undefinedPoints !== undefined && !Array.isArray(curve.undefinedPoints)) {
    throw new Error(`${curve.name}.undefinedPoints must be an array of finite numbers.`)
  }

  const undefinedPoints = [...(curve.undefinedPoints ?? [])]
    .map((point, index) => {
      if (!isFiniteNumber(point)) {
        throw new Error(`${curve.name}.undefinedPoints[${index}] must be a finite number.`)
      }
      return point
    })
    .sort((a, b) => a - b)
  const uniquePoints = undefinedPoints.filter(
    (point, index) => index === 0 || point !== undefinedPoints[index - 1],
  )

  const splitIntervals: Interval[] = []
  for (const interval of visibleIntervals) {
    let cursor = interval.start
    let openStart = interval.openStart

    for (const point of uniquePoints) {
      if (point <= interval.start) continue
      if (point >= interval.end) break

      splitIntervals.push({ start: cursor, end: point, openStart, openEnd: true })
      cursor = point
      openStart = true
    }

    splitIntervals.push({
      start: cursor,
      end: interval.end,
      openStart,
      openEnd: interval.openEnd,
    })
  }

  return splitIntervals
}

const OUT_LEFT = 1
const OUT_RIGHT = 2
const OUT_BOTTOM = 4
const OUT_TOP = 8

function getDomainOutcode(
  point: FunctionPointCoordinate,
  xDomain: FunctionDomain,
  yDomain: FunctionDomain,
): number {
  let code = 0
  if (point.x < xDomain[0]) code |= OUT_LEFT
  if (point.x > xDomain[1]) code |= OUT_RIGHT
  if (point.y < yDomain[0]) code |= OUT_BOTTOM
  if (point.y > yDomain[1]) code |= OUT_TOP
  return code
}

interface InterpolationWeights {
  from: number
  to: number
}

interface LineEquation {
  a: number
  b: number
  c: number
}

function createLineEquation(
  from: FunctionPointCoordinate,
  to: FunctionPointCoordinate,
): LineEquation {
  // Each point is independently normalized in homogeneous coordinates. This
  // avoids overflowing the cross product without changing the represented
  // line, even when coordinates approach Number.MAX_VALUE.
  const fromScale = Math.max(Math.abs(from.x), Math.abs(from.y), 1)
  const toScale = Math.max(Math.abs(to.x), Math.abs(to.y), 1)
  const fromX = from.x / fromScale
  const fromY = from.y / fromScale
  const fromW = 1 / fromScale
  const toX = to.x / toScale
  const toY = to.y / toScale
  const toW = 1 / toScale

  return {
    a: fromY * toW - fromW * toY,
    b: fromW * toX - fromX * toW,
    c: fromX * toY - fromY * toX,
  }
}

function clampWeight(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function getInterpolationWeights(from: number, to: number, target: number): InterpolationWeights {
  if (from === to) return { from: 1, to: 0 }

  const delta = to - from
  if (Number.isFinite(delta)) {
    const fromWeight = clampWeight((to - target) / delta)
    const toWeight = clampWeight((target - from) / delta)
    const total = fromWeight + toWeight
    return total === 0 ? { from: 0.5, to: 0.5 } : { from: fromWeight / total, to: toWeight / total }
  }

  // Normalize before subtracting so opposite-signed values near the numeric
  // limit do not overflow while calculating the boundary ratio.
  const scale = Math.max(Math.abs(from), Math.abs(to), Math.abs(target), 1)
  const normalizedFrom = from / scale
  const normalizedTo = to / scale
  const normalizedTarget = target / scale
  const normalizedDelta = normalizedTo - normalizedFrom

  if (normalizedDelta === 0) return { from: 0.5, to: 0.5 }

  const fromWeight = clampWeight((normalizedTo - normalizedTarget) / normalizedDelta)
  const toWeight = clampWeight((normalizedTarget - normalizedFrom) / normalizedDelta)
  const total = fromWeight + toWeight
  return total === 0 ? { from: 0.5, to: 0.5 } : { from: fromWeight / total, to: toWeight / total }
}

function interpolateFinite(from: number, to: number, weights: InterpolationWeights): number {
  if (weights.from === 1) return from
  if (weights.to === 1) return to

  const value = from * weights.from + to * weights.to
  if (Number.isFinite(value)) return value

  // The weighted form above is stable for most large values. This fallback
  // keeps the result finite even when multiplication rounds at the limit.
  const scaledValue = ((from / 2) * weights.from + (to / 2) * weights.to) * 2
  return Number.isFinite(scaledValue)
    ? scaledValue
    : Math.sign(scaledValue || from || to) * Number.MAX_VALUE
}

function interpolateDomainBoundary(
  from: FunctionPointCoordinate,
  to: FunctionPointCoordinate,
  axis: 'x' | 'y',
  boundary: number,
  line: LineEquation,
): FunctionPointCoordinate {
  const denominator = axis === 'x' ? line.b : line.a
  const numerator = axis === 'x' ? -(line.a * boundary + line.c) : -(line.b * boundary + line.c)
  const solvedValue = numerator / denominator

  if (Number.isFinite(solvedValue)) {
    return axis === 'x' ? { x: boundary, y: solvedValue } : { x: solvedValue, y: boundary }
  }

  // A degenerate or underflowed line equation falls back to weighted endpoint
  // interpolation. Both methods preserve finite output.
  const fromValue = axis === 'x' ? from.x : from.y
  const toValue = axis === 'x' ? to.x : to.y
  const weights = getInterpolationWeights(fromValue, toValue, boundary)

  if (axis === 'x') {
    return { x: boundary, y: interpolateFinite(from.y, to.y, weights) }
  }

  return { x: interpolateFinite(from.x, to.x, weights), y: boundary }
}

/** Clip a linear segment to the finite graph rectangle. */
function clipSegmentToDomains(
  from: FunctionPointCoordinate,
  to: FunctionPointCoordinate,
  xDomain: FunctionDomain,
  yDomain: FunctionDomain,
): [FunctionPointCoordinate, FunctionPointCoordinate] | null {
  let start = from
  let end = to
  let startCode = getDomainOutcode(start, xDomain, yDomain)
  let endCode = getDomainOutcode(end, xDomain, yDomain)

  if ((startCode | endCode) === 0) return [start, end]
  if ((startCode & endCode) !== 0) return null

  // Most sample segments are either wholly visible or trivially outside, so
  // build the more expensive line equation only for a boundary crossing.
  const line = createLineEquation(from, to)

  // A segment can cross at most two rectangle edges. The extra iterations
  // make the loop resilient to a point landing exactly on a corner.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    if ((startCode | endCode) === 0) return [start, end]
    if ((startCode & endCode) !== 0) return null

    const code = startCode !== 0 ? startCode : endCode
    let intersection: FunctionPointCoordinate

    if (code & OUT_TOP) {
      intersection = interpolateDomainBoundary(start, end, 'y', yDomain[1], line)
    } else if (code & OUT_BOTTOM) {
      intersection = interpolateDomainBoundary(start, end, 'y', yDomain[0], line)
    } else if (code & OUT_RIGHT) {
      intersection = interpolateDomainBoundary(start, end, 'x', xDomain[1], line)
    } else {
      intersection = interpolateDomainBoundary(start, end, 'x', xDomain[0], line)
    }

    if (startCode !== 0) {
      start = intersection
      startCode = getDomainOutcode(start, xDomain, yDomain)
    } else {
      end = intersection
      endCode = getDomainOutcode(end, xDomain, yDomain)
    }
  }

  return null
}

function sameDefinedSamplePoint(left: DefinedSamplePoint, right: DefinedSamplePoint): boolean {
  return left.x === right.x && left.y === right.y
}

function appendSampleBreak(samples: SamplePoint[], x: number): void {
  const previous = samples.at(-1)
  if (previous && previous.y === null) return
  samples.push({ x, y: null })
}

function appendClippedSegment(
  samples: SamplePoint[],
  segment: [DefinedSamplePoint, DefinedSamplePoint],
): void {
  const [start, end] = segment
  const previous = samples.at(-1)

  if (!previous || previous.y === null) {
    samples.push(start)
  } else if (!sameDefinedSamplePoint(previous, start)) {
    // The previous segment ended outside the plot, so this visible segment
    // starts a new subpath even when both segments came from adjacent samples.
    appendSampleBreak(samples, start.x)
    samples.push(start)
  }

  const last = samples.at(-1)
  if (!last || last.y === null || !sameDefinedSamplePoint(last, end)) {
    samples.push(end)
  }
}

/**
 * Sample each interval independently and retain only the portions visible in
 * the plot rectangle. Boundary intersections preserve the original linear path
 * while avoiding large offscreen coordinates in the generated SVG.
 */
function sampleCurve(
  curve: PreparedCurve,
  xDomain: FunctionDomain,
  yDomain: FunctionDomain,
): SamplePoint[] {
  const intervals = intersectDomains(curve, xDomain)
  const totalSpan = xDomain[1] - xDomain[0]
  const samples: SamplePoint[] = []
  let previous: DefinedSamplePoint | undefined

  intervals.forEach((interval, intervalIndex) => {
    if (intervalIndex > 0) {
      appendSampleBreak(samples, interval.start)
      previous = undefined
    }

    const span = interval.end - interval.start
    const count = Math.max(2, Math.ceil((SAMPLE_COUNT * span) / totalSpan))
    const endpointOffset = (interval.openStart ? 0.5 : 0) + (interval.openEnd ? 0.5 : 0)
    const step = span / (count - 1 + endpointOffset)
    const firstX = interval.start + (interval.openStart ? step / 2 : 0)
    const lastX = interval.end - (interval.openEnd ? step / 2 : 0)

    for (let index = 0; index < count; index += 1) {
      const progress = index / (count - 1)
      const x = firstX + (lastX - firstX) * progress
      let y: number | null = null

      try {
        const value = curve.fn(x)
        if (isFiniteNumber(value)) y = value
      } catch {
        // A bad sample creates a gap in the path; one bad value should not
        // prevent the rest of a curve from being displayed.
      }

      if (y === null) {
        appendSampleBreak(samples, x)
        previous = undefined
        continue
      }

      const current: DefinedSamplePoint = { x, y }
      if (previous !== undefined) {
        const clippedSegment = clipSegmentToDomains(previous, current, xDomain, yDomain)
        if (clippedSegment === null) {
          appendSampleBreak(samples, x)
        } else {
          appendClippedSegment(samples, clippedSegment)
        }
      }
      previous = current
    }
  })

  if (samples.at(-1)?.y === null) samples.pop()
  return samples
}

function createCurvePath(
  curve: PreparedCurve,
  xDomain: FunctionDomain,
  yDomain: FunctionDomain,
  xScale: GraphLayout['xScale'],
  yScale: GraphLayout['yScale'],
): string | null {
  const sampledPoints = sampleCurve(curve, xDomain, yDomain)
  return (
    line<SamplePoint>()
      .defined((point) => point.y !== null)
      .x((point) => xScale(point.x))
      .y((point) => yScale(point.y ?? 0))
      .curve(curveLinear)(sampledPoints) ?? null
  )
}

function isLatexLabel(label: string): boolean {
  const trimmed = label.trim()
  return (
    trimmed.length >= 2 &&
    trimmed.startsWith('$') &&
    trimmed.endsWith('$') &&
    !trimmed.startsWith('$$') &&
    !trimmed.endsWith('$$')
  )
}

function renderLabel(label: string): {
  html?: string
  text: string
  latex: boolean
  error: boolean
} {
  if (!isLatexLabel(label)) return { text: label, latex: false, error: false }

  const expression = label.trim().slice(1, -1)
  try {
    // KaTeX emits trusted, generated markup. `trust: false` prevents user
    // expressions from enabling HTML or other unsafe extensions.
    return {
      html: katex.renderToString(expression, {
        displayMode: false,
        output: 'htmlAndMathml',
        throwOnError: true,
        trust: false,
      }),
      text: label,
      latex: true,
      error: false,
    }
  } catch {
    return { text: label, latex: true, error: true }
  }
}

function renderRichText(content: string): ReactNode {
  const fragments: { offset: number; value: string }[] = []
  const pattern = /\$[^$\r\n]+\$/g
  let plainTextStart = 0

  for (const match of content.matchAll(pattern)) {
    const matchStart = match.index
    if (matchStart > plainTextStart) {
      fragments.push({ offset: plainTextStart, value: content.slice(plainTextStart, matchStart) })
    }
    fragments.push({ offset: matchStart, value: match[0] })
    plainTextStart = matchStart + match[0].length
  }

  if (plainTextStart < content.length) {
    fragments.push({ offset: plainTextStart, value: content.slice(plainTextStart) })
  }

  return fragments.map(({ offset, value }) => {
    const rendered = renderLabel(value)

    if (rendered.error) {
      return (
        <code className="break-all" key={offset}>
          {rendered.text}
        </code>
      )
    }
    if (rendered.latex) {
      return <span dangerouslySetInnerHTML={{ __html: rendered.html! }} key={offset} />
    }
    return <span key={offset}>{rendered.text}</span>
  })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

function getTooltipPlacement(
  anchorX: number,
  anchorY: number,
  layout: Pick<GraphLayout, 'plotTop' | 'plotBottom' | 'viewWidth' | 'viewHeight'>,
) {
  const x = clamp(anchorX - TOOLTIP_WIDTH / 2, 0, layout.viewWidth - TOOLTIP_WIDTH)
  const spaceAbove = anchorY - layout.plotTop
  const spaceBelow = layout.plotBottom - anchorY
  const isBelow = spaceAbove < TOOLTIP_HEIGHT + TOOLTIP_OFFSET && spaceBelow >= spaceAbove
  const preferredY = isBelow ? anchorY + TOOLTIP_OFFSET : anchorY - TOOLTIP_HEIGHT - TOOLTIP_OFFSET
  const y = clamp(preferredY, 0, layout.viewHeight - TOOLTIP_HEIGHT)

  return { x, y, isBelow }
}

/** CSS-only tooltip triggered by hover, keyboard focus, or touch focus. */
function AnnotationTooltip({
  anchorX,
  anchorY,
  layout,
  content,
}: {
  anchorX: number
  anchorY: number
  layout: Pick<GraphLayout, 'plotTop' | 'plotBottom' | 'viewWidth' | 'viewHeight'>
  content: string
}) {
  const placement = getTooltipPlacement(anchorX, anchorY, layout)

  return (
    <foreignObject
      aria-hidden="true"
      x={placement.x}
      y={placement.y}
      width={TOOLTIP_WIDTH}
      height={TOOLTIP_HEIGHT}
      overflow="visible"
      pointerEvents="none"
      className="pointer-events-none overflow-visible opacity-0 transition-opacity delay-200 duration-150 select-none group-focus-within:opacity-100 group-hover:opacity-100 group-active:opacity-100"
    >
      <div
        className={cn(
          'flex h-full justify-center',
          placement.isBelow ? 'items-start' : 'items-end',
        )}
      >
        <div className="border-fd-border bg-fd-popover text-fd-popover-foreground w-max max-w-50 rounded border px-2 py-1 text-xs wrap-break-word shadow-md">
          {renderRichText(content)}
        </div>
      </div>
    </foreignObject>
  )
}

function accessibleLabel(label: string): string {
  return isLatexLabel(label) ? label.trim().slice(1, -1) : label
}

function createGraphLayout({
  xDomain,
  yDomain,
  aspectRatio,
  xTickStep,
  yTickStep,
  showTicks,
  showGrid,
}: GraphLayoutOptions): GraphLayout {
  const plotHeight = PLOT_WIDTH / aspectRatio
  if (!isFiniteNumber(plotHeight)) {
    throw new Error('aspectRatio is too small to produce a finite plot height.')
  }

  const needsTicks = showTicks || showGrid
  const yScaleForTicks = scaleLinear<number, number>().domain(yDomain).range([plotHeight, 0])
  const yTicks = needsTicks ? createTicks(yScaleForTicks, yDomain, yTickStep, 'yTickStep') : []
  const formatYTick = yScaleForTicks.tickFormat(yTicks.length || DEFAULT_TICK_COUNT)
  const yTickMetrics = yTicks.map((tick) => ({
    position: yScaleForTicks(tick),
    width: estimateTickLabelWidth(formatYTick(tick)),
  }))
  const yTickLabelWidth = Math.max(0, ...yTickMetrics.map(({ width }) => width))

  const xScaleForTicks = scaleLinear<number, number>().domain(xDomain).range([0, PLOT_WIDTH])
  const xTicks = needsTicks ? createTicks(xScaleForTicks, xDomain, xTickStep, 'xTickStep') : []
  const formatXTick = xScaleForTicks.tickFormat(xTicks.length || DEFAULT_TICK_COUNT)
  const xTickMetrics = xTicks.map((tick) => ({
    position: xScaleForTicks(tick),
    width: estimateTickLabelWidth(formatXTick(tick)),
  }))

  const leftXTickOverflow = Math.max(
    0,
    ...xTickMetrics.map(({ position, width }) => width / 2 - position),
  )
  const rightXTickOverflow = Math.max(
    0,
    ...xTickMetrics.map(({ position, width }) => width / 2 - (PLOT_WIDTH - position)),
  )
  const halfTickLabelHeight = TICK_CHARACTER_HEIGHT / 2
  const topYTickOverflow = Math.max(
    0,
    ...yTickMetrics.map(({ position }) => halfTickLabelHeight - position),
  )
  const bottomYTickOverflow = Math.max(
    0,
    ...yTickMetrics.map(({ position }) => halfTickLabelHeight - (plotHeight - position)),
  )

  // Visible tick labels expand the surrounding viewBox without changing the
  // plot ratio. Only labels that actually cross a plot edge contribute to that
  // edge's margin, followed by the shared minimum outer padding.
  const plotLeft = showTicks
    ? PLOT_EDGE_PADDING +
      Math.max(yTicks.length > 0 ? yTickLabelWidth + AXIS_LABEL_GAP : 0, leftXTickOverflow)
    : PLOT_EDGE_PADDING
  const plotRight = plotLeft + PLOT_WIDTH
  const plotTop = showTicks ? PLOT_EDGE_PADDING + topYTickOverflow : PLOT_EDGE_PADDING
  const plotBottom = plotTop + plotHeight
  const rightMargin = showTicks ? PLOT_EDGE_PADDING + rightXTickOverflow : PLOT_EDGE_PADDING
  const bottomMargin = showTicks
    ? PLOT_EDGE_PADDING +
      Math.max(xTicks.length > 0 ? AXIS_LABEL_GAP + TICK_CHARACTER_HEIGHT : 0, bottomYTickOverflow)
    : PLOT_EDGE_PADDING

  const viewWidth = plotRight + rightMargin
  const viewHeight = plotBottom + bottomMargin
  const xScale = scaleLinear<number, number>().domain(xDomain).range([plotLeft, plotRight])
  const yScale = scaleLinear<number, number>().domain(yDomain).range([plotBottom, plotTop])

  return {
    xTicks,
    yTicks,
    formatXTick,
    formatYTick,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    viewWidth,
    viewHeight,
    xScale,
    yScale,
  }
}

function getGraphLine(
  line: PreparedLine,
  xDomain: FunctionDomain,
  yDomain: FunctionDomain,
): [FunctionPointCoordinate, FunctionPointCoordinate] | null {
  if (line.kind === 'segment') {
    return clipSegmentToDomains(line.from, line.to, xDomain, yDomain)
  }

  if (line.kind === 'vertical') {
    if (line.x < xDomain[0] || line.x > xDomain[1]) return null
    return [
      { x: line.x, y: yDomain[0] },
      { x: line.x, y: yDomain[1] },
    ]
  }

  if (line.y < yDomain[0] || line.y > yDomain[1]) return null
  return [
    { x: xDomain[0], y: line.y },
    { x: xDomain[1], y: line.y },
  ]
}

function toScreenLine(
  graphLine: [FunctionPointCoordinate, FunctionPointCoordinate],
  layout: GraphLayout,
): ScreenLine {
  const [from, to] = graphLine
  return {
    x1: layout.xScale(from.x),
    y1: layout.yScale(from.y),
    x2: layout.xScale(to.x),
    y2: layout.yScale(to.y),
  }
}

function getScreenPoint(
  point: PreparedPoint,
  layout: GraphLayout,
): { x: number; y: number } | null {
  const x = layout.xScale(point.x)
  const y = layout.yScale(point.y)
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null

  const hitRadius =
    Math.max(point.size, TOUCH_ANNOTATION_HIT_WIDTH / 2) + TOUCH_ANNOTATION_HIT_WIDTH / 2
  if (
    x + hitRadius < layout.plotLeft ||
    x - hitRadius > layout.plotRight ||
    y + hitRadius < layout.plotTop ||
    y - hitRadius > layout.plotBottom
  ) {
    return null
  }

  return { x, y }
}

function ErrorFallback({ message, className }: { message: string; className?: string }) {
  return (
    <figure className={cn('not-prose mx-auto my-6 w-full max-w-sm min-w-0', className)}>
      <div
        role="alert"
        className="border-fd-error/50 bg-fd-error/10 text-fd-error flex aspect-square items-center justify-center border p-6 text-center"
      >
        <div className="max-w-xs">
          <p className="m-0 text-sm font-medium">Unable to render FunctionGraph</p>
          <p className="m-0 mt-2 text-sm leading-relaxed text-balance">{message}</p>
        </div>
      </div>
    </figure>
  )
}

/** Marker component consumed by `FunctionGraph`; it renders no standalone DOM. */
export function FunctionCurve(_props: FunctionCurveProps): null {
  return null
}

/** Point annotation component consumed by `FunctionGraph`. */
export function FunctionPoint(_props: FunctionPointProps): null {
  return null
}

/** Line annotation component consumed by `FunctionGraph`. */
export function FunctionLine(_props: FunctionLineProps): null {
  return null
}

/** Render an SVG graph with CSS-only annotation tooltips. */
export default function FunctionGraph({
  children,
  xDomain: rawXDomain = DEFAULT_DOMAIN,
  yDomain: rawYDomain = DEFAULT_DOMAIN,
  aspectRatio: rawAspectRatio = DEFAULT_ASPECT_RATIO,
  tickStep: rawTickStep,
  xTickStep: rawXTickStep,
  yTickStep: rawYTickStep,
  showGrid: rawShowGrid = true,
  showTicks: rawShowTicks = true,
  showLegend: rawShowLegend = true,
  className,
}: FunctionGraphProps) {
  const rawId = useId()
  const graphId = `function-graph-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  try {
    const xDomain = validateFiniteDomain(rawXDomain, 'xDomain')
    const yDomain = validateFiniteDomain(rawYDomain, 'yDomain')
    const aspectRatio = validateAspectRatio(rawAspectRatio)
    const tickStep = validateTickStep(rawTickStep, 'tickStep')
    const xTickStep = validateTickStep(rawXTickStep, 'xTickStep') ?? tickStep
    const yTickStep = validateTickStep(rawYTickStep, 'yTickStep') ?? tickStep
    const showGrid = validateBoolean(rawShowGrid, 'showGrid', true)
    const showTicks = validateBoolean(rawShowTicks, 'showTicks', true)
    const showLegend = validateBoolean(rawShowLegend, 'showLegend', true)
    const { curves, points, lines } = collectGraphChildren(children)
    const layout = createGraphLayout({
      xDomain,
      yDomain,
      aspectRatio,
      xTickStep,
      yTickStep,
      showTicks,
      showGrid,
    })
    const clipId = `${graphId}-clip`
    const clipUrl = `url(#${clipId})`

    const labeledCurves = curves.filter((curve) => curve.label?.trim())
    const annotationCount = points.length + lines.length
    const accessibleTitle = [
      labeledCurves.length
        ? `Function graph: ${labeledCurves.map((curve) => accessibleLabel(curve.label!)).join(', ')}`
        : 'Function graph',
      annotationCount > 0 ? `${annotationCount} annotation${annotationCount === 1 ? '' : 's'}` : '',
    ]
      .filter(Boolean)
      .join(', ')

    // Build paths and visible annotation geometry once per render. This keeps
    // sampling and clipping out of the JSX tree and makes draw order explicit.
    const curvePaths = curves.map((curve) => ({
      curve,
      path: createCurvePath(curve, xDomain, yDomain, layout.xScale, layout.yScale),
    }))
    const renderedLines = lines.flatMap((annotation) => {
      const graphLine = getGraphLine(annotation, xDomain, yDomain)
      if (graphLine === null) return []

      const screenLine = toScreenLine(graphLine, layout)
      return [
        {
          annotation,
          screenLine,
          anchor: {
            x: (screenLine.x1 + screenLine.x2) / 2,
            y: (screenLine.y1 + screenLine.y2) / 2,
          },
        },
      ]
    })
    const renderedPoints = points.flatMap((point) => {
      const screenPoint = getScreenPoint(point, layout)
      return screenPoint === null ? [] : [{ point, anchorX: screenPoint.x, anchorY: screenPoint.y }]
    })

    const xZero = xDomain[0] <= 0 && xDomain[1] >= 0 ? layout.yScale(0) : undefined
    const yZero = yDomain[0] <= 0 && yDomain[1] >= 0 ? layout.xScale(0) : undefined

    return (
      <figure
        className={cn(
          'not-prose text-fd-foreground mx-auto my-6 w-full max-w-sm min-w-0',
          className,
        )}
      >
        {showLegend && labeledCurves.length > 0 ? (
          <figcaption className="text-fd-foreground m-2 text-sm">
            <ul
              aria-label="Functions"
              className="m-0 flex list-none flex-wrap items-center justify-center gap-x-4 gap-y-2 p-0"
            >
              {labeledCurves.map((curve) => {
                const rendered = renderLabel(curve.label!)
                const colorStyle = getColorStyle(curve.color)

                return (
                  <li key={curve.key} className="inline-flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn('size-3 shrink-0 rounded-full bg-current', curve.colorClass)}
                      style={colorStyle}
                    />
                    {rendered.error ? (
                      <code className="text-fd-foreground break-all">{rendered.text}</code>
                    ) : rendered.latex ? (
                      <span dangerouslySetInnerHTML={{ __html: rendered.html! }} />
                    ) : (
                      <span className="wrap-break-word">{rendered.text}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </figcaption>
        ) : null}

        <svg
          id={graphId}
          role="img"
          aria-label={accessibleTitle}
          className="block h-auto w-full max-w-full select-none"
          viewBox={`0 0 ${layout.viewWidth} ${layout.viewHeight}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={layout.plotLeft}
                y={layout.plotTop}
                width={layout.plotRight - layout.plotLeft}
                height={layout.plotBottom - layout.plotTop}
              />
            </clipPath>
          </defs>
          <style>{`
            @media (any-pointer: coarse) {
              #${graphId} .function-graph-hit-line,
              #${graphId} .function-graph-hit-point {
                stroke-width: ${TOUCH_ANNOTATION_HIT_WIDTH};
              }
            }

            #${graphId} .function-graph-hit-line:focus,
            #${graphId} .function-graph-hit-point:focus {
              outline: none;
              -webkit-tap-highlight-color: transparent;
            }
          `}</style>

          {/* Structural grid and axes are drawn before annotations. */}
          {showGrid
            ? layout.xTicks.map((tick) => (
                <line
                  key={`grid-x-${tick}`}
                  x1={layout.xScale(tick)}
                  x2={layout.xScale(tick)}
                  y1={layout.plotTop}
                  y2={layout.plotBottom}
                  stroke="var(--color-fd-border)"
                  strokeWidth="0.75"
                  vectorEffect="non-scaling-stroke"
                />
              ))
            : null}
          {showGrid
            ? layout.yTicks.map((tick) => (
                <line
                  key={`grid-y-${tick}`}
                  x1={layout.plotLeft}
                  x2={layout.plotRight}
                  y1={layout.yScale(tick)}
                  y2={layout.yScale(tick)}
                  stroke="var(--color-fd-border)"
                  strokeWidth="0.75"
                  vectorEffect="non-scaling-stroke"
                />
              ))
            : null}

          {xZero === undefined ? null : (
            <line
              x1={layout.plotLeft}
              x2={layout.plotRight}
              y1={xZero}
              y2={xZero}
              stroke="var(--color-fd-foreground)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {yZero === undefined ? null : (
            <line
              x1={yZero}
              x2={yZero}
              y1={layout.plotTop}
              y2={layout.plotBottom}
              stroke="var(--color-fd-foreground)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {showTicks ? (
            <g className="select-none">
              {layout.xTicks.map((tick) => (
                <text
                  key={`label-x-${tick}`}
                  x={layout.xScale(tick)}
                  y={layout.plotBottom + AXIS_LABEL_GAP}
                  fill="var(--color-fd-muted-foreground)"
                  textAnchor="middle"
                  dominantBaseline="hanging"
                  className="font-mono text-xs select-none"
                >
                  {layout.formatXTick(tick)}
                </text>
              ))}
              {layout.yTicks.map((tick) => (
                <text
                  key={`label-y-${tick}`}
                  x={layout.plotLeft - AXIS_LABEL_GAP}
                  y={layout.yScale(tick) + TICK_BASELINE_OFFSET}
                  fill="var(--color-fd-muted-foreground)"
                  textAnchor="end"
                  className="font-mono text-xs select-none"
                >
                  {layout.formatYTick(tick)}
                </text>
              ))}
            </g>
          ) : null}

          <g className="text-fd-foreground">
            {/* Annotation lines sit above the grid/axes and below curves. */}
            {renderedLines.map(({ annotation, screenLine }) => {
              const colorStyle = getColorStyle(annotation.color)

              return (
                <line
                  key={annotation.id}
                  {...screenLine}
                  clipPath={clipUrl}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray={annotation.dashed ? '6 4' : undefined}
                  style={colorStyle}
                  vectorEffect="non-scaling-stroke"
                  className={annotation.colorClass}
                  aria-hidden="true"
                  pointerEvents="none"
                />
              )
            })}

            {/* Curves are rendered after lines so annotations remain readable.
                They do not need pointer events, so they cannot block a line's
                wider transparent hit stroke. */}
            <g clipPath={clipUrl}>
              {curvePaths.map(({ curve, path }) => {
                if (!path) return null
                const colorStyle = getColorStyle(curve.color)
                return (
                  <path
                    key={curve.key}
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className={curve.colorClass}
                    style={colorStyle}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                )
              })}
            </g>

            {/* Keep the line hit layer and tooltip above every curve. The
                visual line remains in the required pre-curve draw order. */}
            {renderedLines.map(({ annotation, screenLine, anchor }) => {
              const colorStyle = getColorStyle(annotation.color)

              return (
                <g key={`${annotation.id}-interaction`} className="group">
                  <g clipPath={clipUrl}>
                    <line
                      {...screenLine}
                      stroke="currentColor"
                      strokeWidth={ANNOTATION_HIT_WIDTH}
                      strokeOpacity="0.001"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      style={colorStyle}
                      className={cn(
                        'function-graph-hit-line touch-manipulation',
                        annotation.colorClass,
                      )}
                      role="img"
                      aria-label={annotation.tooltip}
                      tabIndex={0}
                      focusable="true"
                      pointerEvents="stroke"
                    />
                  </g>
                  <AnnotationTooltip
                    anchorX={anchor.x}
                    anchorY={anchor.y}
                    layout={layout}
                    content={annotation.tooltip}
                  />
                </g>
              )
            })}

            {/* Points are last so a point marker is not hidden by its curve. */}
            {renderedPoints.map(({ point, anchorX, anchorY }) => {
              const colorStyle = getColorStyle(point.color)

              return (
                <g key={point.id} className="group">
                  <g clipPath={clipUrl}>
                    <circle
                      cx={anchorX}
                      cy={anchorY}
                      r={Math.max(point.size, ANNOTATION_HIT_WIDTH / 2)}
                      fill="transparent"
                      stroke="currentColor"
                      strokeOpacity="0.001"
                      strokeWidth={ANNOTATION_HIT_WIDTH}
                      vectorEffect="non-scaling-stroke"
                      className={cn(
                        'function-graph-hit-point touch-manipulation',
                        point.colorClass,
                      )}
                      style={colorStyle}
                      role="img"
                      aria-label={point.tooltip}
                      tabIndex={0}
                      focusable="true"
                      pointerEvents="all"
                    />
                    <circle
                      cx={anchorX}
                      cy={anchorY}
                      r={point.size}
                      fill={point.filled ? 'currentColor' : 'none'}
                      stroke={point.filled ? 'none' : 'currentColor'}
                      strokeWidth={point.filled ? undefined : 1.5}
                      vectorEffect="non-scaling-stroke"
                      className={point.colorClass}
                      style={colorStyle}
                      aria-hidden="true"
                      pointerEvents="none"
                    />
                  </g>
                  <AnnotationTooltip
                    anchorX={anchorX}
                    anchorY={anchorY}
                    layout={layout}
                    content={point.tooltip}
                  />
                </g>
              )
            })}
          </g>
        </svg>
      </figure>
    )
  } catch (error) {
    return (
      <ErrorFallback
        className={className}
        message={error instanceof Error ? error.message : 'An unexpected error occurred.'}
      />
    )
  }
}
