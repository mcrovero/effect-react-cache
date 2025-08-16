import { Effect } from "effect"
import type * as Context from "effect/Context"
import { cache } from "react"

/**
 * @since 1.0.0
 * @category type ids
 */
export const TypeId: unique symbol = Symbol.for("@mcrovero/effect-react-cache/ReactCache")

const runEffectFn = <A, E, R, Args extends Array<unknown>>(
  effect: (...args: Args) => Effect.Effect<A, E, R>,
  context: Context.Context<R>,
  ...args: Args
) => {
  const effectResult = effect(...args)
  const effectWithContext = Effect.provide(effectResult, context)

  return Effect.runPromise(effectWithContext)
}

const runEffectCachedFn = cache(
  <A, E, R, Args extends Array<unknown>>(
    effect: (...args: Args) => Effect.Effect<A, E, R>,
    ...args: Args
  ) => {
    let promise: Promise<A> | undefined
    return (context: Context.Context<R>) => {
      if (!promise) {
        promise = runEffectFn<A, E, R, Args>(effect, context, ...args)
      }
      return promise
    }
  }
)

export const reactCache = <A, E, R, Args extends Array<unknown>>(
  effect: (...args: Args) => Effect.Effect<A, E, R>
) => {
  return (...args: Args) =>
    Effect.gen(function*() {
      const context = yield* Effect.context<R>()
      const value = yield* Effect.promise(() => runEffectCachedFn(effect, ...args)(context))
      return value as A
    })
}
