// The package's "browser" field already points at the standalone bundle, so this
// resolves away from the Node build and its stream dependencies on its own.
import ExcelJS from 'exceljs'

/**
 * The year report as a real spreadsheet file.
 *
 * This used to call window.print(), which produced whatever the page happened to
 * look like: the sidebar, the chat button, charts cut in half at a page break. A
 * report is a file you send to someone, not a screenshot of an app, so this builds
 * an actual workbook with the figures in cells that can be sorted and summed, and
 * the charts embedded as pictures beside them.
 *
 * Charts are rasterised from the SVG already on screen rather than redrawn, so the
 * picture in the file is exactly the one the reader just looked at. Excel's own
 * chart format cannot be written by any browser-side library, and a picture that
 * matches beats a native chart that disagrees.
 */

const HEADER_FILL = 'FF1E293B'
const BAND_FILL = 'FFF1F5F9'
const INK = '#334155'

export interface CapturedChart {
  title: string
  dataUrl: string
  width: number
  height: number
}

/**
 * Turn an on-screen chart into a PNG.
 *
 * The SVG is cloned rather than moved, because detaching the live node would blank
 * the chart the user is looking at while the file builds.
 */
async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<CapturedChart | null> {
  const box = svg.getBoundingClientRect()
  const width = Math.round(box.width)
  const height = Math.round(box.height)
  if (width < 40 || height < 40) return null

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  // currentColor resolves against an ancestor that no longer exists once the SVG is
  // serialised on its own, so axes and gridlines would rasterise as black. Bind it
  // to the ink the chart uses on a white ground.
  clone.querySelectorAll('*').forEach((el) => {
    for (const attr of ['fill', 'stroke'] as const) {
      if (el.getAttribute(attr) === 'currentColor') el.setAttribute(attr, INK)
    }
  })
  // Charts render on white in the file whatever theme the reader had on screen.
  clone.style.fontFamily = 'Segoe UI, Helvetica, Arial, sans-serif'
  clone.style.background = '#ffffff'

  const xml = new XMLSerializer().serializeToString(clone)
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`

  const img = new Image()
  const loaded = new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
  })
  img.src = src
  if (!(await loaded)) return null

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  return { title: '', dataUrl: canvas.toDataURL('image/png'), width, height }
}

/** Every chart inside `root`, titled by the heading of the card it sits in. */
export async function captureCharts(root: HTMLElement): Promise<CapturedChart[]> {
  const svgs = Array.from(root.querySelectorAll<SVGSVGElement>('svg.recharts-surface'))
  const out: CapturedChart[] = []

  for (const svg of svgs) {
    const shot = await svgToPng(svg)
    if (!shot) continue
    const card = svg.closest('section, .surface')
    const heading = card?.querySelector('h2, h3')?.textContent?.trim()
    out.push({ ...shot, title: heading || 'Chart' })
  }
  return out
}

/** Shape the report needs from the caller, kept loose so the page owns the types. */
export interface ExportYear {
  year: number
  verdictLabel: string
  objectiveRate: number
  summary: {
    quarters: number
    quartersClosed: number
    objectivesTotal: number
    objectivesLanded: number
    objectivesMissed: number
    keyResultsTotal: number
    keyResultsMet: number
    averageObjectiveProgress: number
    tasksTotal: number
    tasksCompleted: number
    taskCompletionRate: number
  }
  quarters: {
    name: string
    status: string
    objectivesTotal: number
    objectivesLanded: number
    progress: number
    tasksTotal: number
    tasksCompleted: number
    taskCompletionRate: number
  }[]
  shortfalls: { title: string; owner: string | null; progress: number; status: string }[]
}

function headerRow(sheet: any, values: string[], rowNumber?: number) {
  const row = rowNumber ? sheet.getRow(rowNumber) : sheet.addRow(values)
  if (rowNumber) row.values = values
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  row.alignment = { vertical: 'middle' }
  row.height = 20
  return row
}

function titleRow(sheet: any, text: string) {
  const row = sheet.addRow([text])
  row.font = { bold: true, size: 13 }
  row.height = 22
  return row
}

export async function exportYearReport(
  years: ExportYear[],
  charts: CapturedChart[],
  companyName: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Aura Operations'
  workbook.created = new Date()

  const label = years.map((y) => y.year).join(', ')

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet('Summary')
  summary.columns = [
    { width: 10 }, { width: 20 }, { width: 13 }, { width: 10 }, { width: 10 },
    { width: 15 }, { width: 16 }, { width: 15 }, { width: 14 }, { width: 12 },
    { width: 16 }, { width: 17 },
  ]

  titleRow(summary, `${companyName} - strategy report`)
  const sub = summary.addRow([years.length > 1 ? `Years ${label}` : `Year ${label}`])
  sub.font = { color: { argb: 'FF64748B' }, size: 11 }
  const when = summary.addRow([`Generated ${new Date().toLocaleString()}`])
  when.font = { color: { argb: 'FF64748B' }, size: 10 }
  summary.addRow([])

  headerRow(summary, [
    'Year', 'Verdict', 'Objectives', 'Landed', 'Missed', 'Objectives met %',
    'Key results met', 'Key results set', 'Avg progress %', 'Tasks', 'Tasks completed',
    'Task completion %',
  ])

  years.forEach((y, i) => {
    const row = summary.addRow([
      y.year, y.verdictLabel, y.summary.objectivesTotal, y.summary.objectivesLanded,
      y.summary.objectivesMissed, y.objectiveRate, y.summary.keyResultsMet,
      y.summary.keyResultsTotal, y.summary.averageObjectiveProgress, y.summary.tasksTotal,
      y.summary.tasksCompleted, y.summary.taskCompletionRate,
    ])
    // Banding, so a wide row stays readable across twelve columns.
    if (i % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } }
    }
  })
  summary.views = [{ state: 'frozen', ySplit: 5 }]

  // ── Charts ────────────────────────────────────────────────────────────────
  if (charts.length > 0) {
    const sheet = workbook.addWorksheet('Charts')
    sheet.getColumn(1).width = 4
    titleRow(sheet, `Charts - ${label}`)

    // Images float above the grid rather than sitting in cells, so rows are advanced
    // by the height each picture will occupy instead of by one.
    let row = 3
    for (const chart of charts) {
      const caption = sheet.getRow(row)
      caption.values = ['', chart.title]
      caption.font = { bold: true, size: 12 }
      row += 1

      const id = workbook.addImage({ base64: chart.dataUrl, extension: 'png' })
      sheet.addImage(id, {
        tl: { col: 1, row },
        ext: { width: chart.width, height: chart.height },
      })
      // Excel rows are roughly 20px tall at the default height.
      row += Math.ceil(chart.height / 20) + 2
    }
  }

  // ── One sheet per year ────────────────────────────────────────────────────
  for (const y of years) {
    const sheet = workbook.addWorksheet(String(y.year))
    sheet.columns = [
      { width: 34 }, { width: 14 }, { width: 13 }, { width: 10 },
      { width: 13 }, { width: 10 }, { width: 12 }, { width: 18 },
    ]

    titleRow(sheet, `${y.year} - ${y.verdictLabel}`)
    const line = sheet.addRow([
      `${y.summary.objectivesLanded} of ${y.summary.objectivesTotal} objectives landed (${y.objectiveRate}%). ` +
        `${y.summary.quartersClosed} of ${y.summary.quarters} quarters closed.`,
    ])
    line.font = { color: { argb: 'FF64748B' } }
    sheet.addRow([])

    titleRow(sheet, 'Quarters')
    headerRow(sheet, [
      'Quarter', 'Status', 'Objectives', 'Landed', 'Progress %', 'Tasks',
      'Completed', 'Task completion %',
    ])
    if (y.quarters.length === 0) {
      sheet.addRow(['No quarters in this year'])
    } else {
      for (const q of y.quarters) {
        sheet.addRow([
          q.name, q.status, q.objectivesTotal, q.objectivesLanded, q.progress,
          q.tasksTotal, q.tasksCompleted, q.taskCompletionRate,
        ])
      }
    }

    sheet.addRow([])
    titleRow(sheet, 'Where the year fell short')
    headerRow(sheet, ['Objective', 'Owner', 'Progress %', 'Status'])
    if (y.shortfalls.length === 0) {
      // Stated rather than left blank: an empty table reads as missing data.
      sheet.addRow(['Every objective landed. Nothing fell short.'])
    } else {
      for (const s of y.shortfalls) {
        sheet.addRow([s.title, s.owner ?? 'Unassigned', s.progress, s.status])
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `aura-strategy-report-${years.map((y) => y.year).join('-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
