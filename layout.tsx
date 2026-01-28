import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Golf Pick\'em League',
  description: '2026 PGA Tour Pick\'em League',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
