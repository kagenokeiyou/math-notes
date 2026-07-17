import { cn } from 'cnfast'
import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { curveLinear, line } from 'd3-shape'
import katex from 'katex'
import { Children, isValidElement, useId, type ReactNode } from 'react'

/** A finite, ascending interval used for an axis or a curve domain. */
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
  /** One or more non-overlapping x intervals in which the curve is drawn. */
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
  /** Circle radius in graph units. Defaults to `4`. */
  size?: number
  /** Draw a filled circle. Defaults to `true`. */
  filled?: boolean
  /** Hover tooltip content. Complete `$...$` values are rendered as KaTeX. */
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
  /** Hover tooltip content. Complete `$...$` values are rendered as KaTeX. */
  tooltip?: string
}

interface Interval {
  start: number
  end: number
  openStart: boolean
  openEnd: boolean
}

interface SamplePoint {
  x: number
  y: number | null
}

interface ColorAssignment {
  color?: string
  colorClass?: string
}

interface PreparedCurve extends ColorAssignment {
  key: string
  sourceId?: string
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
const TICK_CHARACTER_HEIGHT = 16
const TICK_BASELINE_OFFSET = 4
const PLOT_EDGE_PADDING = 1

const DEFAULT_TICK_COUNT = 8
const MAX_TICK_COUNT = 2000

// Tooltips are CSS-only, so the graph needs no client-side state. The hit line
// is wider than the visible line to make a thin reference line easy to hover.
const TOOLTIP_WIDTH = 200
const TOOLTIP_HEIGHT = 64
const TOOLTIP_OFFSET = 8
const ANNOTATION_HIT_WIDTH = 12

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

function validateDomain(value: unknown, name: string): FunctionDomain {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isFiniteNumber(value[0]) ||
    !isFiniteNumber(value[1]) ||
    value[0] >= value[1] ||
    !isFiniteNumber(value[1] - value[0])
  ) {
    throw new Error(`${name} must be a finite ascending pair`)
  }

  return [value[0], value[1]]
}

function validateTickStep(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined

  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`${name} must be a finite number greater than zero`)
  }

  return value
}

function validateAspectRatio(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error('aspectRatio must be a finite number greater than zero')
  }

  return value
}

function validateBoolean(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`)
  return value
}

function validateIdentifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value
}

function validateColor(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} color must be a non-empty CSS color string`)
  }
  return value
}

function validateTooltip(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  return validateIdentifier(value, `${name} tooltip`)
}

