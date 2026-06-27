import { HomeLayout } from 'fumadocs-ui/layouts/home'
import Image from 'next/image'
import { baseOptions } from '@/lib/layout.shared'
import { appName } from '@/lib/shared'
import favicon from '@/public/favicon.png'

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <HomeLayout
      {...baseOptions()}
      nav={{
        title: (
          <>
            <Image src={favicon} alt="favicon" width={20} height={20} loading="eager" />
            <span className="font-bold max-sm:hidden">{appName}</span>
          </>
        ),
      }}
    >
      {children}
    </HomeLayout>
  )
}
