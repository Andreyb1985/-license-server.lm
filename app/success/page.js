export default function SuccessPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '0 auto', padding: 48 }}>
      <h1>Vielen Dank.</h1>
      <p>Die Zahlung wurde verarbeitet. Ihre Lizenz wird nach Stripe-Bestätigung erstellt.</p>
      <p>Die Anzeige oder E-Mail-Zustellung des Lizenzschlüssels ist als nächster Integrationsschritt vorgesehen.</p>
    </main>
  );
}
