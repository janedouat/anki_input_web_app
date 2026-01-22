import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Add word or phrase to Anki',
  description: 'Queue words and expressions for Anki flashcards',
  manifest: '/manifest.json',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#fff' }}>{children}</body>
    </html>
  )
}

