import { Effect } from "effect"
import { cachedLayoutPage } from "../../lib/cache-fixture"

export const dynamic = "force-dynamic"

export default async function TreePage() {
  const payload = await Effect.runPromise(cachedLayoutPage("layout-page"))

  return <pre id="page-payload">{JSON.stringify(payload)}</pre>
}
