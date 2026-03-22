import { Cause, Chunk, Context, Effect, Exit } from "effect"
import { describe, expect, it, vi } from "vitest"
import { reactCache } from "../src/ReactCache.js"

vi.mock("react", () => {
  type CacheNode<A> = {
    o?: WeakMap<object | Function, CacheNode<A>>
    p?: Map<unknown, CacheNode<A>>
    s?: 0 | 1 | 2
    v?: A | unknown
  }

  const createCacheNode = <A>(): CacheNode<A> => ({})

  return {
    cache: <F extends (...args: Array<any>) => any>(fn: F) => {
      let root = createCacheNode<ReturnType<F>>()

      return ((...args: Array<any>) => {
        let node = root

        for (const arg of args) {
          if (typeof arg === "function" || (typeof arg === "object" && arg !== null)) {
            if (!node.o) {
              node.o = new WeakMap<object | Function, CacheNode<ReturnType<F>>>()
            }
            let next = node.o.get(arg)
            if (!next) {
              next = createCacheNode()
              node.o.set(arg, next)
            }
            node = next
            continue
          }

          if (!node.p) {
            node.p = new Map<unknown, CacheNode<ReturnType<F>>>()
          }
          let next = node.p.get(arg)
          if (!next) {
            next = createCacheNode()
            node.p.set(arg, next)
          }
          node = next
        }

        if (node.s === 1) {
          return node.v as ReturnType<F>
        }
        if (node.s === 2) {
          throw node.v
        }

        try {
          const result = fn(...args)
          node.s = 1
          node.v = result
          return result
        } catch (error) {
          node.s = 2
          node.v = error
          throw error
        }
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

  it("preserves falsy success values", async () => {
    let runCount = 0

    const cached = reactCache(() =>
      Effect.sync(() => {
        runCount += 1
        return false
      }))

    const result1 = await Effect.runPromise(cached())
    const result2 = await Effect.runPromise(cached())

    expect(result1).toBe(false)
    expect(result2).toBe(false)
    expect(runCount).toBe(1)
  })

  it("preserves falsy typed errors", async () => {
    const cached = reactCache(() => Effect.fail(""))

    const exit = await Effect.runPromiseExit(cached())

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Chunk.toReadonlyArray(Cause.failures(exit.cause))).toEqual([""])
    }
  })

  it("preserves composed causes", async () => {
    const cached = reactCache(() =>
      Effect.failCause(Cause.sequential(Cause.fail("boom"), Cause.fail("cleanup"))))

    const exit = await Effect.runPromiseExit(cached())

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const pretty = Cause.pretty(exit.cause)
      expect(pretty).toContain("boom")
      expect(pretty).toContain("cleanup")
    }
  })

  it("uses React-style identity semantics for object arguments", async () => {
    let runCount = 0

    const cached = reactCache((input: { readonly id: string }) =>
      Effect.sync(() => {
        runCount += 1
        return input.id
      }))

    const stableInput = { id: "same-ref" }

    await Effect.runPromise(cached(stableInput))
    await Effect.runPromise(cached(stableInput))
    await Effect.runPromise(cached({ id: "same-shape" }))
    await Effect.runPromise(cached({ id: "same-shape" }))

    expect(runCount).toBe(3)
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
