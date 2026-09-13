// PDF report renderer for GET /api/export/pdf — a clean, monochrome A4 sheet
// built with pdf-lib (StandardFonts Helvetica, no font files to ship).
// No chart raster on purpose: the production image has no browser/canvas to
// rasterize the hours chart with, so the report is typography-only — the
// hours-by-day table carries the same data the chart would.
// Grayscale literals below are PDF ink values, not UI colors — the app's
// "semantic tokens only" rule governs UI surfaces; a printed document is
// exempt the same way static email HTML is.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, grayscale } from 'pdf-lib'
import type { ReportBillFilter, ReportGroupBy, ReportSummary } from '#shared/types/reports'
import type { ReportDayTotal } from './report-data'

// ── Page geometry (points) ──────────────────────────────────────────────────
const A4 = { w: 595.28, h: 841.89 }
const MARGIN = 48
const CONTENT_W = A4.w - MARGIN * 2
const FOOTER_H = 30

// ── Ink (monochrome ramp) ───────────────────────────────────────────────────
const INK = grayscale(0.12)
const INK_SOFT = grayscale(0.38)
const INK_DIM = grayscale(0.55)
const RULE = grayscale(0.78)
const RULE_SOFT = grayscale(0.88)

export interface ReportPdfMeta {
  orgName: string
  from: Date
  /** Inclusive last day of the range (to - 1 day). */
  lastDay: Date
  billable: ReportBillFilter
  groupBy: ReportGroupBy
  /** Per-day totals (fan-out-safe) from buildReportDayTotals. */
  dayTotals: ReportDayTotal[]
}

// ── Formatting (mirrors app/utils/format.ts conventions) ────────────────────
const fmtDuration = (sec: number): string => {
  const totalMin = Math.round(Math.max(0, sec) / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
// Formatters built once: toLocaleString/toLocaleDateString with options
// construct a fresh Intl formatter per call (~40-75µs each), which dominated
// a year-long report's hundreds of day and money cells. Same output by spec.
const MONEY_FMT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DAY_ROW_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const DATE_LONG_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const fmtMoney = (n: number): string => '$' + MONEY_FMT.format(n)

const fmtDayRow = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1)
  return DAY_ROW_FMT.format(date)
}
const fmtDateLong = (d: Date): string => DATE_LONG_FMT.format(d)

const BILLABLE_LABEL: Record<ReportBillFilter, string> = {
  all: 'All entries',
  billable: 'Billable only',
  nonbillable: 'Non-billable only'
}
const GROUP_LABEL: Record<ReportGroupBy, string> = {
  client: 'Client',
  project: 'Project',
  task: 'Task',
  tag: 'Tag'
}

/**
 * Helvetica is WinAnsi-encoded; arbitrary user text (labels, org names) may
 * hold characters outside it. Map common typographic marks, replace the rest.
 */
function winAnsiSafe(s: string): string {
  return s
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^ -~ -ÿ–—‘’“”]/g, '?')
}

interface Col {
  /** Width in points; the first (label) column absorbs the remainder. */
  w: number
  align: 'left' | 'right'
}

