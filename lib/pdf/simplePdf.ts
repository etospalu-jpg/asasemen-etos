type PdfColor = [number, number, number]

type TextOptions = {
  size?: number
  bold?: boolean
  color?: PdfColor
  indent?: number
  width?: number
  lineHeight?: number
  gapAfter?: number
}

type BadgeOptions = {
  fill?: PdfColor
  textColor?: PdfColor
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 44
const TOP_Y = 785
const BOTTOM_Y = 54
const DEFAULT_COLOR: PdfColor = [0.12, 0.23, 0.18]
const MUTED_COLOR: PdfColor = [0.39, 0.48, 0.44]

function channel(value: number) {
  return Math.max(0, Math.min(1, value)).toFixed(3)
}

function escapePdfText(input: string) {
  return input.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function pdfSafeText(input: unknown) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, '*')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\n]/g, '?')
}

function approximateWidth(text: string, size: number, bold = false) {
  let units = 0
  for (const char of text) {
    if ('ilI.,:;!|'.includes(char)) units += 0.26
    else if ('MW@#%&'.includes(char)) units += 0.82
    else if (char === ' ') units += 0.28
    else units += 0.51
  }
  return units * size * (bold ? 1.025 : 1)
}

function wrapLine(text: string, maxWidth: number, size: number, bold: boolean) {
  const clean = pdfSafeText(text).trim()
  if (!clean) return ['']

  const words = clean.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (approximateWidth(candidate, size, bold) <= maxWidth) {
      current = candidate
      continue
    }

    if (current) lines.push(current)

    if (approximateWidth(word, size, bold) <= maxWidth) {
      current = word
      continue
    }

    let fragment = ''
    for (const char of word) {
      const next = fragment + char
      if (fragment && approximateWidth(next, size, bold) > maxWidth) {
        lines.push(fragment)
        fragment = char
      } else {
        fragment = next
      }
    }
    current = fragment
  }

  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

export class SimplePdfDocument {
  private pages: string[][] = []
  private y = TOP_Y
  private headerLabel: string
  private footerLabel: string

  constructor(options?: { headerLabel?: string; footerLabel?: string }) {
    this.headerLabel = pdfSafeText(options?.headerLabel || 'ETOS Assessment Center')
    this.footerLabel = pdfSafeText(options?.footerLabel || 'Dokumen Internal ETOS')
    this.addPage()
  }

  private currentPage() {
    return this.pages[this.pages.length - 1]
  }

  private push(operation: string) {
    this.currentPage().push(operation)
  }

  private drawTextAt(text: string, x: number, y: number, size: number, bold: boolean, color: PdfColor) {
    const font = bold ? 'F2' : 'F1'
    const safe = escapePdfText(pdfSafeText(text))
    this.push(
      `BT /${font} ${size.toFixed(2)} Tf ${channel(color[0])} ${channel(color[1])} ${channel(color[2])} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${safe}) Tj ET`,
    )
  }

  private addPage() {
    this.pages.push([])
    this.y = TOP_Y
    this.drawTextAt(this.headerLabel, MARGIN_X, 812, 8.2, true, [0.09, 0.37, 0.25])
    this.drawTextAt('Awardee Development Assessment', PAGE_WIDTH - MARGIN_X - 145, 812, 7.3, false, MUTED_COLOR)
    this.push(`0.86 0.90 0.88 RG 0.55 w ${MARGIN_X} 802 m ${PAGE_WIDTH - MARGIN_X} 802 l S`)
  }

  private ensureSpace(requiredHeight: number) {
    if (this.y - requiredHeight < BOTTOM_Y) this.addPage()
  }

  spacer(height = 8) {
    this.ensureSpace(height)
    this.y -= height
  }

  rule(gapBefore = 4, gapAfter = 10) {
    this.spacer(gapBefore)
    this.ensureSpace(gapAfter + 2)
    this.push(`0.87 0.91 0.89 RG 0.55 w ${MARGIN_X} ${this.y.toFixed(2)} m ${PAGE_WIDTH - MARGIN_X} ${this.y.toFixed(2)} l S`)
    this.y -= gapAfter
  }

  text(value: string, options: TextOptions = {}) {
    const size = options.size ?? 9.5
    const bold = options.bold ?? false
    const color = options.color ?? DEFAULT_COLOR
    const indent = options.indent ?? 0
    const width = options.width ?? PAGE_WIDTH - MARGIN_X * 2 - indent
    const lineHeight = options.lineHeight ?? size * 1.38
    const gapAfter = options.gapAfter ?? 3
    const paragraphs = pdfSafeText(value).split('\n')
    const lines = paragraphs.flatMap((paragraph, index) => {
      const wrapped = wrapLine(paragraph, width, size, bold)
      return index < paragraphs.length - 1 ? [...wrapped, ''] : wrapped
    })

    this.ensureSpace(lines.length * lineHeight + gapAfter)
    for (const line of lines) {
      if (this.y - lineHeight < BOTTOM_Y) this.addPage()
      if (line) this.drawTextAt(line, MARGIN_X + indent, this.y, size, bold, color)
      this.y -= lineHeight
    }
    this.y -= gapAfter
  }

  title(value: string) {
    this.text(value, { size: 20, bold: true, color: [0.08, 0.28, 0.19], lineHeight: 25, gapAfter: 6 })
  }

  subtitle(value: string) {
    this.text(value, { size: 10.2, color: MUTED_COLOR, lineHeight: 14, gapAfter: 8 })
  }

