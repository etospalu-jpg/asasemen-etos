import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type PageProps = { params: Promise<{ id: string }> }
type SessionRow = { id: string; module_id: string; status: string; completed_at: string | null; last_saved_at: string | null }
type AnswerRow = { session_id: string; question_id: string; selected: boolean }
type ResultRow = { module_id: string | null; result_json: unknown; engine_version: string; generated_at: string }
type SignalRow = { signal_code: string; signal_level: string; status: string }
type AnalysisObject = Record<string, unknown>
type DimensionRow = { code?: string; name?: string; percent?: number; selected?: number; items?: number; direction?: string; level?: string }

function asObject(value: unknown): AnalysisObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnalysisObject : {}
}

function asArray<T = AnalysisObject>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function text(value: unknown, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : typeof value === 'string' && value !== '' ? Number(value) : 0
}

export default async function AwardeeDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: awardee }, { data: period }, { data: modules }] = await Promise.all([
    supabase.from('profiles').select('role, can_view_private, can_export').eq('id', userId).maybeSingle(),
    supabase.from('awardees').select('id, full_name, campus, major, cohort, awardee_code').eq('id', id).maybeSingle(),
    supabase.from('assessment_periods').select('id, name, year, semester').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('assessment_modules').select('id, code, title, subtitle, restricted, sort_order').eq('active', true).order('sort_order'),
  ])

  if (!awardee) notFound()

  const canSeePrivate = profile?.role === 'superadmin' || Boolean(profile?.can_view_private)
  const moduleRows = modules ?? []

  const { data: sessions } = period
    ? await supabase
        .from('assessment_sessions')
        .select('id, module_id, status, completed_at, last_saved_at')
        .eq('awardee_id', awardee.id)
        .eq('period_id', period.id)
    : { data: [] as SessionRow[] }

  const sessionRows = (sessions ?? []) as SessionRow[]
  const sessionByModule = new Map(sessionRows.map((session) => [session.module_id, session]))
  const sessionIds = sessionRows.map((session) => session.id)

  const [{ data: questions }, { data: answers }, { data: results }, { data: signals }] = await Promise.all([
    supabase
      .from('assessment_questions')
      .select('id, module_id, code, question_text, sort_order')
      .eq('active', true)
      .order('sort_order'),
    sessionIds.length
      ? supabase
          .from('assessment_answers')
          .select('session_id, question_id, selected')
          .in('session_id', sessionIds)
      : Promise.resolve({ data: [] as AnswerRow[] }),
    period
      ? supabase
          .from('assessment_results')
          .select('module_id, result_json, engine_version, generated_at')
          .eq('awardee_id', awardee.id)
          .eq('period_id', period.id)
          .eq('engine_version', 'rules-v1.0')
          .order('generated_at', { ascending: false })
      : Promise.resolve({ data: [] as ResultRow[] }),
    period && canSeePrivate
      ? supabase
          .from('assessment_signals')
          .select('signal_code, signal_level, status')
          .eq('awardee_id', awardee.id)
          .eq('period_id', period.id)
          .eq('source', 'engine:rules-v1.0')
      : Promise.resolve({ data: [] as SignalRow[] }),
  ])

  const answerMap = new Map<string, boolean>()
  for (const answer of (answers ?? []) as AnswerRow[]) {
    answerMap.set(`${answer.session_id}:${answer.question_id}`, answer.selected)
  }

  const resultRows = (results ?? []) as ResultRow[]
  const resultByModule = new Map<string, ResultRow>()
  let overallResult: ResultRow | undefined
  for (const result of resultRows) {
    if (result.module_id) {
      if (!resultByModule.has(result.module_id)) resultByModule.set(result.module_id, result)
    } else if (!overallResult) {
      overallResult = result
    }
  }

  const overall = asObject(overallResult?.result_json)
  const overallPatterns = asArray<DimensionRow>(overall.top_endorsed_patterns)
  const overallRiasec = asArray<AnalysisObject>(overall.riasec_top3)
  const overallRecommendations = asArray<string>(overall.recommendations)
  const completedModules = sessionRows.filter((session) => session.status === 'completed').length
  const percent = moduleRows.length ? Math.round((completedModules / moduleRows.length) * 100) : 0

  return (
    <main className="fac-shell">
      <header className="fac-topbar">
        <div className="fac-brand">
          <div className="fac-brand-mark">E</div>
          <div><strong>ETOS Assessment Center</strong><small>Assessment Profile & Raw Answers</small></div>
        </div>
        <div className="fac-actions">
          <Link className="fac-link" href="/dashboard">Overview</Link>
          <form action="/auth/signout" method="post"><button className="fac-button" type="submit">Keluar</button></form>
        </div>
      </header>

      <section className="fac-detail-head">
        <div>
          <Link className="fac-back" href="/dashboard">← Kembali ke daftar awardee</Link>
          <h1>{awardee.full_name}</h1>
          <p>{awardee.campus || 'Kampus belum diisi'} · {awardee.major || 'Jurusan belum diisi'} · Awardee {awardee.cohort ?? '—'}</p>
        </div>
        <div className="fac-period">
          <span>Assessment Progress</span>
          <strong>{completedModules} / {moduleRows.length}</strong>
          <div className="fac-progress-track" style={{ width: '100%', marginTop: 10 }}><span style={{ width: `${percent}%` }} /></div>
          <small style={{ marginTop: 7 }}>{percent}% selesai</small>
        </div>
      </section>

      <section className="fac-analysis-panel">
        <div className="fac-panel-head">
          <div><span className="fac-kicker">Rules v1.0</span><h2>Analisis & Rekomendasi</h2></div>
          <p>Development profile · bukan diagnosis psikologis</p>
        </div>

        {overallResult ? (
          <>
            <div className="fac-analysis-metrics">
              <article><span>RIASEC Utama</span><strong>{text(overall.riasec_code)}</strong><small>{overallRiasec.map((item) => text(item.name, text(item.code))).join(' · ')}</small></article>
              <article><span>Career Clarity</span><strong>{numberValue(overall.career_clarity_percent)}%</strong><small>tingkat pernyataan clarity yang dipilih</small></article>
              <article><span>Career Exploration</span><strong>{numberValue(overall.career_exploration_percent)}%</strong><small>tingkat eksplorasi yang di-endorse</small></article>
              <article><span>Assessment</span><strong>3 / 3</strong><small>Executive Development Profile tersedia</small></article>
            </div>

            <div className="fac-analysis-grid">
              <article className="fac-insight-card">
                <h3>Pola yang paling menonjol</h3>
                <div className="fac-pattern-list">
                  {overallPatterns.map((item) => (
                    <div className="fac-pattern" key={item.code}>
                      <div><strong>{item.code} · {item.name}</strong><span>{item.selected}/{item.items} dipilih</span></div>
                      <div className="fac-score-track"><span style={{ width: `${Math.max(0, Math.min(100, numberValue(item.percent)))}%` }} /></div>
                      <b>{numberValue(item.percent)}%</b>
                    </div>
                  ))}
                  {overallPatterns.length === 0 && <div className="fac-empty compact">Belum ada pola yang dapat diringkas.</div>}
                </div>
              </article>

              <article className="fac-insight-card">
                <h3>Rekomendasi pengembangan</h3>
                <div className="fac-recommendations">
                  {overallRecommendations.map((recommendation, index) => (
                    <div key={`${index}-${recommendation}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{recommendation}</p></div>
                  ))}
                </div>
                <small className="fac-method-note">Interpretasi berbasis checkbox endorsement. Gunakan sebagai hipotesis percakapan fasilitator, bukan label tetap.</small>
              </article>
            </div>
          </>
        ) : (
          <div className="fac-empty">Executive Development Profile akan muncul setelah ketiga modul selesai.</div>
        )}

        <div className="fac-module-analysis-grid">
          {moduleRows.map((module) => {
            const restricted = module.restricted && !canSeePrivate
            const analysis = asObject(resultByModule.get(module.id)?.result_json)
            const dimensions = asArray<DimensionRow>(analysis.dimensions)
            const recommendations = asArray<string>(analysis.recommendations)
            const supportSignals = asArray<AnalysisObject>(analysis.support_signals)
            return (
              <article className="fac-module-analysis" key={`analysis-${module.id}`}>
                <div className="fac-module-analysis-head">
                  <div><small>0{module.sort_order}</small><h3>{module.title}</h3></div>
                  {module.restricted && <span className="fac-private">PRIVATE</span>}
                </div>
                {restricted ? (
                  <p className="fac-restricted-note">Analisis modul privat memerlukan permission <strong>Private Assessment</strong>.</p>
                ) : resultByModule.get(module.id) ? (
                  <>
                    {module.code === 'MENENTUKAN_ARAH' && <div className="fac-inline-highlight"><span>RIASEC</span><strong>{text(analysis.riasec_code)}</strong></div>}
                    {module.code === 'MEMAHAMI_DIRI' && <div className="fac-inline-highlight private"><span>Support Priority</span><strong>{text(analysis.support_priority, 'routine')}</strong></div>}
                    <div className="fac-dimension-chips">
                      {dimensions.slice(0, 8).map((dimension) => <span key={dimension.code}>{dimension.code} · {numberValue(dimension.percent)}%</span>)}
                    </div>
                    {supportSignals.length > 0 && <div className="fac-signal-list">{supportSignals.map((signal) => <span key={text(signal.code)}>{text(signal.code)} · {text(signal.label)}</span>)}</div>}
                    {recommendations.length > 0 && <ul className="fac-mini-recs">{recommendations.map((item) => <li key={item}>{item}</li>)}</ul>}
                  </>
                ) : (
                  <p className="fac-analysis-empty">Analisis muncul setelah modul ini selesai.</p>
                )}
              </article>
            )
          })}
        </div>

        {canSeePrivate && (signals ?? []).length > 0 && (
          <div className="fac-support-strip">
            <div><strong>Support signals aktif</strong><small>Untuk pendampingan internal. Bukan diagnosis kesehatan mental.</small></div>
            <div>{(signals as SignalRow[]).map((signal) => <span key={signal.signal_code}>{signal.signal_code} · {signal.signal_level}</span>)}</div>
          </div>
        )}
      </section>

      <section className="fac-detail-grid">
        <aside className="fac-profile-card">
          <h3>Profil Assessment</h3>
          <div className="fac-profile-row"><span>Kode Awardee</span><strong>{awardee.awardee_code}</strong></div>
          <div className="fac-profile-row"><span>Periode</span><strong>{period?.name ?? 'Belum ada periode aktif'}</strong></div>
          <div className="fac-profile-row"><span>Angkatan</span><strong>{awardee.cohort ?? '—'}</strong></div>
          <div className="fac-profile-row"><span>Private Access</span><strong>{canSeePrivate ? 'Diizinkan' : 'Dibatasi'}</strong></div>
          <div className="fac-profile-row"><span>PDF Export</span><strong>{profile?.can_export || profile?.role === 'superadmin' ? 'Diizinkan' : 'Dibatasi'}</strong></div>
        </aside>

        <div className="fac-answer-panel">
          <div className="fac-panel-head raw"><div><span className="fac-kicker">Audit View</span><h2>Jawaban Detail</h2></div><p>Dipilih · tidak dipilih · belum dijawab</p></div>
          {moduleRows.map((module) => {
            const session = sessionByModule.get(module.id)
            const moduleQuestions = (questions ?? []).filter((question) => question.module_id === module.id)
            const restricted = module.restricted && !canSeePrivate

            return (
              <section className="fac-module-block" key={module.id}>
                <div className="fac-module-title">
                  <div><small>0{module.sort_order} · {session?.status === 'completed' ? 'SELESAI' : session?.status === 'in_progress' ? 'SEDANG DIISI' : 'BELUM DIMULAI'}</small><h2>{module.title}</h2><small>{module.subtitle}</small></div>
                  {module.restricted && <span className="fac-private">PRIVATE</span>}
                </div>

                {restricted ? (
                  <div className="fac-restricted-note">Jawaban modul ini dibatasi. Akun Anda memerlukan permission <strong>Private Assessment</strong> untuk melihat jawaban sensitif awardee.</div>
                ) : (
                  <div className="fac-answer-list">
                    {moduleQuestions.map((question) => {
                      const key = session ? `${session.id}:${question.id}` : ''
                      const hasAnswer = session ? answerMap.has(key) : false
                      const selected = hasAnswer ? answerMap.get(key) : false
                      return (
                        <div className="fac-answer-row" key={question.id}>
                          <span className="fac-answer-code">{question.code}</span>
                          <span className="fac-answer-text">{question.question_text}</span>
                          <span className={`fac-answer-value ${!hasAnswer ? 'none' : selected ? 'yes' : 'no'}`}>
                            {!hasAnswer ? 'Belum dijawab' : selected ? '✓ Dipilih' : 'Tidak dipilih'}
                          </span>
                        </div>
                      )
                    })}
                    {moduleQuestions.length === 0 && <div className="fac-empty">Belum ada pertanyaan aktif untuk modul ini.</div>}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </section>
    </main>
  )
}
