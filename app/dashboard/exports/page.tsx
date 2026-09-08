import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type DocumentRow = {
  id: string
  awardee_id: string
  period_id: string
  document_type: 'raw_answers' | 'comprehensive_report'
  storage_path: string | null
  generated_by: string | null
  created_at: string
}

export default async function ExportHistoryPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: period }] = await Promise.all([
    supabase.from('profiles').select('full_name, role, can_export, can_view_private').eq('id', userId).maybeSingle(),
    supabase.from('assessment_periods').select('id, name, year, semester').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const canExport = profile?.role === 'superadmin' || Boolean(profile?.can_export)
  if (!canExport) {
    return (
      <main className="fac-shell">
        <header className="fac-topbar"><div className="fac-brand"><div className="fac-brand-mark">E</div><div><strong>ETOS Assessment Center</strong><small>Export History</small></div></div><div className="fac-actions"><Link className="fac-link" href="/dashboard">Overview</Link></div></header>
        <section className="fac-panel"><div className="fac-restricted-note">Permission <strong>PDF Export</strong> diperlukan untuk membuka riwayat dokumen assessment.</div></section>
      </main>
    )
  }

  const { data: documents } = period
    ? await supabase.from('generated_documents').select('id, awardee_id, period_id, document_type, storage_path, generated_by, created_at').eq('period_id', period.id).order('created_at', { ascending: false }).limit(250)
    : { data: [] as DocumentRow[] }

  const rows = (documents ?? []) as DocumentRow[]
  const awardeeIds = [...new Set(rows.map((row) => row.awardee_id))]
  const { data: awardees } = awardeeIds.length
    ? await supabase.from('awardees').select('id, full_name, campus, cohort').in('id', awardeeIds)
    : { data: [] }
  const awardeeMap = new Map((awardees ?? []).map((row) => [row.id, row]))

  const rawCount = rows.filter((row) => row.document_type === 'raw_answers').length
  const fullCount = rows.filter((row) => row.document_type === 'comprehensive_report').length
  const uniqueAwardees = new Set(rows.map((row) => row.awardee_id)).size

  return (
    <main className="fac-shell">
      <header className="fac-topbar">
        <div className="fac-brand"><div className="fac-brand-mark">E</div><div><strong>ETOS Assessment Center</strong><small>Export History</small></div></div>
        <div className="fac-actions"><Link className="fac-link" href="/dashboard">Overview</Link>{profile?.role === 'superadmin' || profile?.can_view_private ? <Link className="fac-link" href="/dashboard/support">Support Inbox</Link> : null}<form action="/auth/signout" method="post"><button className="fac-button" type="submit">Keluar</button></form></div>
      </header>

      <section className="fac-hero ops-hero">
        <div><span className="fac-kicker">Audit Trail</span><h1>Riwayat Export</h1><p>Setiap unduhan PDF assessment dicatat agar penggunaan data sensitif dapat ditelusuri.</p></div>
        <div className="fac-period"><span>Periode aktif</span><strong>{period?.name ?? 'Belum ada periode'}</strong><small>{period ? `${period.year} · Semester ${period.semester}` : '—'}</small></div>
      </section>

      <section className="fac-metrics">
        <article className="fac-metric"><span>Total Export</span><strong>{rows.length}</strong><small>pada periode aktif</small></article>
        <article className="fac-metric"><span>Jawaban Mentah</span><strong>{rawCount}</strong><small>raw answers PDF</small></article>
        <article className="fac-metric"><span>Laporan Lengkap</span><strong>{fullCount}</strong><small>analysis + raw answers</small></article>
        <article className="fac-metric"><span>Awardee</span><strong>{uniqueAwardees}</strong><small>pernah diexport</small></article>
      </section>

      <section className="fac-panel">
        <div className="fac-panel-head"><div><span className="fac-kicker">Documents</span><h2>Aktivitas PDF</h2></div><p>Maksimal 250 aktivitas terbaru</p></div>
        {rows.length === 0 ? <div className="fac-empty">Belum ada PDF yang diexport pada periode aktif.</div> : (
          <div className="fac-table-wrap"><table className="fac-table ops-export-table"><thead><tr><th>Waktu</th><th>Awardee</th><th>Jenis Dokumen</th><th>Scope</th><th /></tr></thead><tbody>{rows.map((row) => {
            const awardee = awardeeMap.get(row.awardee_id)
            return <tr key={row.id}><td>{new Date(row.created_at).toLocaleString('id-ID')}</td><td><span className="fac-name">{awardee?.full_name ?? 'Awardee'}</span><span className="fac-sub">{awardee?.campus ?? '—'} · {awardee?.cohort ?? '—'}</span></td><td><span className={`ops-doc-type ${row.document_type}`}>{row.document_type === 'raw_answers' ? 'Jawaban Mentah' : 'Laporan Lengkap'}</span></td><td>{row.storage_path ?? 'Generated on demand'}</td><td><Link className="fac-view" href={`/dashboard/awardees/${row.awardee_id}`}>Profil →</Link></td></tr>
          })}</tbody></table></div>
        )}
      </section>
    </main>
  )
}
