import type { ReactNode } from "react"
import { Effect } from "effect"
import { cachedLayoutPage } from "../../lib/cache-fixture"

export const dynamic = "force-dynamic"

export default async function TreeLayout({ children }: { children: ReactNode }) {
  const payload = await Effect.runPromise(cachedLayoutPage("layout-page"))

  return (
    <>
      <pre id="layout-payload">{JSON.stringify(payload)}</pre>
      {children}
    </>
  )
}
