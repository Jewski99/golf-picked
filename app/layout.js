import './globals.css'

export const metadata = {
  title: 'Golf Pick\'em League',
  description: '2026 PGA Tour Pick\'em League',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
