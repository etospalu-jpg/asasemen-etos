import Link from 'next/link'

import { login } from './actions'

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">E</div>
          <div>
            <p className="eyebrow">ETOS Assessment Center</p>
            <p className="brand-subtitle">Portal internal fasilitator</p>
          </div>
        </div>

        <div className="auth-copy">
          <span className="status-pill">Akses Internal</span>
          <h1 id="login-title">Masuk sebagai fasilitator.</h1>
          <p>
            Gunakan akun internal yang diberikan administrator ETOS. Akses jawaban privat,
            laporan, dan tindak lanjut dibatasi oleh role serta RLS.
          </p>
        </div>

        {error ? <div className="auth-error" role="alert">{error}</div> : null}

        <form className="auth-form" action={login}>
          <label>
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" minLength={8} required />
          </label>
          <button className="primary-button" type="submit">Masuk ke Dashboard</button>
        </form>

        <Link className="auth-back" href="/">← Kembali ke halaman utama</Link>
      </section>
    </main>
  )
}
