import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  children?: ReactNode
  className?: string
}

export default function HiddenText({ children, className }: Props) {
  return <div className={cn(className, 'text-[0rem]')}>{children}</div>
}
