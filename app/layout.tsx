import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './global.css'
import { Provider } from '@/components/provider'
import 'katex/dist/katex.css'

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV == 'production'
      ? 'https://kagenokeiyou.github.io/math-notes'
      : 'http://localhost:3000',
  ),
  title: 'Math Notes',
  icons: '/favicon.png',
}

const inter = Inter({
  subsets: ['latin'],
})

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
