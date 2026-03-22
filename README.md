## @mcrovero/effect-react-cache

[![npm version](https://img.shields.io/npm/v/%40mcrovero%2Feffect-react-cache.svg?logo=npm&label=npm)](https://www.npmjs.com/package/@mcrovero/effect-react-cache)
[![license: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

> This library is in early alpha and not yet ready for production use.

Typed helpers to compose React’s server `cache` with `Effect` in a type-safe, ergonomic way.

### Install

```sh
pnpm add @mcrovero/effect-react-cache effect react
```

## Why

React exposes a low-level `cache` primitive to memoize async work by argument tuple during a React Server Component render. This library wraps an `Effect`-returning function with React’s `cache` so you can:

- Deduplicate concurrent calls: share the same pending promise across callers
- Memoize by arguments: same args → same result without re-running the effect
- Keep Effect ergonomics: preserve `R` requirements and typed errors

## Quick start

```ts
import { Effect } from "effect"
import { reactCache } from "@mcrovero/effect-react-cache/ReactCache"

// 1) Wrap an Effect-returning function
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep(200)
    return { id, name: "Alice" as const }
  })

const cachedFetchUser = reactCache(fetchUser)

// 2) Use it like any other Effect
// React memoization only happens when this Effect is executed
// from an active React server render.
await Effect.runPromise(cachedFetchUser("u-1"))
```

## Usage

### Cache a function with arguments

```ts
import { Effect } from "effect"
import { reactCache } from "@mcrovero/effect-react-cache/ReactCache"

const getUser = (id: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep(100)
    return { id, name: "Alice" as const }
  })

export const cachedGetUser = reactCache(getUser)

// When executed inside the same React server render:
// same args → computed once, then memoized
await Effect.runPromise(cachedGetUser("42"))
await Effect.runPromise(cachedGetUser("42")) // reuses cached promise
```

### Cache a function without arguments

```ts
import { Effect } from "effect"
import { reactCache } from "@mcrovero/effect-react-cache/ReactCache"

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
import { reactCache } from "@mcrovero/effect-react-cache/ReactCache"

class Random extends Context.Tag("MyRandomService")<Random, { readonly next: Effect.Effect<number> }>() {}

export const cachedWithRequirements = reactCache(() =>
  Effect.gen(function* () {
    const random = yield* Random
    const n = yield* random.next
    return n
  })
)

// Inside the same React server render, the first call for a given args tuple
// determines the cached value
await Effect.runPromise(cachedWithRequirements().pipe(Effect.provideService(Random, { next: Effect.succeed(111) })))

// Subsequent calls with the same args reuse the first result,
// even if a different Context is provided!
await Effect.runPromise(cachedWithRequirements().pipe(Effect.provideService(Random, { next: Effect.succeed(222) })))
```

## API

```ts
declare const reactCache: <F extends (...args: Array<any>) => Effect.Effect<any, any, any>>(
  effect: F
) => (...args: Parameters<F>) => ReturnType<F>
```

- Input: an `Effect`-returning function
- Output: a function with the same signature, whose evaluation is cached by argument tuple using React’s `cache`

## How it works

- Internally uses `react/cache` to memoize by the argument tuple.
- For each unique args tuple, the first evaluation creates a single promise that is reused by all subsequent calls (including concurrent calls).
- The `Effect` context (`R`) is captured at call time, but for a given args tuple the first completed `Exit` is reused for the lifetime of the current React request/render cache.

### Important behaviors

- First call wins: for the same args tuple, the first call’s context and outcome (success or failure) are cached. Later calls with a different context still reuse that result.
- Errors are cached: if the first call fails, the rejection is reused for subsequent calls with the same args tuple.
- Concurrency is deduplicated: concurrent calls with the same args share the same pending promise.

### Do's and Don'ts

- **Do**: cache pure/idempotent computations that return plain data.
- **Do**: include discriminators (locale, tenant, user) in the argument tuple when results depend on them.
- **Don't**: pass effects that require `Scope` or create live resources (DB/client handles, file handles, sockets). Acquire resources outside and provide them, or use a `Layer`.
- **Don't**: rely on per-call timeouts/cancellation or different `Context` for the same args. The first call determines the cached outcome and context.

## Limitations

- **No scoped resources**: Effects requiring `Scope` are rejected at the type level. React's `cache` evaluates once and reuses the result, so any scoped resource would be finalized immediately after creation, breaking later callers.
- **First call wins**: For a given args tuple, the first call's context and outcome (success or failure) are cached and reused.
- **Context sensitivity**: If results depend on request context (logger level, locale, tracer span, etc.), include those discriminators in the arguments or avoid caching.
- **Streams/Channels**: Don't cache effects that return live `Stream`/`Channel` handles tied to resources.

## Testing

When running tests outside a React server render, you may want to mock `react`’s `cache` to ensure deterministic, in-memory memoization. React’s default non-server build treats `cache` as a passthrough, so plain `Effect.runPromise(...)` calls will not memoize on their own. A simple primitive-oriented mock looks like this:

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

See `test/ReactCache.test.ts` for a more faithful identity-based mock and examples covering caching, argument sensitivity, context provisioning, and concurrency.

## Caveats and tips

- The cache is keyed by the argument tuple using React’s semantics. Prefer primitives or stable object identities as arguments.
- Since the first outcome is cached, design your effects such that this is acceptable for your use case. For context-sensitive computations, include discriminators in the argument list.
- This library is designed for React Server Components. Outside a React server render, `react`’s default `cache` implementation is effectively a passthrough.

## Works with Next.js

You can use this library together with [@mcrovero/effect-nextjs](https://www.npmjs.com/package/@mcrovero/effect-nextjs) to deduplicate `Effect`-based functions within the same Next.js server render across pages, layouts, and server components.
