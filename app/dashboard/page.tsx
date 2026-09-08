import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type SessionRow = {
  awardee_id: string
  status: 'not_started' | 'in_progress' | 'completed' | 'locked'
  module_id: string
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) redirect('/login')

  const [{ data: profile }, { data: period }, { data: modules }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, email, role, can_view_private, can_export')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('assessment_periods')
      .select('id, code, name, year, semester')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('assessment_modules')
      .select('id, code, title, restricted, sort_order')
      .eq('active', true)
      .order('sort_order'),
  ])

  const [{ data: awardees, error: awardeeError }, { data: sessions }] = await Promise.all([
    supabase
      .from('awardees')
      .select('id, full_name, campus, major, cohort')
      .eq('status', 'active')
      .order('full_name'),
    period
      ? supabase
          .from('assessment_sessions')
          .select('awardee_id, status, module_id')
          .eq('period_id', period.id)
      : Promise.resolve({ data: [] as SessionRow[] }),
  ])

  const sessionRows = (sessions ?? []) as SessionRow[]
  const moduleRows = modules ?? []
  const awardeeRows = awardees ?? []
  const moduleCount = moduleRows.length
  const canSeePrivate = profile?.role === 'superadmin' || Boolean(profile?.can_view_private)
  const canExport = profile?.role === 'superadmin' || Boolean(profile?.can_export)

  const sessionMap = new Map<string, Map<string, SessionRow['status']>>()
  for (const session of sessionRows) {
    const current = sessionMap.get(session.awardee_id) ?? new Map<string, SessionRow['status']>()
    current.set(session.module_id, session.status)
    sessionMap.set(session.awardee_id, current)
  }

  const rows = awardeeRows.map((awardee) => {
    const statuses = sessionMap.get(awardee.id) ?? new Map<string, SessionRow['status']>()
    const completed = moduleRows.filter((module) => statuses.get(module.id) === 'completed').length
    const inProgress = moduleRows.some((module) => statuses.get(module.id) === 'in_progress')
    return {
      ...awardee,
      statuses,
      completed,
      percent: moduleCount === 0 ? 0 : Math.round((completed / moduleCount) * 100),
      overall: completed === moduleCount && moduleCount > 0 ? 'completed' : inProgress ? 'in_progress' : 'not_started',
    }
  })

  const completedCount = rows.filter((row) => row.overall === 'completed').length
  const inProgressCount = rows.filter((row) => row.overall === 'in_progress').length
  const notStartedCount = rows.filter((row) => row.overall === 'not_started').length

  return (
    <main className="fac-shell">
      <header className="fac-topbar">
        <div className="fac-brand">
          <div className="fac-brand-mark" aria-hidden="true">E</div>
          <div>
            <strong>ETOS Assessment Center</strong>
            <small>Facilitator Workspace</small>
          </div>
        </div>
        <div className="fac-actions">
          {canSeePrivate && <Link href="/dashboard/support" className="fac-link">Support Inbox</Link>}
          {canExport && <Link href="/dashboard/exports" className="fac-link">Export History</Link>}
          <Link href="/assessment" className="fac-link">Awardee Portal</Link>
          <form action="/auth/signout" method="post">
            <button className="fac-button" type="submit">Keluar</button>
          </form>
        </div>
      </header>

      <section className="fac-hero">
        <div>
          <span className="fac-kicker">Assessment Overview</span>
          <h1>Halo, {profile?.full_name || 'Fasilitator'}.</h1>
          <p>Pantau penyelesaian assessment awardee, buka jawaban detail, dan identifikasi kebutuhan tindak lanjut dari satu workspace.</p>
          <div className="fac-identity">
            <span className="fac-chip">{profile?.role ?? 'role belum diatur'}</span>
            <span className="fac-chip">Private: {canSeePrivate ? 'diizinkan' : 'dibatasi'}</span>
            <span className="fac-chip">Export: {canExport ? 'diizinkan' : 'dibatasi'}</span>
          </div>
        </div>
        <div className="fac-period">
          <span>Periode aktif</span>
          <strong>{period?.name ?? 'Belum ada periode'}</strong>
          <small>{period ? `${period.year} · Semester ${period.semester}` : 'Atur periode assessment terlebih dahulu'}</small>
        </div>
      </section>

      <section className="fac-metrics" aria-label="Ringkasan assessment">
        <article className="fac-metric"><span>Total Awardee</span><strong>{rows.length}</strong><small>sesuai scope akses Anda</small></article>
        <article className="fac-metric"><span>Selesai</span><strong>{completedCount}</strong><small>3 dari 3 modul</small></article>
        <article className="fac-metric"><span>Sedang Mengisi</span><strong>{inProgressCount}</strong><small>memiliki progress aktif</small></article>
        <article className="fac-metric"><span>Belum Mulai</span><strong>{notStartedCount}</strong><small>belum memiliki sesi aktif</small></article>
      </section>

      <section className="fac-panel">
        <div className="fac-panel-head">
          <div><span className="fac-kicker">Awardee</span><h2>Progress Assessment</h2></div>
          <p>{moduleCount} modul · {rows.length} awardee</p>
        </div>

        {awardeeError ? (
          <div className="fac-error">Data awardee belum dapat dibaca: {awardeeError.message}</div>
        ) : rows.length === 0 ? (
          <div className="fac-empty">Belum ada awardee yang tersedia pada scope akun ini.</div>
        ) : (
          <div className="fac-table-wrap">
            <table className="fac-table">
              <thead><tr><th>Awardee</th><th>Angkatan</th>{moduleRows.map((module) => <th key={module.id}>{module.title}</th>)}<th>Progress</th><th /></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><span className="fac-name">{row.full_name}</span><span className="fac-sub">{row.campus || 'Kampus belum diisi'} · {row.major || 'Jurusan belum diisi'}</span></td>
                    <td>{row.cohort ?? '—'}</td>
                    {moduleRows.map((module) => {
                      const status = row.statuses.get(module.id) ?? 'not_started'
                      return <td key={module.id}><span className={`fac-status ${status}`}>{status === 'completed' ? '✓ Selesai' : status === 'in_progress' ? 'Sedang diisi' : 'Belum'}</span></td>
                    })}
                    <td><div className="fac-progress"><div className="fac-progress-track"><span style={{ width: `${row.percent}%` }} /></div><strong>{row.percent}%</strong></div></td>
                    <td><Link className="fac-view" href={`/dashboard/awardees/${row.id}`}>Lihat Detail →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
