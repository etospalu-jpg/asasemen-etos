import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { createFollowupAction, setSignalStatusAction, updateFollowupAction } from './actions'

type SignalRow = {
  id: string
  awardee_id: string
  period_id: string
  question_id: string | null
  signal_code: string
  signal_level: 'info' | 'low' | 'medium' | 'high'
  status: string
  created_at: string
}

type FollowupRow = {
  id: string
  awardee_id: string
  period_id: string
  facilitator_id: string | null
  signal_id: string | null
  category: string | null
  notes: string | null
  action: string | null
  deadline: string | null
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled'
  updated_at: string
}

export default async function SupportInboxPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: period }] = await Promise.all([
    supabase.from('profiles').select('full_name, role, can_view_private').eq('id', userId).maybeSingle(),
    supabase.from('assessment_periods').select('id, name, year, semester').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const canSeePrivate = profile?.role === 'superadmin' || Boolean(profile?.can_view_private)
  if (!canSeePrivate) {
    return (
      <main className="fac-shell">
        <header className="fac-topbar"><div className="fac-brand"><div className="fac-brand-mark">E</div><div><strong>ETOS Assessment Center</strong><small>Support Inbox</small></div></div><div className="fac-actions"><Link className="fac-link" href="/dashboard">Overview</Link></div></header>
        <section className="fac-panel"><div className="fac-restricted-note">Halaman ini memuat data assessment privat. Permission <strong>Private Assessment</strong> diperlukan.</div></section>
      </main>
    )
  }

  const [{ data: signals }, { data: followups }] = period
    ? await Promise.all([
        supabase.from('assessment_signals').select('id, awardee_id, period_id, question_id, signal_code, signal_level, status, created_at').eq('period_id', period.id).order('created_at', { ascending: false }),
        supabase.from('followups').select('id, awardee_id, period_id, facilitator_id, signal_id, category, notes, action, deadline, status, updated_at').eq('period_id', period.id).order('updated_at', { ascending: false }),
      ])
    : [{ data: [] as SignalRow[] }, { data: [] as FollowupRow[] }]

  const signalRows = (signals ?? []) as SignalRow[]
  const followupRows = (followups ?? []) as FollowupRow[]
  const awardeeIds = [...new Set(signalRows.map((row) => row.awardee_id))]
  const questionIds = [...new Set(signalRows.map((row) => row.question_id).filter(Boolean))] as string[]

  const [{ data: awardees }, { data: questions }] = await Promise.all([
    awardeeIds.length ? supabase.from('awardees').select('id, full_name, campus, cohort').in('id', awardeeIds) : Promise.resolve({ data: [] }),
    questionIds.length ? supabase.from('assessment_questions').select('id, code, question_text').in('id', questionIds) : Promise.resolve({ data: [] }),
  ])

  const awardeeMap = new Map((awardees ?? []).map((row) => [row.id, row]))
  const questionMap = new Map((questions ?? []).map((row) => [row.id, row]))
  const followupBySignal = new Map<string, FollowupRow>()
  for (const followup of followupRows) {
    if (followup.signal_id && !followupBySignal.has(followup.signal_id)) followupBySignal.set(followup.signal_id, followup)
  }

  const openSignals = signalRows.filter((row) => row.status === 'open').length
  const reviewedSignals = signalRows.filter((row) => row.status === 'reviewed').length
  const highSignals = signalRows.filter((row) => row.signal_level === 'high').length
  const activeFollowups = followupRows.filter((row) => row.status === 'open' || row.status === 'in_progress').length

  return (
    <main className="fac-shell">
      <header className="fac-topbar">
        <div className="fac-brand"><div className="fac-brand-mark">E</div><div><strong>ETOS Assessment Center</strong><small>Support Inbox</small></div></div>
        <div className="fac-actions"><Link className="fac-link" href="/dashboard">Overview</Link><Link className="fac-link" href="/dashboard/exports">Export History</Link><form action="/auth/signout" method="post"><button className="fac-button" type="submit">Keluar</button></form></div>
      </header>

      <section className="fac-hero ops-hero">
        <div><span className="fac-kicker">Internal Support</span><h1>Support Inbox</h1><p>Signal sensitif dipakai sebagai pemicu percakapan dan tindak lanjut pendampingan. Bukan diagnosis kesehatan mental.</p></div>
        <div className="fac-period"><span>Periode aktif</span><strong>{period?.name ?? 'Belum ada periode'}</strong><small>{period ? `${period.year} · Semester ${period.semester}` : '—'}</small></div>
      </section>

      <section className="fac-metrics">
        <article className="fac-metric"><span>Signal Terbuka</span><strong>{openSignals}</strong><small>belum ditinjau</small></article>
        <article className="fac-metric"><span>Sudah Ditinjau</span><strong>{reviewedSignals}</strong><small>reviewed</small></article>
        <article className="fac-metric"><span>Level High</span><strong>{highSignals}</strong><small>prioritaskan pengecekan</small></article>
        <article className="fac-metric"><span>Follow-up Aktif</span><strong>{activeFollowups}</strong><small>open / in progress</small></article>
      </section>

      <section className="ops-list">
        {signalRows.length === 0 ? <div className="fac-panel fac-empty">Belum ada support signal pada periode aktif.</div> : signalRows.map((signal) => {
          const awardee = awardeeMap.get(signal.awardee_id)
          const question = signal.question_id ? questionMap.get(signal.question_id) : undefined
          const followup = followupBySignal.get(signal.id)
          return (
            <article className={`ops-card level-${signal.signal_level}`} key={signal.id}>
              <div className="ops-card-head">
                <div><span className="ops-level">{signal.signal_level}</span><h2>{signal.signal_code}</h2><p>{awardee?.full_name ?? 'Awardee'} · {awardee?.campus ?? 'Kampus belum diisi'} · {awardee?.cohort ?? '—'}</p></div>
                <div className="ops-head-actions"><span className={`ops-status ${signal.status}`}>{signal.status}</span><Link className="fac-view" href={`/dashboard/awardees/${signal.awardee_id}`}>Profil →</Link></div>
              </div>

              {question && <div className="ops-question"><strong>{question.code}</strong><p>{question.question_text}</p></div>}

              {followup ? (
                <form action={updateFollowupAction} className="ops-followup-form">
                  <input type="hidden" name="followup_id" value={followup.id} />
                  <div className="ops-grid two"><label>Status<select name="status" defaultValue={followup.status}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="cancelled">Cancelled</option></select></label><label>Deadline<input type="date" name="deadline" defaultValue={followup.deadline ?? ''} /></label></div>
                  <label>Catatan<textarea name="notes" defaultValue={followup.notes ?? ''} rows={3} /></label>
                  <label>Aksi tindak lanjut<textarea name="action" defaultValue={followup.action ?? ''} rows={2} /></label>
                  <div className="ops-form-foot"><small>Terakhir diperbarui {new Date(followup.updated_at).toLocaleString('id-ID')}</small><button className="fac-button primary" type="submit">Simpan Follow-up</button></div>
                </form>
              ) : (
                <form action={createFollowupAction} className="ops-followup-form">
                  <input type="hidden" name="signal_id" value={signal.id} />
                  <div className="ops-grid two"><label>Kategori<input name="category" placeholder="Akademik / keluarga / personal" /></label><label>Deadline<input type="date" name="deadline" /></label></div>
                  <label>Catatan awal<textarea name="notes" rows={3} placeholder="Konteks yang perlu dibahas bersama awardee" /></label>
                  <label>Rencana tindak lanjut<textarea name="action" rows={2} placeholder="Contoh: jadwalkan percakapan 1-on-1" /></label>
                  <div className="ops-form-foot">
                    <form action={setSignalStatusAction}><input type="hidden" name="signal_id" value={signal.id} /><input type="hidden" name="signal_status" value="closed" /><button className="fac-button ghost" type="submit">Tutup tanpa follow-up</button></form>
                    <button className="fac-button primary" type="submit">Buat Follow-up</button>
                  </div>
                </form>
              )}
            </article>
          )
        })}
      </section>
    </main>
  )
}
