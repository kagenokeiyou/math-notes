import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  children?: ReactNode
  className?: string
}

export default function KatexLeft({ children, className }: Props) {
  return <div className={cn(className, 'katex-left')}>{children}</div>
}
