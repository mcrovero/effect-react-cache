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

  it("caches errors for the same arguments (single run)", async () => {
    let runCount = 0

    const failing = (id: string) =>
      Effect.gen(function*() {
        runCount += 1
        yield* Effect.sleep(5)
        return yield* Effect.fail(`boom:${id}` as const)
      })

    const cached = reactCache(failing)

    // First call rejects
    await expect(Effect.runPromise(cached("e1"))).rejects.toThrowError("boom:e1")
    // Second call with same args reuses the same rejection
    await expect(Effect.runPromise(cached("e1"))).rejects.toThrowError("boom:e1")

    expect(runCount).toBe(1)
  })

  it("does not share errors across different arguments", async () => {
    let runCount = 0

    const failing = (id: string) =>
      Effect.gen(function*() {
        runCount += 1
        yield* Effect.sleep(5)
        return yield* Effect.fail(`boom:${id}` as const)
      })

    const cached = reactCache(failing)

    await expect(Effect.runPromise(cached("a"))).rejects.toThrowError("boom:a")
    await expect(Effect.runPromise(cached("b"))).rejects.toThrowError("boom:b")

    expect(runCount).toBe(2)
  })

  it("shares the same pending rejected promise across concurrent calls", async () => {
    let runCount = 0

    const failing = (id: string) =>
      Effect.gen(function*() {
        runCount += 1
        yield* Effect.sleep(20)
        return yield* Effect.fail(`boom:${id}` as const)
      })

    const cached = reactCache(failing)

    const results = await Promise.allSettled([
      Effect.runPromise(cached("x")),
      Effect.runPromise(cached("x"))
    ])

    expect(results[0].status).toBe("rejected")
    expect(results[1].status).toBe("rejected")
    if (results[0].status === "rejected" && results[1].status === "rejected") {
      expect((results[0].reason as Error).message).toBe("boom:x")
      expect((results[1].reason as Error).message).toBe("boom:x")
    }
    expect(runCount).toBe(1)
  })

  it("preserves current span across cached execution", async () => {
    const traced = () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan
        return span.name
      })

    const cached = reactCache(traced)

    const result = await Effect.runPromise(
      cached().pipe(Effect.withSpan("outer-span"))
    )

    expect(result).toBe("outer-span")
  })
})
