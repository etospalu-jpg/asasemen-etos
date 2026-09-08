import { NextRequest } from 'next/server'

import { SimplePdfDocument, pdfSafeText } from '@/lib/pdf/simplePdf'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }
type ExportKind = 'raw' | 'full'
type SessionRow = { id: string; module_id: string; status: string; completed_at: string | null; last_saved_at: string | null }
type AnswerRow = { session_id: string; question_id: string; selected: boolean }
type ResultRow = { module_id: string | null; result_json: unknown; engine_version: string; generated_at: string }
type SignalRow = { signal_code: string; signal_level: string; status: string }
type AnalysisObject = Record<string, unknown>
type DimensionRow = { code?: string; name?: string; percent?: number; selected?: number; items?: number; level?: string }

type ModuleRow = {
  id: string
  code: string
  title: string
  subtitle: string | null
  restricted: boolean
  sort_order: number
}

type QuestionRow = {
  id: string
  module_id: string
  code: string
  question_text: string
  sort_order: number
}

function asObject(value: unknown): AnalysisObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnalysisObject) : {}
}

function asArray<T = AnalysisObject>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function stringValue(value: unknown, fallback = '-') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function numericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return 0
}

function formatTimestamp(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function safeFilename(value: string) {
  return pdfSafeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'awardee'
}

function addDocumentIdentity(
  pdf: SimplePdfDocument,
  kind: ExportKind,
  awardee: { full_name: string; awardee_code: string; campus: string | null; major: string | null; cohort: number | null },
  period: { name: string; year: number; semester: number },
  generatedAt: Date,
  includesPrivate: boolean,
) {
  if (includesPrivate) {
    pdf.badge('RAHASIA - UNTUK PENDAMPINGAN INTERNAL ETOS')
  } else {
    pdf.badge('DOKUMEN INTERNAL ETOS', { fill: [0.91, 0.96, 0.93], textColor: [0.08, 0.34, 0.22] })
  }

  pdf.title(kind === 'raw' ? 'JAWABAN MENTAH ASESMEN' : 'LAPORAN ASESMEN LENGKAP')
  pdf.subtitle(
    kind === 'raw'
      ? 'Rekaman seluruh pernyataan dan status jawaban awardee.'
      : 'Executive Development Profile, analisis rules-v1.0, rekomendasi, dan audit jawaban mentah.',
  )
  pdf.keyValue('Nama Awardee', awardee.full_name)
  pdf.keyValue('Kode Awardee', awardee.awardee_code)
  pdf.keyValue('Kampus', awardee.campus || 'Belum diisi')
  pdf.keyValue('Jurusan', awardee.major || 'Belum diisi')
  pdf.keyValue('Angkatan', awardee.cohort ? String(awardee.cohort) : '-')
  pdf.keyValue('Periode', `${period.name} (${period.year} / Semester ${period.semester})`)
  pdf.keyValue('Dibuat', `${formatTimestamp(generatedAt)} WITA`)
  pdf.rule()
}

function addOverallAnalysis(pdf: SimplePdfDocument, overallResult?: ResultRow) {
  pdf.section('Executive Development Profile')
  if (!overallResult) {
    pdf.text('Profil eksekutif belum tersedia. Profil akan terbentuk setelah ketiga modul selesai.', {
      color: [0.45, 0.51, 0.48],
      gapAfter: 8,
    })
    return
  }

  const overall = asObject(overallResult.result_json)
  const riasec = stringValue(overall.riasec_code)
  const clarity = numericValue(overall.career_clarity_percent)
  const exploration = numericValue(overall.career_exploration_percent)
  pdf.metric('RIASEC Utama', riasec, 'Tiga kecenderungan minat teratas berdasarkan pernyataan yang dipilih.')
  pdf.metric('Career Clarity', `${clarity}%`, 'Persentase pernyataan Career Clarity yang di-endorse.')
  pdf.metric('Career Exploration', `${exploration}%`, 'Persentase pernyataan Career Exploration yang di-endorse.')

  const patterns = asArray<DimensionRow>(overall.top_endorsed_patterns)
  if (patterns.length) {
    pdf.text('Pola yang paling menonjol', { size: 10, bold: true, gapAfter: 5 })
    patterns.forEach((pattern, index) => {
      pdf.text(
        `${index + 1}. ${stringValue(pattern.code)} - ${stringValue(pattern.name)}: ${numericValue(pattern.percent)}% (${numericValue(pattern.selected)}/${numericValue(pattern.items)} dipilih)`,
        { size: 8.7, indent: 8, lineHeight: 12, gapAfter: 1 },
      )
    })
    pdf.spacer(5)
  }

  const recommendations = asArray<string>(overall.recommendations)
  if (recommendations.length) {
    pdf.text('Rekomendasi pengembangan', { size: 10, bold: true, gapAfter: 5 })
    recommendations.forEach((recommendation, index) => {
      pdf.text(`${index + 1}. ${recommendation}`, { size: 8.7, indent: 8, lineHeight: 12, gapAfter: 2 })
    })
  }

  pdf.text('Catatan: hasil ini adalah bahan refleksi dan pendampingan perkembangan, bukan diagnosis psikologis atau label tetap.', {
    size: 8,
    color: [0.45, 0.51, 0.48],
    lineHeight: 11,
    gapAfter: 7,
  })
}

function addModuleAnalysis(
  pdf: SimplePdfDocument,
  modules: ModuleRow[],
  resultByModule: Map<string, ResultRow>,
  canSeePrivate: boolean,
  signals: SignalRow[],
) {
  pdf.section('Analisis Per Modul')

  for (const module of modules) {
    pdf.text(`0${module.sort_order} - ${module.title}`, { size: 11, bold: true, gapAfter: 2 })
    if (module.subtitle) pdf.text(module.subtitle, { size: 8.3, color: [0.43, 0.51, 0.47], gapAfter: 5 })

    if (module.restricted && !canSeePrivate) {
      pdf.text('DIBATASI - Analisis private assessment tidak tersedia untuk akun ini.', {
        size: 8.7,
        bold: true,
        color: [0.58, 0.40, 0.12],
        gapAfter: 8,
      })
      continue
    }

    const result = resultByModule.get(module.id)
    if (!result) {
      pdf.text('Analisis belum tersedia karena modul belum selesai.', { size: 8.7, color: [0.45, 0.51, 0.48], gapAfter: 8 })
      continue
    }

    const analysis = asObject(result.result_json)
    if (module.code === 'MENENTUKAN_ARAH') {
      pdf.text(`RIASEC: ${stringValue(analysis.riasec_code)}`, { size: 9.3, bold: true, gapAfter: 2 })
      pdf.text(
        `Career Clarity ${numericValue(analysis.career_clarity_percent)}% | Career Exploration ${numericValue(analysis.career_exploration_percent)}%`,
        { size: 8.6, gapAfter: 5 },
      )
    }
    if (module.code === 'MEMAHAMI_DIRI') {
      pdf.text(`Support Priority: ${stringValue(analysis.support_priority, 'routine').toUpperCase()}`, {
        size: 9.3,
        bold: true,
        color: [0.56, 0.38, 0.09],
        gapAfter: 5,
      })
    }

    const dimensions = asArray<DimensionRow>(analysis.dimensions)
    dimensions.forEach((dimension) => {
      pdf.text(
        `${stringValue(dimension.code)} - ${stringValue(dimension.name)}: ${numericValue(dimension.percent)}% (${numericValue(dimension.selected)}/${numericValue(dimension.items)})`,
        { size: 8.2, indent: 8, lineHeight: 11.2, gapAfter: 1 },
      )
    })

    const recommendations = asArray<string>(analysis.recommendations)
    if (recommendations.length) {
      pdf.text('Rekomendasi:', { size: 8.5, bold: true, indent: 8, gapAfter: 2 })
      recommendations.forEach((recommendation) => {
        pdf.text(`- ${recommendation}`, { size: 8.1, indent: 14, lineHeight: 11, gapAfter: 1 })
      })
    }
    pdf.spacer(6)
  }

  if (canSeePrivate && signals.length) {
    pdf.text('Support signals aktif', { size: 10, bold: true, color: [0.56, 0.38, 0.09], gapAfter: 3 })
    pdf.text(
      signals.map((signal) => `${signal.signal_code} (${signal.signal_level})`).join(' | '),
      { size: 8.5, color: [0.56, 0.38, 0.09], gapAfter: 3 },
    )
    pdf.text('Support signal digunakan untuk prioritas check-in internal dan bukan diagnosis kesehatan mental.', {
      size: 7.8,
      color: [0.45, 0.51, 0.48],
      gapAfter: 8,
    })
  }
}

function addRawAnswers(
  pdf: SimplePdfDocument,
  modules: ModuleRow[],
  questions: QuestionRow[],
  sessionByModule: Map<string, SessionRow>,
  answerMap: Map<string, boolean>,
  canSeePrivate: boolean,
) {
  pdf.section('Jawaban Detail')

  for (const module of modules) {
    const session = sessionByModule.get(module.id)
    const status = session?.status === 'completed' ? 'SELESAI' : session?.status === 'in_progress' ? 'SEDANG DIISI' : 'BELUM DIMULAI'
    pdf.text(`0${module.sort_order} - ${module.title} | ${status}`, { size: 11, bold: true, gapAfter: 2 })
    if (module.subtitle) pdf.text(module.subtitle, { size: 8.2, color: [0.43, 0.51, 0.47], gapAfter: 5 })

    if (module.restricted && !canSeePrivate) {
      pdf.text('DIBATASI - Jawaban modul private assessment tidak dapat diekspor oleh akun ini.', {
        size: 8.7,
        bold: true,
        color: [0.58, 0.40, 0.12],
        gapAfter: 9,
      })
      continue
    }

    const moduleQuestions = questions.filter((question) => question.module_id === module.id)
    for (const question of moduleQuestions) {
      const answerKey = session ? `${session.id}:${question.id}` : ''
      const hasAnswer = Boolean(session) && answerMap.has(answerKey)
      const selected = hasAnswer ? answerMap.get(answerKey) === true : false
      pdf.answer(question.code, question.question_text, !hasAnswer ? 'unanswered' : selected ? 'selected' : 'not_selected')
    }
    pdf.spacer(7)
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const kind: ExportKind = request.nextUrl.searchParams.get('type') === 'full' ? 'full' : 'raw'
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) return new Response('Unauthorized', { status: 401 })

  const [{ data: profile }, { data: awardee }, { data: period }, { data: modules }] = await Promise.all([
    supabase.from('profiles').select('role, can_view_private, can_export').eq('id', userId).maybeSingle(),
    supabase.from('awardees').select('id, full_name, awardee_code, campus, major, cohort').eq('id', id).maybeSingle(),
    supabase.from('assessment_periods').select('id, name, year, semester').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('assessment_modules').select('id, code, title, subtitle, restricted, sort_order').eq('active', true).order('sort_order'),
  ])

  if (!awardee) return new Response('Awardee not found or inaccessible', { status: 404 })
  if (!period) return new Response('No active assessment period', { status: 409 })

  const canExport = profile?.role === 'superadmin' || Boolean(profile?.can_export)
  const canSeePrivate = profile?.role === 'superadmin' || Boolean(profile?.can_view_private)
  if (!canExport) return new Response('Export permission required', { status: 403 })

  const moduleRows = (modules ?? []) as ModuleRow[]
  const { data: sessions } = await supabase
    .from('assessment_sessions')
    .select('id, module_id, status, completed_at, last_saved_at')
    .eq('awardee_id', awardee.id)
    .eq('period_id', period.id)

  const sessionRows = (sessions ?? []) as SessionRow[]
  const sessionIds = sessionRows.map((session) => session.id)
  const sessionByModule = new Map(sessionRows.map((session) => [session.module_id, session]))

  const [{ data: questions }, { data: answers }, { data: results }, { data: signals }] = await Promise.all([
    supabase
      .from('assessment_questions')
      .select('id, module_id, code, question_text, sort_order')
      .eq('active', true)
      .order('sort_order'),
    sessionIds.length
      ? supabase.from('assessment_answers').select('session_id, question_id, selected').in('session_id', sessionIds)
      : Promise.resolve({ data: [] as AnswerRow[] }),
    kind === 'full'
      ? supabase
          .from('assessment_results')
          .select('module_id, result_json, engine_version, generated_at')
          .eq('awardee_id', awardee.id)
          .eq('period_id', period.id)
          .eq('engine_version', 'rules-v1.0')
          .order('generated_at', { ascending: false })
      : Promise.resolve({ data: [] as ResultRow[] }),
    kind === 'full' && canSeePrivate
      ? supabase
          .from('assessment_signals')
          .select('signal_code, signal_level, status')
          .eq('awardee_id', awardee.id)
          .eq('period_id', period.id)
          .eq('source', 'engine:rules-v1.0')
          .eq('status', 'open')
      : Promise.resolve({ data: [] as SignalRow[] }),
  ])

  const answerMap = new Map<string, boolean>()
  for (const answer of (answers ?? []) as AnswerRow[]) answerMap.set(`${answer.session_id}:${answer.question_id}`, answer.selected)

  const resultByModule = new Map<string, ResultRow>()
  let overallResult: ResultRow | undefined
  for (const result of (results ?? []) as ResultRow[]) {
    if (result.module_id && !resultByModule.has(result.module_id)) resultByModule.set(result.module_id, result)
    if (!result.module_id && !overallResult) overallResult = result
  }

  const generatedAt = new Date()
  const includesPrivate = canSeePrivate && moduleRows.some((module) => module.restricted)
  const pdf = new SimplePdfDocument({
    headerLabel: 'ETOS Assessment Center',
    footerLabel: includesPrivate ? 'RAHASIA - Untuk Pendampingan Internal ETOS' : 'Dokumen Internal ETOS',
  })

  addDocumentIdentity(pdf, kind, awardee, period, generatedAt, includesPrivate)
  if (kind === 'full') {
    addOverallAnalysis(pdf, overallResult)
    addModuleAnalysis(pdf, moduleRows, resultByModule, canSeePrivate, (signals ?? []) as SignalRow[])
    pdf.rule()
  }
  addRawAnswers(pdf, moduleRows, (questions ?? []) as QuestionRow[], sessionByModule, answerMap, canSeePrivate)

  const pdfBuffer = pdf.build()
  const documentType = kind === 'full' ? 'comprehensive_report' : 'raw_answers'
  const { error: auditError } = await supabase.rpc('record_assessment_export', {
    p_awardee_id: awardee.id,
    p_period_id: period.id,
    p_document_type: documentType,
  })

  if (auditError) {
    console.error('Failed to record PDF export', auditError)
    return new Response('Unable to record export audit', { status: 500 })
  }

  const prefix = kind === 'full' ? 'ETOS_Laporan_Asesmen' : 'ETOS_Jawaban_Mentah'
  const filename = `${prefix}_${safeFilename(awardee.full_name)}.pdf`

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
