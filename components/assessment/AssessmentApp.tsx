'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PAGE_SIZE = 8
const TOKEN_KEY = 'etos_awardee_session'

type AwardeeOption = {
  awardee_id: string
  full_name: string
  campus: string | null
  cohort: number | null
}

type ModuleSummary = {
  code: string
  title: string
  subtitle: string | null
  prompt: string | null
  restricted: boolean
  sort_order: number
  question_count: number
  status: 'not_started' | 'in_progress' | 'completed' | 'locked'
  last_saved_at: string | null
  completed_at: string | null
}

type Workspace = {
  ok: boolean
  error?: string
  awardee: {
    id: string
    full_name: string
    campus: string | null
    major: string | null
    cohort: number | null
  }
  period: {
    id: string
    code: string
    name: string
    year: number
    semester: number
  } | null
  modules: ModuleSummary[]
  progress: { completed: number; total: number; percent: number }
}

type Question = {
  id: string
  code: string
  text: string
  sort_order: number
  selected: boolean
}

type ModulePayload = {
  ok: boolean
  error?: string
  module: {
    code: string
    title: string
    subtitle: string | null
    prompt: string | null
    restricted: boolean
  }
  session: {
    id: string
    status: 'not_started' | 'in_progress' | 'completed' | 'locked'
    last_saved_at: string | null
    completed_at: string | null
  }
  questions: Question[]
}

function draftKey(awardeeId: string, moduleCode: string) {
  return `etos_draft_${awardeeId}_${moduleCode}`
}

