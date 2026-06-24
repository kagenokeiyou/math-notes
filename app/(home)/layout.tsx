import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { Favicon } from '@/components/icon'
import { baseOptions } from '@/lib/layout.shared'
import { appName } from '@/lib/shared'

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <HomeLayout
      {...baseOptions()}
      nav={{
        title: (
          <>
            <Favicon />
            <span className="font-bold max-sm:hidden">{appName}</span>
          </>
        ),
      }}
    >
      {children}
    </HomeLayout>
  )
}
