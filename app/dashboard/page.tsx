import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    redirect('/login')
  }

  const [{ data: profile }, { data: modules, error: moduleError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, email, role, can_view_private, can_export')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('assessment_modules')
      .select('code, title, restricted, sort_order')
      .eq('active', true)
      .order('sort_order'),
  ])

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">E</div>
          <div>
            <p className="eyebrow">ETOS Assessment Center</p>
            <p className="brand-subtitle">Facilitator Workspace</p>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="secondary-button" type="submit">Keluar</button>
        </form>
      </header>

      <section className="dashboard-welcome">
        <div>
          <span className="status-pill">Foundation Active</span>
          <h1>Halo, {profile?.full_name || 'Fasilitator'}.</h1>
          <p>
            Infrastruktur authentication, role, RLS, dan database assessment sudah aktif.
            Modul operasional akan dibangun pada fase berikutnya.
          </p>
        </div>
        <div className="connection-card">
          <span className={moduleError ? 'dot dot-error' : 'dot'} />
          <div>
            <strong>{moduleError ? 'Periksa konfigurasi' : 'Supabase terhubung'}</strong>
            <small>{moduleError ? moduleError.message : 'RLS-protected query berhasil'}</small>
          </div>
        </div>
      </section>

      <section className="metric-grid" aria-label="Foundation status">
        <article className="metric-card">
          <span>Role</span>
          <strong>{profile?.role ?? 'belum dikonfigurasi'}</strong>
          <small>Authorization berasal dari database, bukan user metadata.</small>
        </article>
        <article className="metric-card">
          <span>Private Assessment</span>
          <strong>{profile?.can_view_private ? 'Diizinkan' : 'Dibatasi'}</strong>
          <small>Akses jawaban sensitif memiliki permission terpisah.</small>
        </article>
        <article className="metric-card">
          <span>PDF Export</span>
          <strong>{profile?.can_export ? 'Diizinkan' : 'Dibatasi'}</strong>
          <small>Download laporan akan dicatat pada audit trail.</small>
        </article>
      </section>

      <section className="foundation-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Assessment V1</p>
            <h2>Modul yang tersedia</h2>
          </div>
          <span>{modules?.length ?? 0} modul</span>
        </div>
        <div className="foundation-modules">
          {(modules ?? []).map((module, index) => (
            <article key={module.code} className="foundation-module">
              <div className="module-number">{String(index + 1).padStart(2, '0')}</div>
              <div>
                <h3>{module.title}</h3>
                <p>{module.restricted ? 'Private assessment · akses terbatas' : 'Standard assessment'}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
