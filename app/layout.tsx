import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './global.css'
import { Provider } from '@/components/provider'
import favicon from '@/public/favicon.png'

export const metadata: Metadata = {
  metadataBase: 'https://kagenokeiyou.github.io',
  title: {
    default: 'Math Notes',
    template: '%s | Math Notes',
  },
  description: 'My Math Notes',
  icons: favicon.src,
  robots: {
    index: true,
    follow: true,
  },
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
