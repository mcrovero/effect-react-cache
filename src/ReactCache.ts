import { Effect, Exit, Runtime } from "effect"
import type * as Scope from "effect/Scope"
import { cache } from "react"

type EffectFn = (...args: Array<any>) => Effect.Effect<any, any, any>

type SuccessOf<F extends EffectFn> = ReturnType<F> extends Effect.Effect<infer A, any, any> ? A : never

type ErrorOf<F extends EffectFn> = ReturnType<F> extends Effect.Effect<any, infer E, any> ? E : never

type ContextOf<F extends EffectFn> = ReturnType<F> extends Effect.Effect<any, any, infer R> ? R : never

/**
 * @since 1.0.0
 * @category type ids
 */
export const TypeId: unique symbol = Symbol.for("@mcrovero/effect-react-cache/ReactCache")

/**
 * Enforce that cached effects do not require `Scope`.
 * If `R` contains `Scope`, this adds a helpful phantom property that makes
 * the call site require an impossible extra argument while preserving
 * inference for external consumers of the generated `.d.ts`.
 */
type NoScopeArgs<F extends EffectFn> = [Extract<ContextOf<F>, Scope.Scope>] extends [never] ? []
  : [[
    "⛔ reactCache: Effects requiring Scope cannot be cached.",
    "Move resource acquisition outside, or memoize with a Layer instead."
  ]]

const runEffectFn = <F extends EffectFn>(
  effect: F,
  runtime: Runtime.Runtime<ContextOf<F>>,
  ...args: Parameters<F>
): Promise<Exit.Exit<SuccessOf<F>, ErrorOf<F>>> => Runtime.runPromiseExit(runtime, effect(...args))

const runEffectCachedFn = cache(
  <F extends EffectFn>(effect: F, ...args: Parameters<F>) => {
    let promise: Promise<Exit.Exit<SuccessOf<F>, ErrorOf<F>>>
    return (runtime: Runtime.Runtime<ContextOf<F>>) => {
      if (!promise) {
        promise = runEffectFn(effect, runtime, ...args)
      }
      return promise
    }
  }
)

/**
 * Compose React's `cache` with an Effect-returning function, memoizing by argument tuple.
 * Memoization only happens when React's server cache dispatcher is active
 * (for example, during a React Server Component render). Outside that
 * environment, React's default `cache` implementation is effectively a passthrough.
 *
 * Do:
 * - Cache pure/idempotent computations that return plain data
 * - Include discriminators (e.g. locale/tenant) in the argument tuple if results depend on them
 *
 * Don't:
 * - Pass effects that require `Scope` (resource acquisition); use a `Layer` or lift resources outside instead
 * - Rely on per-call timeouts/cancellation or different Context for the same args; first call wins and is cached
 */
export const reactCache = <F extends EffectFn>(effect: F, ..._scopeError: NoScopeArgs<F>) => {
  return (
    ...args: Parameters<F>
  ): ReturnType<F> =>
    Effect.gen(function*() {
      const runtime = yield* Effect.runtime<ContextOf<F>>()
      const exit = yield* Effect.promise(() => runEffectCachedFn(effect, ...args)(runtime))
      if (Exit.isSuccess(exit)) {
        return exit.value as SuccessOf<F>
      }
      return yield* Effect.failCause(exit.cause)
    }) as ReturnType<F>
}
