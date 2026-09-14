export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">DPM-Assure</p>
        <h1>Data Privacy Audit & Assurance</h1>
        <p className="lede">
          A traceable, evidence-driven assurance platform built around authoritative
          sources, deterministic controls, evidence gates, human review, and
          immutable audit history.
        </p>
        <div className="status-grid" aria-label="Foundation status">
          <article>
            <strong>Compliance Truth</strong>
            <span>Source-backed and version governed</span>
          </article>
          <article>
            <strong>System Truth</strong>
            <span>Deterministic workflows and evidence gates</span>
          </article>
          <article>
            <strong>AI Assistance</strong>
            <span>Traceable, reviewable, never autonomous sign-off</span>
          </article>
        </div>
      </section>
    </main>
  );
}
