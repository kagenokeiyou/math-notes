import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-medium">404</h1>
      <h2 className="text-lg font-normal">This page could not be found</h2>
      <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
        Back to home
      </Link>
    </div>
  )
}
