import { Context, Effect } from "effect"
import { reactCache } from "../src/ReactCache.js"

function cachableFunction(id: string) {
  return Effect.gen(function*() {
    yield* Effect.log(`Fetching user ${id}`)
    yield* Effect.sleep(2000)
    yield* Effect.log(`Fetched user ${id}`)
    return { id: "u-1", name: "Alice" }
  })
}

export const cachedFunction = reactCache(cachableFunction)

export const cachedFunctionWithoutArgs = reactCache(() =>
  Effect.gen(function*() {
    yield* Effect.log(`Fetching user without args`)
    yield* Effect.sleep(2000)
    yield* Effect.log(`Fetched user without args`)
    return { id: "u-1", name: "Alice" }
  })
)

// Declaring a tag for a service that generates random numbers
class Random extends Context.Tag("MyRandomService")<
  Random,
  {
    readonly next: Effect.Effect<number>
  }
>() {}

export const cachedFunctionWithRequirements = reactCache(() =>
  Effect.gen(function*() {
    const random = yield* Random
    yield* Effect.log(`Fetching user with requirements ${random.next}`)
    yield* Effect.sleep(2000)
    yield* Effect.log(`Fetched user with requirements ${random.next}`)
    return { id: "u-1", name: "Alice" }
  })
)
