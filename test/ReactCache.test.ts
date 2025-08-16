import { Context, Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { reactCache } from "../src/ReactCache.js"

vi.mock("react", () => {
  return {
    cache: <F extends (...args: Array<any>) => any>(fn: F) => {
      const memo = new Map<string, ReturnType<F>>()
      return ((...args: Array<any>) => {
        const key = JSON.stringify(args, (_k, v) => {
          if (typeof v === "function") return `fn:${v.name || "anon"}`
          if (typeof v === "symbol") return v.toString()
          return v
        })
        if (!memo.has(key)) {
          memo.set(key, fn(...args))
        }
        return memo.get(key) as ReturnType<F>
      }) as F
    }
  }
})

describe("reactCache", () => {
  it("caches results for the same arguments (single run)", async () => {
    let runCount = 0

    const uncached = (id: string) =>
      Effect.gen(function*() {
        runCount += 1
        yield* Effect.sleep(10)
        return `user:${id}` as const
      })

    const cached = reactCache(uncached)

    const result1 = await Effect.runPromise(cached("42"))
    const result2 = await Effect.runPromise(cached("42"))

    expect(result1).toBe("user:42")
    expect(result2).toBe("user:42")
    expect(runCount).toBe(1)
  })

  it("does not cache across different arguments", async () => {
    let runCount = 0

    const uncached = (id: string) =>
      Effect.gen(function*() {
        runCount += 1
        yield* Effect.sleep(5)
        return `user:${id}` as const
      })

    const cached = reactCache(uncached)

    const result1 = await Effect.runPromise(cached("a"))
    const result2 = await Effect.runPromise(cached("b"))

    expect(result1).toBe("user:a")
    expect(result2).toBe("user:b")
    expect(runCount).toBe(2)
  })

  it("caches across different contexts (uses first computed value)", async () => {
    class Random extends Context.Tag("TestRandomService")<
      Random,
      { readonly next: Effect.Effect<number> }
    >() {}

    let runCount = 0

    const uncached = () =>
      Effect.gen(function*() {
        runCount += 1
        const random = yield* Random
        const n = yield* random.next
        return n
      })

    const cached = reactCache(uncached)

    const result1 = await Effect.runPromise(
      cached().pipe(
        Effect.provideService(Random, {
          next: Effect.succeed(111)
        })
      )
    )

    const result2 = await Effect.runPromise(
      cached().pipe(
        Effect.provideService(Random, {
          next: Effect.succeed(222)
        })
      )
    )

    expect(result1).toBe(111)
    expect(result2).toBe(111)
    expect(runCount).toBe(1)
  })

  it("shares the same pending promise across concurrent calls", async () => {
    let runCount = 0

    const uncached = (id: string) =>
      Effect.gen(function*() {
        runCount += 1
        yield* Effect.sleep(20)
        return `user:${id}` as const
      })

    const cached = reactCache(uncached)

    const [a, b] = await Promise.all([
      Effect.runPromise(cached("x")),
      Effect.runPromise(cached("x"))
    ])

    expect(a).toBe("user:x")
    expect(b).toBe("user:x")
    expect(runCount).toBe(1)
  })
})