/** Cursor-based page writer: tracks y, adds pages, numbers them at the end. */
class Sheet {
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  page!: PDFPage
  y = 0
  private meta: ReportPdfMeta

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, meta: ReportPdfMeta) {
    this.doc = doc
    this.font = font
    this.bold = bold
    this.meta = meta
    this.addPage()
  }

  addPage() {
    this.page = this.doc.addPage([A4.w, A4.h])
    this.y = A4.h - MARGIN
  }

  /** Start a new page when fewer than `h` points remain above the footer. */
  ensure(h: number) {
    if (this.y - h < MARGIN + FOOTER_H) this.addPage()
  }

  text(s: string, x: number, size: number, opts: { bold?: boolean, color?: ReturnType<typeof grayscale>, rightEdge?: number } = {}) {
    const font = opts.bold ? this.bold : this.font
    const str = winAnsiSafe(s)
    const x0 = opts.rightEdge != null ? opts.rightEdge - font.widthOfTextAtSize(str, size) : x
    this.page.drawText(str, { x: x0, y: this.y, size, font, color: opts.color ?? INK })
  }

  /** Ellipsize `s` so it fits in `maxW` points at `size`. */
  fit(s: string, size: number, maxW: number, bold = false): string {
    const font = bold ? this.bold : this.font
    let str = winAnsiSafe(s)
    if (font.widthOfTextAtSize(str, size) <= maxW) return str
    while (str.length > 1 && font.widthOfTextAtSize(str + '...', size) > maxW) {
      str = str.slice(0, -1)
    }
    return str + '...'
  }

  rule(color = RULE_SOFT, thickness = 0.5) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_W, y: this.y },
      thickness,
      color
    })
  }

  /** One table row: first cell flexes left, the rest use fixed widths. */
  row(cells: string[], cols: Col[], size: number, opts: { bold?: boolean, color?: ReturnType<typeof grayscale>, subLabel?: string | null } = {}) {
    const fixedW = cols.slice(1).reduce((a, c) => a + c.w, 0)
    const labelW = CONTENT_W - fixedW
    const color = opts.color ?? INK

    // Label cell (+ optional dim sub-label appended after it)
    const label = this.fit(cells[0] ?? '', size, labelW - 8 - (opts.subLabel ? 4 : 0), opts.bold)
    this.text(label, MARGIN, size, { bold: opts.bold, color })
    if (opts.subLabel) {
      const labelEnd = MARGIN + (opts.bold ? this.bold : this.font).widthOfTextAtSize(label, size) + 5
      const subW = labelW - 8 - (labelEnd - MARGIN)
      if (subW > 20) {
        this.text(this.fit(opts.subLabel, size - 1, subW), labelEnd, size - 1, { color: INK_DIM })
      }
    }

    // Fixed cells
    let x = MARGIN + labelW
    for (let i = 1; i < cols.length; i++) {
      const col = cols[i]!
      const cell = cells[i] ?? ''
      if (col.align === 'right') {
        this.text(cell, x, size, { bold: opts.bold, color, rightEdge: x + col.w })
      } else {
        this.text(cell, x, size, { bold: opts.bold, color })
      }
      x += col.w
    }
  }

  /** Column headers + hairline; repeated automatically after page breaks. */
  tableHeader(labels: string[], cols: Col[]) {
    this.ensure(30)
    this.y -= 4
    this.row(labels, cols, 7.5, { bold: true, color: INK_SOFT })
    this.y -= 6
    this.rule(RULE)
    this.y -= 12
  }

  sectionTitle(title: string) {
    this.ensure(60) // title + header + at least one row stay together
    this.y -= 10
    this.text(title, MARGIN, 11, { bold: true })
    this.y -= 10
  }

  /** Footer on every page — drawn last, once the total count is known. */
  numberPages() {
    const pages = this.doc.getPages()
    const total = pages.length
    pages.forEach((page, i) => {
      const label = `Page ${i + 1} of ${total}`
      const left = winAnsiSafe(`Tick - ${this.meta.orgName}`)
      page.drawLine({
        start: { x: MARGIN, y: MARGIN + 14 },
        end: { x: MARGIN + CONTENT_W, y: MARGIN + 14 },
        thickness: 0.5,
        color: RULE_SOFT
      })
      page.drawText(left, { x: MARGIN, y: MARGIN, size: 7.5, font: this.font, color: INK_DIM })
      page.drawText(label, {
        x: MARGIN + CONTENT_W - this.font.widthOfTextAtSize(label, 7.5),
        y: MARGIN,
        size: 7.5,
        font: this.font,
        color: INK_DIM
      })
    })
  }
}

const DAY_COLS: Col[] = [
  { w: 0, align: 'left' },
  { w: 80, align: 'right' },
  { w: 80, align: 'right' },
  { w: 90, align: 'right' }
]

const GROUP_COLS: Col[] = [
  { w: 0, align: 'left' },
  { w: 55, align: 'right' },
  { w: 70, align: 'right' },
  { w: 70, align: 'right' },
  { w: 80, align: 'right' },
  { w: 50, align: 'right' }
]

