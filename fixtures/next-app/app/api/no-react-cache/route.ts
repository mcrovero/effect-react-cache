import { Effect } from "effect"
import { cachedRouteHandler, getRouteExecutions } from "../../../lib/cache-fixture"

export const dynamic = "force-dynamic"

export async function GET() {
  const first = await Effect.runPromise(cachedRouteHandler("route"))
  const second = await Effect.runPromise(cachedRouteHandler("route"))

  return Response.json({
    first,
    second,
    executions: getRouteExecutions()
  })
}
