import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { Favicon } from '@/components/icon'
import { baseOptions } from '@/lib/layout.shared'
import { appName } from '@/lib/shared'
import { source } from '@/lib/source'

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
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
    </DocsLayout>
  )
}