export async function renderReportPdf(summary: ReportSummary, meta: ReportPdfMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Tick time report')
  doc.setAuthor(meta.orgName)
  doc.setCreator('Tick')

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const s = new Sheet(doc, font, bold, meta)
  const { totals, days, groups } = summary

  // ── Header ────────────────────────────────────────────────────────────────
  s.y -= 6
  s.text('Tick', MARGIN, 20, { bold: true })
  s.text(`Generated ${fmtDateLong(new Date())}`, 0, 8, { color: INK_DIM, rightEdge: MARGIN + CONTENT_W })
  s.y -= 16
  s.text(`${meta.orgName} - Time report`, MARGIN, 11, { color: INK_SOFT })
  s.y -= 14
  s.text(
    `${fmtDateLong(meta.from)} - ${fmtDateLong(meta.lastDay)}  ·  ${BILLABLE_LABEL[meta.billable]}  ·  Grouped by ${GROUP_LABEL[meta.groupBy]}`,
    MARGIN,
    9,
    { color: INK_DIM }
  )
  s.y -= 14
  s.rule(RULE)

  // ── Stat summary row (mirrors ReportsStatCards) ───────────────────────────
  s.y -= 26
  const statW = CONTENT_W / 4
  const stats: { label: string, value: string, meta: string }[] = [
    {
      label: 'TRACKED',
      value: fmtDuration(totals.sec),
      meta: `${totals.workedDays} working day${totals.workedDays === 1 ? '' : 's'}`
    },
    {
      label: 'BILLABLE',
      value: fmtDuration(totals.billableSec),
      meta: totals.sec ? `${Math.round((totals.billableSec / totals.sec) * 100)}% of tracked` : '-'
    },
    {
      label: 'AMOUNT',
      value: fmtMoney(totals.amount),
      meta: totals.avgRate != null ? `avg $${Math.round(totals.avgRate)}/h` : 'nothing billable'
    },
    {
      label: 'PER DAY',
      value: totals.workedDays ? fmtDuration(totals.sec / totals.workedDays) : '-',
      meta: 'average on worked days'
    }
  ]
  stats.forEach((st, i) => {
    const x = MARGIN + statW * i
    s.text(st.label, x, 7, { bold: true, color: INK_DIM })
    s.page.drawText(winAnsiSafe(st.value), { x, y: s.y - 16, size: 15, font: bold, color: INK })
    s.page.drawText(winAnsiSafe(st.meta), { x, y: s.y - 27, size: 7.5, font, color: INK_DIM })
  })
  s.y -= 40
  s.rule(RULE)

  // ── Hours by day ──────────────────────────────────────────────────────────
  s.sectionTitle('Hours by day')
  const dayHeader = () => s.tableHeader(['DAY', 'HOURS', 'BILLABLE', 'AMOUNT'], DAY_COLS)
  dayHeader()
  // Per-day billable/amount come from buildReportDayTotals (fan-out-safe);
  // summary.days carries chart segments only.
  for (const d of meta.dayTotals) {
    const before = s.page
    s.ensure(16)
    if (s.page !== before) dayHeader()
    const zero = d.sec === 0
    s.row(
      [fmtDayRow(d.date), zero ? '-' : fmtDuration(d.sec), zero ? '-' : fmtDuration(d.billableSec), zero ? '-' : fmtMoney(d.amount)],
      DAY_COLS,
      9,
      { color: zero ? INK_DIM : INK }
    )
    s.y -= 6
    s.rule()
    s.y -= 10
  }
  // Totals row
  {
    const before = s.page
    s.ensure(18)
    if (s.page !== before) dayHeader()
    s.row(['Total', fmtDuration(totals.sec), fmtDuration(totals.billableSec), fmtMoney(totals.amount)], DAY_COLS, 9, { bold: true })
    s.y -= 8
  }

  // ── Breakdown by current grouping ─────────────────────────────────────────
  s.sectionTitle(`Breakdown by ${GROUP_LABEL[meta.groupBy].toLowerCase()}`)
  const groupHeader = () =>
    s.tableHeader([GROUP_LABEL[meta.groupBy].toUpperCase(), 'ENTRIES', 'HOURS', 'BILLABLE', 'AMOUNT', 'SHARE'], GROUP_COLS)
  groupHeader()
  if (groups.length === 0) {
    s.ensure(16)
    s.row(['No entries in this range', '', '', '', '', ''], GROUP_COLS, 9, { color: INK_DIM })
    s.y -= 16
  }
  for (const g of groups) {
    const before = s.page
    s.ensure(16)
    if (s.page !== before) groupHeader()
    s.row(
      [g.label, String(g.entries), fmtDuration(g.sec), fmtDuration(g.billableSec), fmtMoney(g.amount), `${g.sharePct}%`],
      GROUP_COLS,
      9,
      { subLabel: g.sub }
    )
    s.y -= 6
    s.rule()
    s.y -= 10
  }
  // Totals row — entries here are true entry counts (no tag fan-out).
  {
    const before = s.page
    s.ensure(18)
    if (s.page !== before) groupHeader()
    s.row(
      [
        'Total',
        String(totals.entries),
        fmtDuration(totals.sec),
        fmtDuration(totals.billableSec),
        fmtMoney(totals.amount),
        totals.sec > 0 ? '100%' : '-'
      ],
      GROUP_COLS,
      9,
      { bold: true }
    )
    s.y -= 8
  }

  s.numberPages()
  return doc.save()
}
