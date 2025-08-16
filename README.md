## @mcrovero/effect-react-cache

[![npm version](https://img.shields.io/npm/v/%40mcrovero%2Feffect-react-cache.svg?logo=npm&label=npm)](https://www.npmjs.com/package/@mcrovero/effect-react-cache)
[![license: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

> This library is in early alpha and not yet ready for production use.

Typed helpers to compose React’s `cache` with `Effect` in a type-safe, ergonomic way.

### Install

```sh
pnpm add @mcrovero/effect-react-cache effect react
```

### Requirements

- React: 19.x
- effect: latest

## Why

React 19 exposes a low-level `cache` primitive to memoize async work by argument tuple. This library wraps an `Effect`-returning function with React’s `cache` so you can:

- Deduplicate concurrent calls: share the same pending promise across callers
- Memoize by arguments: same args → same result without re-running the effect
- Keep Effect ergonomics: preserve `R` requirements and typed errors

## Quick start

```ts
import { Effect } from "effect"
import { reactCache } from "@mcrovero/effect-react-cache/dist/ReactCache.js"

// 1) Wrap an Effect-returning function
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep(200)
    return { id, name: "Alice" as const }
  })

const cachedFetchUser = reactCache(fetchUser)

// 2) Use it like any other Effect
await Effect.runPromise(cachedFetchUser("u-1"))
```

## Usage

### Cache a function with arguments

```ts
import { Effect } from "effect"
import { reactCache } from "@mcrovero/effect-react-cache/dist/ReactCache.js"

const getUser = (id: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep(100)
    return { id, name: "Alice" as const }
  })

export const cachedGetUser = reactCache(getUser)

// Same args → computed once, then memoized
await Effect.runPromise(cachedGetUser("42"))
await Effect.runPromise(cachedGetUser("42")) // reuses cached promise
```

### Cache a function without arguments

```ts
import { Effect } from "effect"
import { reactCache } from "@mcrovero/effect-react-cache/dist/ReactCache.js"

export const cachedNoArgs = reactCache(() =>
  Effect.gen(function* () {
    yield* Effect.sleep(100)
    return { ok: true as const }
  })
)
```

### Cache with `R` requirements (Context)

```ts
import { Context, Effect } from "effect"
import { reactCache } from "@mcrovero/effect-react-cache/dist/ReactCache.js"

class Random extends Context.Tag("MyRandomService")<Random, { readonly next: Effect.Effect<number> }>() {}

export const cachedWithRequirements = reactCache(() =>
  Effect.gen(function* () {
    const random = yield* Random
    const n = yield* random.next
    return n
  })
)

// First call for a given args tuple determines the cached value
await Effect.runPromise(cachedWithRequirements().pipe(Effect.provideService(Random, { next: Effect.succeed(111) })))

// Subsequent calls with the same args reuse the first result,
// even if a different Context is provided!
await Effect.runPromise(cachedWithRequirements().pipe(Effect.provideService(Random, { next: Effect.succeed(222) })))
```

## API

```ts
declare const reactCache: <A, E, R, Args extends Array<unknown>>(
  effect: (...args: Args) => Effect.Effect<A, E, R>
) => (...args: Args) => Effect.Effect<A, E, R>
```

- Input: an `Effect`-returning function
- Output: a function with the same signature, whose evaluation is cached by argument tuple using React’s `cache`

## How it works

- Internally uses `react/cache` to memoize by the argument tuple.
- For each unique args tuple, the first evaluation creates a single promise that is reused by all subsequent calls (including concurrent calls).
- The `Effect` context (`R`) is captured at call time, but for a given args tuple the first successful or failed promise is reused for the lifetime of the process.

### Important behaviors

- First call wins: for the same args tuple, the first call’s context and outcome (success or failure) are cached. Later calls with a different context still reuse that result.
- Errors are cached: if the first call fails, the rejection is reused for subsequent calls with the same args tuple.
- Concurrency is deduplicated: concurrent calls with the same args share the same pending promise.

## Testing

When running tests outside a React runtime, you may want to mock `react`’s `cache` to ensure deterministic, in-memory memoization:

```ts
import { vi } from "vitest"

vi.mock("react", () => {
  return {
    cache: <F extends (...args: Array<any>) => any>(fn: F) => {
      const memo = new Map<string, ReturnType<F>>()
      return ((...args: Array<any>) => {
        const key = JSON.stringify(args)
        if (!memo.has(key)) {
          memo.set(key, fn(...args))
        }
        return memo.get(key) as ReturnType<F>
      }) as F
    }
  }
})
```

See `test/ReactCache.test.ts` for examples covering caching, argument sensitivity, context provisioning, and concurrency.

## Caveats and tips

- The cache is keyed by the argument tuple using React’s semantics. Prefer using primitives or stable/serializable values as arguments.
- Since the first outcome is cached, design your effects such that this is acceptable for your use case. For context-sensitive computations, include discriminators in the argument list.
- This library is designed for server-side usage (e.g., React Server Components / server actions) where React’s `cache` is meaningful.

## License

MIT © Mattia Crovero
