import { Data, Effect } from "effect"
import { reactCache } from "../src/ReactCache.js"

class CustomError extends Data.TaggedError("CustomError") {}

// Example of a function that yields an error string
function cachableFunctionWithError(id: string) {
  return Effect.gen(function*() {
    yield* Effect.log(`Attempting to fetch user ${id}`)
    yield* Effect.sleep(1000)
    // Simulate an error
    return yield* new CustomError()
  })
}

export const cachedFunctionWithError = reactCache(cachableFunctionWithError)

const result = await Effect.runPromise(
  Effect.gen(function*() {
    const result = yield* cachedFunctionWithError("x").pipe(
      Effect.catchTag("CustomError", () => Effect.succeed("error"))
    )
    return result
  })
)

console.log(result)
