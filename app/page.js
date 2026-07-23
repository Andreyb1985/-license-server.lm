export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 920, margin: '0 auto', padding: 48 }}>
      <h1>LohnMail Professional</h1>
      <p>2 Monate kostenlos testen. Danach 40 € pro Monat.</p>
      <p>
        LohnMail Professional — 40 € / Monat. 2 Monate kostenlos testen. Ihre Zahlungsart wählen
        Sie erst zum Ende der Testphase. Anschließend zahlen Sie automatisch per Karte oder mit
        14 Tagen Zahlungsziel auf Rechnung.
      </p>
      <p>
        <a href="/api/download" style={{ display: 'inline-block', padding: '12px 18px', borderRadius: 10, background: '#008357', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>
          Kostenlos herunterladen
        </a>
      </p>
    </main>
  );
}
