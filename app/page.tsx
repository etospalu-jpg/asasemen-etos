const modules = [
  {
    number: "01",
    title: "Mengenal Diri",
    subtitle: "Profil karakter, temperamen, dan gaya interaksi.",
  },
  {
    number: "02",
    title: "Memahami Diri",
    subtitle: "Emosi, ketangguhan, dan kebutuhan pendampingan.",
  },
  {
    number: "03",
    title: "Menentukan Arah",
    subtitle: "Minat, cita-cita, karier, dan kontribusi.",
  },
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="brand-row">
          <div className="brand-mark">E</div>
          <div>
            <p className="eyebrow">ETOS Assessment Center</p>
            <p className="brand-subtitle">Awardee Development Assessment</p>
          </div>
        </div>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="status-pill">Infrastructure ready</span>
            <h1>
              Kenali dirimu.
              <br />
              Pahami kondisimu.
              <br />
              <span>Tentukan arahmu.</span>
            </h1>
            <p>
              Portal asesmen perkembangan awardee ETOS untuk membantu proses refleksi,
              pendampingan, dan pengembangan yang lebih personal.
            </p>
            <div className="hero-actions">
              <button type="button" className="primary-button">Mulai Assessment</button>
              <button type="button" className="secondary-button">Login Fasilitator</button>
            </div>
          </div>

          <div className="module-stack" aria-label="Modul asesmen">
            {modules.map((module) => (
              <article className="module-card" key={module.number}>
                <span className="module-number">{module.number}</span>
                <div>
                  <h2>{module.title}</h2>
                  <p>{module.subtitle}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer>
        <span>ETOS Assessment Center</span>
        <span>Foundation build · Phase A.2</span>
      </footer>
    </main>
  );
}
