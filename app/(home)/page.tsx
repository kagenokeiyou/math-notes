import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col justify-center text-center">
      <h1 className="mb-2 text-3xl font-bold">Math Notes</h1>
      <h2 className="text-fd-muted-foreground mb-2 text-2xl font-bold">My Math Notes</h2>
      <p>
        You can open{' '}
        <Link href="/docs/basics" className="font-medium underline">
          /docs
        </Link>{' '}
        and see the documentation.
      </p>
    </div>
  )
}
