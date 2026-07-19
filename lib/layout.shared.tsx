import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import Image from 'next/image'
import favicon from '@/public/favicon.png'
import { appName } from './shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image src={favicon} alt="favicon" width={20} height={20} loading="eager" />
          <span className="font-medium">{appName}</span>
        </>
      ),
    },
    themeSwitch: {
      enabled: false,
    },
  }
}
