import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type PageProps = { params: Promise<{ id: string }> }
type SessionRow = { id: string; module_id: string; status: string; completed_at: string | null; last_saved_at: string | null }
type AnswerRow = { session_id: string; question_id: string; selected: boolean }

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

  const [{ data: questions }, { data: answers }] = await Promise.all([
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
  ])

  const answerMap = new Map<string, boolean>()
  for (const answer of (answers ?? []) as AnswerRow[]) {
    answerMap.set(`${answer.session_id}:${answer.question_id}`, answer.selected)
  }

  const completedModules = sessionRows.filter((session) => session.status === 'completed').length
  const percent = moduleRows.length ? Math.round((completedModules / moduleRows.length) * 100) : 0

  return (
    <main className="fac-shell">
      <header className="fac-topbar">
        <div className="fac-brand">
          <div className="fac-brand-mark">E</div>
          <div><strong>ETOS Assessment Center</strong><small>Jawaban Detail Awardee</small></div>
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
