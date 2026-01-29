export const metadata = {
  title: 'Golf Pickem',
  description: '2026 PGA Tour Pick em League',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
