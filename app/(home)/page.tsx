import Image from 'next/image'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { appName } from '@/lib/shared'
import favicon from '@/public/favicon.png'

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center gap-4 px-[10vw] py-[10vh] text-center">
      <Image src={favicon} alt="favicon" width={128} height={128} loading="eager" />
      <h1 className="text-4xl font-bold">{appName}</h1>
      <h2 className="text-fd-muted-foreground text-2xl font-bold">My {appName}</h2>
      <div className="flex flex-col items-center gap-4">
        <Link href="/docs/basics" className={buttonVariants({ variant: 'secondary' })}>
          Basics
        </Link>
        <Link href="/docs/calculus" className={buttonVariants({ variant: 'secondary' })}>
          Calculus
        </Link>
      </div>
    </div>
  )
}
