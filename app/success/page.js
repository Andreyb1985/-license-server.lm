export default async function SuccessPage({ searchParams }) {
  const params = await searchParams;
  const cardSetup = params?.payment_method === 'card';

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '0 auto', padding: 48 }}>
      <h1>Vielen Dank.</h1>
      {cardSetup ? (
        <>
          <p>Ihre Karte wurde bestätigt.</p>
          <p>Eine offene Rechnung wird jetzt bezahlt und zukünftige Zahlungen werden automatisch eingezogen. Bitte aktualisieren Sie den Lizenzstatus in LohnMail.</p>
        </>
      ) : (
        <>
          <p>Die Zahlung wurde verarbeitet. Ihre Lizenz wird nach Stripe-Bestätigung erstellt.</p>
          <p>Bitte aktualisieren Sie den Lizenzstatus in LohnMail.</p>
        </>
      )}
    </main>
  );
}