export function AssessmentApp() {
  const supabase = useMemo(() => createClient(), [])
  const [token, setToken] = useState<string | null>(null)
  const [awardees, setAwardees] = useState<AwardeeOption[]>([])
  const [selectedAwardee, setSelectedAwardee] = useState('')
  const [last4, setLast4] = useState('')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [activeModule, setActiveModule] = useState<ModulePayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle')
  const [error, setError] = useState('')
  const dirtyRef = useRef(false)

  const pageCount = activeModule ? Math.ceil(activeModule.questions.length / PAGE_SIZE) : 0
  const pageQuestions = activeModule?.questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? []
  const selectedCount = Object.values(answers).filter(Boolean).length

  useEffect(() => {
    void bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!dirtyRef.current || !activeModule || !token || activeModule.session.status === 'completed') return
    const timeout = window.setTimeout(() => void saveNow(), 650)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers])

  useEffect(() => {
    const handleOnline = () => {
      if (dirtyRef.current) void saveNow()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule, token, answers])

  async function bootstrap() {
    setLoading(true)
    const existing = window.localStorage.getItem(TOKEN_KEY)
    if (existing) {
      setToken(existing)
      const ok = await loadWorkspace(existing)
      if (ok) {
        setLoading(false)
        return
      }
      window.localStorage.removeItem(TOKEN_KEY)
      setToken(null)
    }
    await loadAwardees()
    setLoading(false)
  }

  async function loadAwardees() {
    const { data, error: rpcError } = await supabase.rpc('list_awardees_for_access')
    if (rpcError) {
      setError('Daftar awardee belum dapat dimuat. Coba beberapa saat lagi.')
      return
    }
    setAwardees((data ?? []) as AwardeeOption[])
  }

  async function loadWorkspace(sessionToken = token) {
    if (!sessionToken) return false
    const { data, error: rpcError } = await supabase.rpc('get_awardee_workspace', { p_token: sessionToken })
    if (rpcError) return false
    const payload = data as Workspace
    if (!payload?.ok) return false
    setWorkspace(payload)
    setError('')
    return true
  }

  async function verify() {
    setError('')
    if (!selectedAwardee) {
      setError('Pilih nama awardee terlebih dahulu.')
      return
    }
    if (!/^\d{4}$/.test(last4)) {
      setError('Masukkan tepat 4 digit terakhir nomor WhatsApp.')
      return
    }

    setVerifying(true)
    const { data, error: rpcError } = await supabase.rpc('verify_awardee_access', {
      p_awardee_id: selectedAwardee,
      p_last4: last4,
    })
    setVerifying(false)

    if (rpcError) {
      setError('Verifikasi belum dapat diproses. Coba lagi.')
      return
    }

    const payload = data as { ok: boolean; token?: string; error?: string }
    if (!payload.ok || !payload.token) {
      if (payload.error === 'temporarily_locked') {
        setError('Terlalu banyak percobaan. Silakan coba kembali sekitar 15 menit lagi.')
      } else {
        setError('Nama atau 4 digit nomor WhatsApp tidak sesuai.')
      }
      return
    }

    window.localStorage.setItem(TOKEN_KEY, payload.token)
    setToken(payload.token)
    setLast4('')
    await loadWorkspace(payload.token)
  }

  async function openModule(module: ModuleSummary) {
    if (!token || !workspace || module.status === 'completed' || module.status === 'locked') return
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('get_awardee_module', {
      p_token: token,
      p_module_code: module.code,
    })
    setLoading(false)

    if (rpcError) {
      setError('Modul belum dapat dibuka. Coba lagi.')
      return
    }

    const payload = data as ModulePayload
    if (!payload.ok) {
      setError(payload.error === 'session_expired' ? 'Sesi berakhir. Silakan verifikasi kembali.' : 'Modul belum dapat dibuka.')
      return
    }

    const serverAnswers = Object.fromEntries(payload.questions.map((q) => [q.id, q.selected])) as Record<string, boolean>
    const key = draftKey(workspace.awardee.id, module.code)
    let merged = serverAnswers
    try {
      const local = window.localStorage.getItem(key)
      if (local) merged = { ...serverAnswers, ...(JSON.parse(local) as Record<string, boolean>) }
    } catch {
      window.localStorage.removeItem(key)
    }

    setAnswers(merged)
    setActiveModule(payload)
    setPage(0)
    dirtyRef.current = false
    setSaveState(payload.session.last_saved_at ? 'saved' : 'idle')
  }

  function toggleQuestion(questionId: string) {
    if (!activeModule || activeModule.session.status === 'completed' || !workspace) return
    const next = { ...answers, [questionId]: !answers[questionId] }
    setAnswers(next)
    dirtyRef.current = true
    setSaveState(navigator.onLine ? 'saving' : 'offline')
    window.localStorage.setItem(draftKey(workspace.awardee.id, activeModule.module.code), JSON.stringify(next))
  }

  async function saveNow() {
    if (!token || !activeModule || activeModule.session.status === 'completed' || !dirtyRef.current) return true
    if (!navigator.onLine) {
      setSaveState('offline')
      return false
    }

    setSaving(true)
    setSaveState('saving')
    const payloadAnswers = activeModule.questions.map((question) => ({
      question_id: question.id,
      selected: Boolean(answers[question.id]),
    }))

    const { data, error: rpcError } = await supabase.rpc('save_awardee_answers', {
      p_token: token,
      p_module_code: activeModule.module.code,
      p_answers: payloadAnswers,
    })

    setSaving(false)
    const payload = data as { ok?: boolean; error?: string } | null
    if (rpcError || !payload?.ok) {
      setSaveState('offline')
      return false
    }

    dirtyRef.current = false
    setSaveState('saved')
    return true
  }

  async function previousPage() {
    await saveNow()
    setPage((current) => Math.max(0, current - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function nextPage() {
    await saveNow()
    setPage((current) => Math.min(pageCount - 1, current + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function completeModule() {
    if (!token || !activeModule || !workspace) return
    setError('')
    await saveNow()

    const { data, error: rpcError } = await supabase.rpc('complete_awardee_module', {
      p_token: token,
      p_module_code: activeModule.module.code,
    })

    if (rpcError) {
      setError('Modul belum dapat diselesaikan. Coba lagi.')
      return
    }

    const payload = data as { ok: boolean; error?: string; selected?: number }
    if (!payload.ok) {
      if (payload.error === 'minimum_selection') {
        setError(`Centang minimal 3 pernyataan yang paling sesuai. Saat ini ${payload.selected ?? 0} dipilih.`)
      } else {
        setError('Modul belum dapat diselesaikan.')
      }
      return
    }

    window.localStorage.removeItem(draftKey(workspace.awardee.id, activeModule.module.code))
    setActiveModule(null)
    setAnswers({})
    setPage(0)
    dirtyRef.current = false
    await loadWorkspace(token)
  }

  async function logoutAwardee() {
    if (token) await supabase.rpc('revoke_awardee_access', { p_token: token })
    window.localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setWorkspace(null)
    setActiveModule(null)
    setAnswers({})
    setSelectedAwardee('')
    setLast4('')
    await loadAwardees()
  }

  if (loading) {
    return (
      <main className="assessment-shell assessment-center-screen">
        <div className="assessment-loader" />
        <p>Menyiapkan Assessment Center…</p>
      </main>
    )
  }

  if (!token || !workspace) {
    return (
      <main className="assessment-shell">
        <header className="assessment-topbar">
          <a href="/" className="assessment-brand">
            <span className="assessment-brand-mark">E</span>
            <span><strong>ETOS Assessment Center</strong><small>Awardee Development Assessment</small></span>
          </a>
          <a href="/login" className="assessment-text-link">Login Fasilitator</a>
        </header>

        <section className="verify-layout">
          <div className="verify-copy">
            <span className="assessment-kicker">Mulai perjalanan refleksimu</span>
            <h1>Kenali diri.<br />Pahami kondisi.<br /><em>Tentukan arah.</em></h1>
            <p>Asesmen ini bukan ujian. Pilih pernyataan yang benar-benar menggambarkan dirimu untuk membantu proses pendampingan dan pengembangan bersama ETOS.</p>
          </div>

          <div className="verify-card">
            <span className="verify-step">LANGKAH 01</span>
            <h2>Verifikasi Awardee</h2>
            <p>Pilih namamu lalu masukkan 4 digit terakhir nomor WhatsApp yang terdaftar.</p>

            <label className="assessment-field">
              <span>Nama awardee</span>
              <select value={selectedAwardee} onChange={(event) => setSelectedAwardee(event.target.value)}>
                <option value="">Pilih nama…</option>
                {awardees.map((awardee) => (
                  <option key={awardee.awardee_id} value={awardee.awardee_id}>
                    {awardee.full_name}{awardee.campus ? ` · ${awardee.campus}` : ''}{awardee.cohort ? ` · ${awardee.cohort}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="assessment-field">
              <span>4 digit terakhir WhatsApp</span>
              <input
                value={last4}
                onChange={(event) => setLast4(event.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••"
                maxLength={4}
              />
            </label>

            {error && <div className="assessment-alert">{error}</div>}
            {awardees.length === 0 && !error && <div className="assessment-note">Belum ada data awardee aktif. Admin perlu menambahkan awardee terlebih dahulu.</div>}

            <button className="assessment-primary" onClick={() => void verify()} disabled={verifying || awardees.length === 0}>
              {verifying ? 'Memverifikasi…' : 'Lanjutkan Assessment'}
            </button>
            <p className="assessment-security-note">Data digunakan hanya untuk kebutuhan pendampingan dan pengembangan awardee ETOS.</p>
          </div>
        </section>
      </main>
    )
  }

  if (activeModule) {
    const percentage = pageCount ? Math.round(((page + 1) / pageCount) * 100) : 0
    return (
      <main className="assessment-shell assessment-form-shell">
        <header className="assessment-topbar compact">
          <button className="assessment-brand button-reset" onClick={() => setActiveModule(null)}>
            <span className="assessment-brand-mark">E</span>
            <span><strong>{activeModule.module.title}</strong><small>{activeModule.module.subtitle}</small></span>
          </button>
          <div className={`autosave-state ${saveState}`}>
            <span />
            {saveState === 'saving' || saving ? 'Menyimpan…' : saveState === 'offline' ? 'Tersimpan di perangkat' : saveState === 'saved' ? 'Tersimpan' : 'Siap'}
          </div>
        </header>

        <section className="assessment-form-card">
          <div className="assessment-form-heading">
            <div>
              <span className="assessment-kicker">{activeModule.module.prompt}</span>
              <h1>Centang yang benar-benar menggambarkan dirimu.</h1>
              <p>Tidak perlu memilih semuanya. Yang tidak sesuai cukup dibiarkan kosong.</p>
            </div>
            <div className="assessment-page-counter"><strong>{page + 1}</strong><span>/ {pageCount}</span></div>
          </div>

          {activeModule.module.restricted && (
            <div className="private-banner"><strong>Privat</strong><span>Bagian ini untuk kebutuhan pendampingan dan bukan diagnosis kesehatan mental.</span></div>
          )}

          <div className="assessment-progress-track"><span style={{ width: `${percentage}%` }} /></div>
          <div className="assessment-progress-meta"><span>Bagian {page + 1} dari {pageCount}</span><span>{percentage}%</span></div>

          <div className="question-grid">
            {pageQuestions.map((question) => {
              const selected = Boolean(answers[question.id])
              return (
                <button
                  type="button"
                  key={question.id}
                  className={`question-choice ${selected ? 'selected' : ''}`}
                  onClick={() => toggleQuestion(question.id)}
                  aria-pressed={selected}
                >
                  <span className="question-check">{selected ? '✓' : ''}</span>
                  <span className="question-body"><small>{question.code}</small><strong>{question.text}</strong></span>
                </button>
              )
            })}
          </div>

          {error && <div className="assessment-alert form-alert">{error}</div>}

          <div className="assessment-form-footer">
            <div className="selected-summary"><strong>{selectedCount}</strong><span>pernyataan dipilih</span></div>
            <div className="assessment-nav-actions">
              <button className="assessment-secondary" onClick={() => void previousPage()} disabled={page === 0}>Sebelumnya</button>
              {page < pageCount - 1 ? (
                <button className="assessment-primary small" onClick={() => void nextPage()}>Lanjut</button>
              ) : (
                <button className="assessment-primary small" onClick={() => void completeModule()}>Simpan & Selesaikan</button>
              )}
            </div>
          </div>
        </section>
      </main>
    )
  }

  const complete = workspace.progress.total > 0 && workspace.progress.completed === workspace.progress.total
  return (
    <main className="assessment-shell">
      <header className="assessment-topbar">
        <a href="/" className="assessment-brand">
          <span className="assessment-brand-mark">E</span>
          <span><strong>ETOS Assessment Center</strong><small>{workspace.period?.name ?? 'Belum ada periode aktif'}</small></span>
        </a>
        <button className="assessment-text-link button-reset" onClick={() => void logoutAwardee()}>Keluar</button>
      </header>

      <section className="workspace-hero">
        <div>
          <span className="assessment-kicker">Awardee Development Assessment</span>
          <h1>Halo, {workspace.awardee.full_name.split(' ')[0]} 👋</h1>
          <p>Luangkan waktu untuk mengenali dirimu dengan lebih jujur. Progress tersimpan otomatis dan bisa dilanjutkan kembali.</p>
          <div className="awardee-meta">
            {workspace.awardee.campus && <span>{workspace.awardee.campus}</span>}
            {workspace.awardee.major && <span>{workspace.awardee.major}</span>}
            {workspace.awardee.cohort && <span>Awardee {workspace.awardee.cohort}</span>}
          </div>
        </div>
        <div className="workspace-progress-card">
          <span>Assessment Progress</span>
          <strong>{workspace.progress.completed} / {workspace.progress.total}</strong>
          <div className="assessment-progress-track"><span style={{ width: `${workspace.progress.percent}%` }} /></div>
          <small>{workspace.progress.percent}% selesai</small>
        </div>
      </section>

      {complete && (
        <section className="completion-card">
          <span className="completion-icon">✓</span>
          <div><strong>Assessment periode ini selesai.</strong><p>Terima kasih. Jawabanmu akan menjadi salah satu bahan pendampingan dan pengembangan bersama ETOS.</p></div>
        </section>
      )}

      <section className="workspace-modules">
        {workspace.modules.map((module) => (
          <article className={`workspace-module-card status-${module.status}`} key={module.code}>
            <div className="workspace-module-number">0{module.sort_order}</div>
            <div className="workspace-module-content">
              <div className="workspace-module-topline">
                <span>{module.restricted ? 'PRIVATE ASSESSMENT' : 'SELF ASSESSMENT'}</span>
                <span className={`module-status ${module.status}`}>{module.status === 'completed' ? 'Selesai' : module.status === 'in_progress' ? 'Sedang diisi' : 'Belum dimulai'}</span>
              </div>
              <h2>{module.title}</h2>
              <p>{module.subtitle}</p>
              <small>{module.question_count} pernyataan</small>
            </div>
            <button
              className={`module-action ${module.status === 'completed' ? 'done' : ''}`}
              disabled={module.status === 'completed' || module.status === 'locked' || !workspace.period}
              onClick={() => void openModule(module)}
            >
              {module.status === 'completed' ? '✓' : module.status === 'in_progress' ? 'Lanjutkan →' : 'Mulai →'}
            </button>
          </article>
        ))}
      </section>

      {error && <div className="assessment-alert workspace-alert">{error}</div>}
      <footer className="assessment-footer"><span>ETOS Assessment Center</span><span>Kenali diri · Pahami kondisi · Tentukan arah</span></footer>
    </main>
  )
}
