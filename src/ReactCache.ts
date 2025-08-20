import { Cause, Effect, Exit } from "effect"
import type * as Context from "effect/Context"
import type * as Scope from "effect/Scope"
import { cache } from "react"

type CauseResult<E> = {
  error: E | undefined
  defect: unknown
}

type PromiseResult<A, E> = {
  success: A | undefined
  error: E | undefined
  defect: unknown
}

/**
 * @since 1.0.0
 * @category type ids
 */
export const TypeId: unique symbol = Symbol.for("@mcrovero/effect-react-cache/ReactCache")

/**
 * Enforce that cached effects do not require `Scope`.
 * If `R` contains `Scope`, this resolves to a helpful error tuple.
 */
type NoScope<R> = [Extract<R, Scope.Scope>] extends [never] ? R
  : [
    "⛔ reactCache: Effects requiring Scope cannot be cached.",
    "Move resource acquisition outside, or memoize with a Layer instead."
  ]

const runEffectFn = <A, E, R, Args extends Array<unknown>>(
  effect: (...args: Args) => Effect.Effect<A, E, NoScope<R>>,
  context: Context.Context<NoScope<R>>,
  ...args: Args
): Promise<PromiseResult<A, E>> => {
  const effectResult = effect(...args)
  const effectWithContext = Effect.provide(effectResult, context)

  return Effect.runPromiseExit(effectWithContext).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return { success: exit.value, error: undefined, defect: undefined }
    }
    if (Exit.isFailure(exit)) {
      const cause = Cause.match(exit.cause, {
        onEmpty: { error: undefined, defect: undefined } as CauseResult<E>,
        onFail: (error) => ({ error, defect: undefined }),
        onDie: (defect) => ({ error: undefined, defect }),
        onInterrupt: () => {
          throw new Error("Interrupt cause not supported")
        },
        onSequential: () => {
          throw new Error("Sequential cause not supported")
        },
        onParallel: () => {
          throw new Error("Parallel cause not supported")
        }
      })
      return { success: undefined, error: cause.error, defect: cause.defect }
    }
    return { success: undefined, error: undefined, defect: undefined }
  })
}

const runEffectCachedFn = cache(
  <A, E, R, Args extends Array<unknown>>(
    effect: (...args: Args) => Effect.Effect<A, E, NoScope<R>>,
    ...args: Args
  ) => {
    let promise: Promise<PromiseResult<A, E>>
    return (context: Context.Context<NoScope<R>>) => {
      if (!promise) {
        promise = runEffectFn<A, E, R, Args>(effect, context, ...args)
      }
      return promise
    }
  }
)

/**
 * Compose React's `cache` with an Effect-returning function, memoizing by argument tuple.
 *
 * Do:
 * - Cache pure/idempotent computations that return plain data
 * - Include discriminators (e.g. locale/tenant) in the argument tuple if results depend on them
 *
 * Don't:
 * - Pass effects that require `Scope` (resource acquisition); use a `Layer` or lift resources outside instead
 * - Rely on per-call timeouts/cancellation or different Context for the same args; first call wins and is cached
 */
export const reactCache = <A, E, R, Args extends Array<unknown>>(
  effect: (...args: Args) => Effect.Effect<A, E, NoScope<R>>
) => {
  return (
    ...args: Args
  ): Effect.Effect<A, E, NoScope<R>> =>
    Effect.gen(function*() {
      const context = yield* Effect.context<NoScope<R>>()
      const result = yield* Effect.promise(() => runEffectCachedFn(effect, ...args)(context))
      if (result.success) {
        return yield* Effect.succeed(result.success)
      }
      if (result.error) {
        return yield* Effect.fail(result.error)
      }
      return yield* Effect.die(result.defect)
    })
}