  section(value: string) {
    this.ensureSpace(32)
    this.spacer(5)
    this.text(value.toUpperCase(), { size: 11.2, bold: true, color: [0.08, 0.34, 0.22], lineHeight: 15, gapAfter: 7 })
  }

  badge(value: string, options: BadgeOptions = {}) {
    const size = 8.2
    const textValue = pdfSafeText(value)
    const width = Math.min(PAGE_WIDTH - MARGIN_X * 2, approximateWidth(textValue, size, true) + 22)
    const height = 20
    this.ensureSpace(height + 8)
    const fill = options.fill ?? [0.98, 0.94, 0.82]
    const textColor = options.textColor ?? [0.55, 0.37, 0.07]
    this.push(`q ${channel(fill[0])} ${channel(fill[1])} ${channel(fill[2])} rg ${MARGIN_X} ${(this.y - 4).toFixed(2)} ${width.toFixed(2)} ${height} re f Q`)
    this.drawTextAt(textValue, MARGIN_X + 10, this.y + 2, size, true, textColor)
    this.y -= height + 8
  }

  keyValue(label: string, value: string) {
    this.ensureSpace(18)
    this.drawTextAt(pdfSafeText(label).toUpperCase(), MARGIN_X, this.y, 7.2, true, MUTED_COLOR)
    this.drawTextAt(pdfSafeText(value), MARGIN_X + 118, this.y, 9, true, DEFAULT_COLOR)
    this.y -= 16
  }

  answer(code: string, question: string, state: 'selected' | 'not_selected' | 'unanswered') {
    const stateLabel = state === 'selected' ? '[X] Dipilih' : state === 'not_selected' ? '[ ] Tidak dipilih' : '[-] Belum dijawab'
    const color: PdfColor = state === 'selected' ? [0.10, 0.43, 0.28] : state === 'unanswered' ? [0.58, 0.40, 0.12] : MUTED_COLOR
    const questionWidth = PAGE_WIDTH - MARGIN_X * 2 - 138
    const lines = wrapLine(question, questionWidth, 8.4, false)
    const rowHeight = Math.max(18, lines.length * 11 + 6)
    this.ensureSpace(rowHeight + 2)

    this.drawTextAt(code, MARGIN_X, this.y, 7.4, true, [0.43, 0.53, 0.48])
    this.drawTextAt(stateLabel, PAGE_WIDTH - MARGIN_X - 92, this.y, 7.5, true, color)
    for (let index = 0; index < lines.length; index += 1) {
      this.drawTextAt(lines[index], MARGIN_X + 38, this.y - index * 11, 8.4, false, DEFAULT_COLOR)
    }
    this.y -= rowHeight
    this.push(`0.92 0.94 0.93 RG 0.35 w ${MARGIN_X} ${this.y.toFixed(2)} m ${PAGE_WIDTH - MARGIN_X} ${this.y.toFixed(2)} l S`)
    this.y -= 4
  }

  metric(label: string, value: string, note?: string) {
    this.ensureSpace(note ? 46 : 34)
    this.text(`${label}: ${value}`, { size: 10, bold: true, color: [0.08, 0.34, 0.22], lineHeight: 14, gapAfter: note ? 1 : 5 })
    if (note) this.text(note, { size: 8.2, color: MUTED_COLOR, lineHeight: 11, gapAfter: 5, indent: 12 })
  }

  build() {
    const pageCount = this.pages.length
    const regularFontRef = 3
    const boldFontRef = 4
    const firstPageRef = 5

    for (let index = 0; index < pageCount; index += 1) {
      const page = this.pages[index]
      const pageNumber = index + 1
      const footerY = 27
      const footerText = `${this.footerLabel} | Halaman ${pageNumber} dari ${pageCount}`
      const safeFooter = escapePdfText(pdfSafeText(footerText))
      page.push(`BT /F1 7.2 Tf 0.46 0.53 0.49 rg 1 0 0 1 ${MARGIN_X} ${footerY} Tm (${safeFooter}) Tj ET`)
    }

    const objects: string[] = []
    const kids = this.pages.map((_, index) => `${firstPageRef + index * 2} 0 R`).join(' ')
    objects.push('<< /Type /Catalog /Pages 2 0 R >>')
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`)
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

    for (let index = 0; index < pageCount; index += 1) {
      const pageRef = firstPageRef + index * 2
      const contentRef = pageRef + 1
      const stream = `${this.pages[index].join('\n')}\n`
      const streamLength = Buffer.byteLength(stream, 'latin1')
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontRef} 0 R /F2 ${boldFontRef} 0 R >> >> /Contents ${contentRef} 0 R >>`,
      )
      objects.push(`<< /Length ${streamLength} >>\nstream\n${stream}endstream`)
    }

    const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'latin1')]
    const offsets: number[] = [0]
    let length = chunks[0].length

    objects.forEach((object, index) => {
      offsets.push(length)
      const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'latin1')
      chunks.push(chunk)
      length += chunk.length
    })

    const xrefOffset = length
    const xrefLines = offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    const trailer = [
      `xref`,
      `0 ${objects.length + 1}`,
      '0000000000 65535 f ',
      ...xrefLines,
      'trailer',
      `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
      'startxref',
      String(xrefOffset),
      '%%EOF',
      '',
    ].join('\n')
    chunks.push(Buffer.from(trailer, 'latin1'))
    return Buffer.concat(chunks)
  }
}
