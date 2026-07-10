import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import Image from 'next/image'
import { baseOptions } from '@/lib/layout.shared'
import { appName } from '@/lib/shared'
import { source } from '@/lib/source'
import favicon from '@/public/favicon.png'

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      nav={{
        title: (
          <>
            <Image src={favicon} alt="favicon" width={20} height={20} loading="eager" />
            <span className="font-medium max-sm:hidden">{appName}</span>
          </>
        ),
      }}
    >
      {children}
    </DocsLayout>
  )
}
