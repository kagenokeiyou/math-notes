import { createLucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

const Basics = createLucideIcon('Basics', [
  [
    'path',
    {
      d: 'M 18 6 C 18 0, 12 0, 12 6 L 12 18 C 12 24, 6 24, 6 18 M 8 12 L 16 12',
      key: '1',
    },
  ],
])

const Calculus = createLucideIcon('Calculus', [
  [
    'path',
    {
      d: 'M 18 6 C 18 0, 12 0, 12 6 L 12 18 C 12 24, 6 24, 6 18',
      key: '1',
    },
  ],
])

export const customIcons = { Basics, Calculus }

interface Props {
  className?: string
}

export function Favicon({ className }: Props) {
  return <img src="/favicon.png" alt="favicon" className={cn(className, 'size-5')} />
}