function validateCoordinate(value: unknown, name: string): FunctionPointCoordinate {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${name} must contain finite x and y coordinates`)
  }

  const coordinate = value as { x?: unknown; y?: unknown }
  if (!isFiniteNumber(coordinate.x) || !isFiniteNumber(coordinate.y)) {
    throw new Error(`${name} must contain finite x and y coordinates`)
  }

  return { x: coordinate.x, y: coordinate.y }
}

function createTicks(
  scale: NumericScale,
  domain: FunctionDomain,
  step: number | undefined,
): number[] {
  if (step === undefined) return scale.ticks(DEFAULT_TICK_COUNT)

  const span = domain[1] - domain[0]
  if (span / step > MAX_TICK_COUNT) {
    throw new Error(`tick step produces too many ticks (maximum is ${MAX_TICK_COUNT})`)
  }

  // A tiny tolerance avoids dropping a boundary tick when division produces
  // a value such as 2.9999999999999996 for an otherwise exact multiple.
  const epsilon = Math.max(Math.abs(step) * 1e-12, Number.EPSILON)
  const firstIndex = Math.ceil((domain[0] - epsilon) / step)
  const lastIndex = Math.floor((domain[1] + epsilon) / step)
  const count = lastIndex - firstIndex + 1

  if (count > MAX_TICK_COUNT) {
    throw new Error(`tick step produces too many ticks (maximum is ${MAX_TICK_COUNT})`)
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

function getCurveById(
  curvesById: Map<string, PreparedCurve>,
  rawCurveId: unknown,
  name: string,
): PreparedCurve {
  const curveId = validateIdentifier(rawCurveId, `${name} curveId`)
  const curve = curvesById.get(curveId)
  if (!curve) throw new Error(`${name} references unknown curve id "${curveId}"`)
  return curve
}

function preparePoint(
  props: FunctionPointProps,
  index: number,
  curvesById: Map<string, PreparedCurve>,
): PreparedPoint {
  const name = `point ${index + 1}`
  if (!isFiniteNumber(props.x)) throw new Error(`${name} x must be finite`)

  const hasY = props.y !== undefined
  const hasCurveId = props.curveId !== undefined
  if (hasY === hasCurveId) {
    throw new Error(`${name} must provide exactly one of y or curveId`)
  }

  const explicitColor = validateColor(props.color, name)
  const explicitTooltip = validateTooltip(props.tooltip, name)
  const size = props.size ?? 4
  if (!isFiniteNumber(size) || size <= 0) {
    throw new Error(`${name} size must be a finite number greater than zero`)
  }

  const filled = props.filled ?? true
  if (typeof filled !== 'boolean') throw new Error(`${name} filled must be a boolean`)

  const curve = hasCurveId ? getCurveById(curvesById, props.curveId, name) : undefined
  let y: number

  if (curve) {
    try {
      y = curve.fn(props.x)
    } catch {
      throw new Error(`${name} curve evaluation failed`)
    }
    if (!isFiniteNumber(y)) throw new Error(`${name} curve evaluation must be finite`)
  } else {
    y = props.y as number
    if (!isFiniteNumber(y)) throw new Error(`${name} y must be finite`)
  }

  return {
    id: `point-${index}`,
    x: props.x,
    y,
    tooltip:
      explicitTooltip ??
      `Point: (${formatAnnotationNumber(props.x)}, ${formatAnnotationNumber(y)})`,
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
  const name = `line ${index + 1}`
  const hasFrom = props.from !== undefined
  const hasTo = props.to !== undefined
  const hasSegment = hasFrom || hasTo
  const hasVertical = props.x !== undefined
  const hasHorizontal = props.y !== undefined
  const geometryCount = [hasSegment, hasVertical, hasHorizontal].filter(Boolean).length

  if (geometryCount !== 1 || (hasSegment && (!hasFrom || !hasTo))) {
    throw new Error(`${name} must provide exactly one line geometry`)
  }

  const explicitColor = validateColor(props.color, name)
  const explicitTooltip = validateTooltip(props.tooltip, name)
  const dashed = props.dashed ?? false
  if (typeof dashed !== 'boolean') throw new Error(`${name} dashed must be a boolean`)

  const curve =
    props.curveId === undefined ? undefined : getCurveById(curvesById, props.curveId, name)

  if (hasSegment) {
    const from = validateCoordinate(props.from, `${name} from`)
    const to = validateCoordinate(props.to, `${name} to`)
    return {
      id: `line-${index}`,
      kind: 'segment',
      from,
      to,
      tooltip:
        explicitTooltip ??
        `Line segment: (${formatAnnotationNumber(from.x)}, ${formatAnnotationNumber(from.y)}) -> (${formatAnnotationNumber(to.x)}, ${formatAnnotationNumber(to.y)})`,
      ...resolveColor(curve, explicitColor),
      dashed,
    }
  }

  if (hasVertical) {
    if (!isFiniteNumber(props.x)) throw new Error(`${name} x must be finite`)
    return {
      id: `line-${index}`,
      kind: 'vertical',
      x: props.x,
      tooltip: explicitTooltip ?? `Vertical line: x = ${formatAnnotationNumber(props.x)}`,
      ...resolveColor(curve, explicitColor),
      dashed,
    }
  }

  if (!isFiniteNumber(props.y)) throw new Error(`${name} y must be finite`)
  return {
    id: `line-${index}`,
    kind: 'horizontal',
    y: props.y,
    tooltip: explicitTooltip ?? `Horizontal line: y = ${formatAnnotationNumber(props.y)}`,
    ...resolveColor(curve, explicitColor),
    dashed,
  }
}

function collectGraphChildren(children: ReactNode): PreparedGraphChildren {
  const elements = Children.toArray(children)
  if (elements.length === 0) throw new Error('at least one FunctionCurve is required')

  const curves: PreparedCurve[] = []
  const curvesById = new Map<string, PreparedCurve>()
  const pointProps: FunctionPointProps[] = []
  const lineProps: FunctionLineProps[] = []

  elements.forEach((child, index) => {
    if (!isValidElement(child)) {
      throw new Error(`child ${index + 1} must be a FunctionCurve, FunctionPoint, or FunctionLine`)
    }

    if (child.type === FunctionCurve) {
      const props = child.props as FunctionCurveProps
      if (typeof props.fn !== 'function') {
        throw new Error(`curve ${index + 1} must provide an fn callback`)
      }
      if (props.label !== undefined && typeof props.label !== 'string') {
        throw new Error(`curve ${index + 1} label must be a string`)
      }

      const color = validateColor(props.color, `curve ${index + 1}`)
      const sourceId =
        props.id === undefined ? undefined : validateIdentifier(props.id, `curve ${index + 1} id`)

      if (sourceId !== undefined && curvesById.has(sourceId)) {
        throw new Error(`curve id "${sourceId}" must be unique`)
      }

      const curve: PreparedCurve = {
        key: `curve-${curves.length}`,
        sourceId,
        fn: props.fn,
        label: props.label,
        color,
        domains: props.domains,
        undefinedPoints: props.undefinedPoints,
        colorClass:
          color === undefined ? SERIES_COLORS[curves.length % SERIES_COLORS.length] : undefined,
      }
      curves.push(curve)
      if (sourceId !== undefined) curvesById.set(sourceId, curve)
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

    throw new Error(`child ${index + 1} must be a FunctionCurve, FunctionPoint, or FunctionLine`)
  })

  if (curves.length === 0) throw new Error('at least one FunctionCurve is required')

  return {
    curves,
    points: pointProps.map((props, index) => preparePoint(props, index, curvesById)),
    lines: lineProps.map((props, index) => prepareLine(props, index, curvesById)),
  }
}

function intersectDomains(curve: PreparedCurve, xDomain: FunctionDomain): Interval[] {
  if (curve.domains !== undefined && !Array.isArray(curve.domains)) {
    throw new Error('curve domains must be an array of intervals')
  }

  const requestedDomains = curve.domains?.map((domain, index) =>
    validateDomain(domain, `curve domain ${index + 1}`),
  ) ?? [xDomain]

  if (requestedDomains.length === 0) throw new Error('curve domains cannot be empty')

  const sortedDomains = [...requestedDomains].sort((a, b) => a[0] - b[0])
  for (let index = 1; index < sortedDomains.length; index += 1) {
    if (sortedDomains[index][0] < sortedDomains[index - 1][1]) {
      throw new Error('curve domains cannot overlap')
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
    throw new Error('curve undefinedPoints must be an array')
  }

  const undefinedPoints = [...(curve.undefinedPoints ?? [])]
    .map((point, index) => {
      if (!isFiniteNumber(point)) throw new Error(`undefined point ${index + 1} must be finite`)
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

/** Sample each interval independently so discontinuities never get joined. */
function sampleCurve(curve: PreparedCurve, xDomain: FunctionDomain): SamplePoint[] {
  const intervals = intersectDomains(curve, xDomain)
  const totalSpan = xDomain[1] - xDomain[0]
  const samples: SamplePoint[] = []

  intervals.forEach((interval, intervalIndex) => {
    if (intervalIndex > 0) samples.push({ x: interval.start, y: null })

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

      samples.push({ x, y })
    }
  })

  return samples
}

function createCurvePath(
  curve: PreparedCurve,
  xDomain: FunctionDomain,
  xScale: GraphLayout['xScale'],
  yScale: GraphLayout['yScale'],
): string | null {
  const sampledPoints = sampleCurve(curve, xDomain)
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
  const rendered = renderLabel(content)
  if (rendered.error) return <code className="break-all">{rendered.text}</code>
  if (rendered.latex) {
    return <span dangerouslySetInnerHTML={{ __html: rendered.html! }} />
  }
  return <span>{rendered.text}</span>
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
      className={cn(
        'pointer-events-none overflow-visible opacity-0 transition-opacity delay-200 duration-150 select-none group-hover:opacity-100',
      )}
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

function createGraphLayout(
  xDomain: FunctionDomain,
  yDomain: FunctionDomain,
  aspectRatio: number,
  xTickStep: number | undefined,
  yTickStep: number | undefined,
  showTicks: boolean,
): GraphLayout {
  const yScaleForTicks = scaleLinear<number, number>().domain(yDomain)
  const yTicks = createTicks(yScaleForTicks, yDomain, yTickStep)
  const formatYTick = yScaleForTicks.tickFormat(yTicks.length || DEFAULT_TICK_COUNT)
  const yTickLabelWidth = Math.max(
    0,
    ...yTicks.map((tick) => estimateTickLabelWidth(formatYTick(tick))),
  )

  const xScaleForTicks = scaleLinear<number, number>().domain(xDomain)
  const xTicks = createTicks(xScaleForTicks, xDomain, xTickStep)
  const formatXTick = xScaleForTicks.tickFormat(xTicks.length || DEFAULT_TICK_COUNT)
  const firstXTickLabelWidth = xTicks.length ? estimateTickLabelWidth(formatXTick(xTicks[0])) : 0
  const lastXTickLabelWidth = xTicks.length
    ? estimateTickLabelWidth(formatXTick(xTicks[xTicks.length - 1]))
    : 0

  // Visible tick labels expand the surrounding viewBox without changing the
  // plot ratio. Without labels, retain only enough padding for boundary strokes.
  const plotLeft = showTicks
    ? Math.max(
        AXIS_LABEL_GAP,
        yTickLabelWidth + AXIS_LABEL_GAP,
        firstXTickLabelWidth / 2 + AXIS_LABEL_GAP,
      )
    : PLOT_EDGE_PADDING
  const plotRight = plotLeft + PLOT_WIDTH
  const plotTop = showTicks ? Math.ceil(TICK_CHARACTER_HEIGHT / 2) : PLOT_EDGE_PADDING
  const plotHeight = PLOT_WIDTH / aspectRatio
  if (!isFiniteNumber(plotHeight)) {
    throw new Error('aspectRatio produces an invalid plot height')
  }
  const plotBottom = plotTop + plotHeight
  const rightMargin = showTicks
    ? Math.max(AXIS_LABEL_GAP, lastXTickLabelWidth / 2 + AXIS_LABEL_GAP)
    : PLOT_EDGE_PADDING

  const viewWidth = plotRight + rightMargin
  const viewHeight =
    plotBottom + (showTicks ? AXIS_LABEL_GAP + TICK_CHARACTER_HEIGHT : PLOT_EDGE_PADDING)
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

function getScreenLine(line: PreparedLine, layout: GraphLayout): ScreenLine {
  if (line.kind === 'segment') {
    return {
      x1: layout.xScale(line.from.x),
      y1: layout.yScale(line.from.y),
      x2: layout.xScale(line.to.x),
      y2: layout.yScale(line.to.y),
    }
  }

  if (line.kind === 'vertical') {
    const x = layout.xScale(line.x)
    return { x1: x, y1: layout.plotTop, x2: x, y2: layout.plotBottom }
  }

  const y = layout.yScale(line.y)
  return { x1: layout.plotLeft, y1: y, x2: layout.plotRight, y2: y }
}

function getVisibleLine(screenLine: ScreenLine, layout: GraphLayout): ScreenLine | null {
  // Liang-Barsky clipping gives the tooltip an anchor on the visible portion
  // of an out-of-bounds segment rather than at its (possibly invisible) raw
  // midpoint.
  const dx = screenLine.x2 - screenLine.x1
  const dy = screenLine.y2 - screenLine.y1
  let start = 0
  let end = 1

  const constraints: Array<[number, number]> = [
    [-dx, screenLine.x1 - layout.plotLeft],
    [dx, layout.plotRight - screenLine.x1],
    [-dy, screenLine.y1 - layout.plotTop],
    [dy, layout.plotBottom - screenLine.y1],
  ]

  for (const [p, q] of constraints) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }

    const ratio = q / p
    if (p < 0) {
      if (ratio > end) return null
      start = Math.max(start, ratio)
    } else {
      if (ratio < start) return null
      end = Math.min(end, ratio)
    }
  }

  return {
    x1: screenLine.x1 + dx * start,
    y1: screenLine.y1 + dy * start,
    x2: screenLine.x1 + dx * end,
    y2: screenLine.y1 + dy * end,
  }
}

function getLineAnchor(screenLine: ScreenLine, layout: GraphLayout): { x: number; y: number } {
  const visibleLine = getVisibleLine(screenLine, layout) ?? screenLine
  return {
    x: (visibleLine.x1 + visibleLine.x2) / 2,
    y: (visibleLine.y1 + visibleLine.y2) / 2,
  }
}

function ErrorFallback({ message, className }: { message: string; className?: string }) {
  return (
    <figure className={cn('not-prose mx-auto my-6 w-full min-w-0', className)}>
      <div
        role="alert"
        className="border-fd-border bg-fd-muted/30 text-fd-muted-foreground flex aspect-square items-center justify-center border p-6 text-center text-sm"
      >
        {message}
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
    const xDomain = validateDomain(rawXDomain, 'xDomain')
    const yDomain = validateDomain(rawYDomain, 'yDomain')
    const aspectRatio = validateAspectRatio(rawAspectRatio)
    const tickStep = validateTickStep(rawTickStep, 'tickStep')
    const xTickStep = validateTickStep(rawXTickStep, 'xTickStep') ?? tickStep
    const yTickStep = validateTickStep(rawYTickStep, 'yTickStep') ?? tickStep
    const showGrid = validateBoolean(rawShowGrid, 'showGrid', true)
    const showTicks = validateBoolean(rawShowTicks, 'showTicks', true)
    const showLegend = validateBoolean(rawShowLegend, 'showLegend', true)
    const { curves, points, lines } = collectGraphChildren(children)
    const layout = createGraphLayout(xDomain, yDomain, aspectRatio, xTickStep, yTickStep, showTicks)
    const clipId = `${graphId}-clip`

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

    // Build paths once per render. This keeps function sampling out of the JSX
    // tree and makes the fixed draw order explicit below.
    const curvePaths = curves.map((curve) => ({
      curve,
      path: createCurvePath(curve, xDomain, layout.xScale, layout.yScale),
    }))
    const renderedLines = lines.map((annotation) => {
      const screenLine = getScreenLine(annotation, layout)
      return {
        annotation,
        screenLine,
        anchor: getLineAnchor(screenLine, layout),
      }
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
                const colorStyle = curve.color ? { color: curve.color } : undefined

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
              const colorStyle = annotation.color ? { color: annotation.color } : undefined

              return (
                <g key={annotation.id}>
                  <g clipPath={`url(#${clipId})`}>
                    <line
                      {...screenLine}
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray={annotation.dashed ? '6 4' : undefined}
                      style={colorStyle}
                      vectorEffect="non-scaling-stroke"
                      className={annotation.colorClass}
                      aria-label={annotation.tooltip}
                      pointerEvents="none"
                    />
                  </g>
                </g>
              )
            })}

            {/* Curves are rendered after lines so annotations remain readable.
                They do not need pointer events, so they cannot block a line's
                wider transparent hit stroke. */}
            <g clipPath={`url(#${clipId})`}>
              {curvePaths.map(({ curve, path }) => {
                if (!path) return null
                const colorStyle = curve.color ? { color: curve.color } : undefined
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
              const colorStyle = annotation.color ? { color: annotation.color } : undefined

              return (
                <g key={`${annotation.id}-interaction`} className="group">
                  <g clipPath={`url(#${clipId})`}>
                    <line
                      {...screenLine}
                      stroke="currentColor"
                      strokeWidth={ANNOTATION_HIT_WIDTH}
                      strokeOpacity="0.001"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      style={colorStyle}
                      className={annotation.colorClass}
                      aria-hidden="true"
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
            {points.map((point) => {
              const anchorX = layout.xScale(point.x)
              const anchorY = layout.yScale(point.y)
              const colorStyle = point.color ? { color: point.color } : undefined

              return (
                <g key={point.id} className="group">
                  <g clipPath={`url(#${clipId})`}>
                    <circle
                      cx={anchorX}
                      cy={anchorY}
                      r={Math.max(point.size, ANNOTATION_HIT_WIDTH / 2)}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity="0.001"
                      strokeWidth={ANNOTATION_HIT_WIDTH}
                      vectorEffect="non-scaling-stroke"
                      className={point.colorClass}
                      style={colorStyle}
                      aria-hidden="true"
                      pointerEvents="stroke"
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
                      aria-label={point.tooltip}
                      pointerEvents="all"
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
        message={error instanceof Error ? error.message : 'Unable to render function graph'}
      />
    )
  }
}
