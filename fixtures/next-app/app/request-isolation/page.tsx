import { Effect } from "effect"
import {
  cachedRequestScoped,
  getRequestExecutions
} from "../../lib/cache-fixture"

export const dynamic = "force-dynamic"

export default async function RequestIsolationPage() {
  const first = await Effect.runPromise(cachedRequestScoped("request"))
  const second = await Effect.runPromise(cachedRequestScoped("request"))

  return (
    <pre id="payload">
      {JSON.stringify({
        first,
        second,
        executions: getRequestExecutions()
      })}
    </pre>
  )
}
