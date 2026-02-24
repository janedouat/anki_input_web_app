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
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Add Word" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#fff', WebkitUserSelect: 'none', userSelect: 'none' }}>{children}</body>
    </html>
  )
}

