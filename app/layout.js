export const metadata = {
  title: 'LohnMail Professional',
  description: 'LohnMail license and payment server',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f6f9fc', color: '#0f172a' }}>
        {children}
      </body>
    </html>
  );
}
