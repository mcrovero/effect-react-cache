import { Cause, Chunk, Context, Effect, Exit } from "effect"
import { reactCache as reactCacheUnsafe } from "@mcrovero/effect-react-cache/ReactCache"

const reactCache = reactCacheUnsafe as any

export class Random extends Context.Tag("fixtures/next-app/Random")<
  Random,
  { readonly next: Effect.Effect<number> }
>() {}

type CountedResult = {
  readonly id: string
  readonly run: number
}

type ContextResult = {
  readonly run: number
  readonly value: number
}

type SpanResult = {
  readonly run: number
  readonly span: string
}

let sameArgsExecutions = 0
let differentArgsExecutions = 0
let concurrentExecutions = 0
let contextExecutions = 0
let spanExecutions = 0
let falsySuccessExecutions = 0
let errorSameArgsExecutions = 0
let errorDifferentArgsExecutions = 0
let falsyErrorExecutions = 0
let composedCauseExecutions = 0
let identityExecutions = 0
let requestExecutions = 0
let layoutExecutions = 0
let routeExecutions = 0

export const cachedSameArgs = reactCache((id: string) =>
  Effect.sync(() => {
    sameArgsExecutions += 1
    return { id, run: sameArgsExecutions }
  })) as (id: string) => Effect.Effect<CountedResult, never, never>

export const cachedDifferentArgs = reactCache((id: string) =>
  Effect.sync(() => {
    differentArgsExecutions += 1
    return { id, run: differentArgsExecutions }
  })) as (id: string) => Effect.Effect<CountedResult, never, never>

export const cachedConcurrent = reactCache((id: string) =>
  Effect.gen(function*() {
    concurrentExecutions += 1
    yield* Effect.sleep(20)
    return { id, run: concurrentExecutions }
  })) as (id: string) => Effect.Effect<CountedResult, never, never>

export const cachedContext = reactCache(() =>
  Effect.gen(function*() {
    contextExecutions += 1
    const random = yield* Random
    const value = yield* random.next
    return { run: contextExecutions, value }
  })) as () => Effect.Effect<ContextResult, never, Random>

export const cachedSpan = reactCache(() =>
  Effect.gen(function*() {
    spanExecutions += 1
    const span = yield* Effect.currentSpan
    return { run: spanExecutions, span: span.name }
  })) as () => Effect.Effect<SpanResult, never, never>

export const cachedFalsySuccess = reactCache(() =>
  Effect.sync(() => {
    falsySuccessExecutions += 1
    return false
  })) as () => Effect.Effect<boolean, never, never>

export const cachedErrorSameArgs = reactCache((id: string) =>
  Effect.gen(function*() {
    errorSameArgsExecutions += 1
    return yield* Effect.fail(`boom:${id}` as const)
  })) as (id: string) => Effect.Effect<never, string, never>

export const cachedErrorDifferentArgs = reactCache((id: string) =>
  Effect.gen(function*() {
    errorDifferentArgsExecutions += 1
    return yield* Effect.fail(`boom:${id}` as const)
  })) as (id: string) => Effect.Effect<never, string, never>

export const cachedFalsyError = reactCache(() =>
  Effect.gen(function*() {
    falsyErrorExecutions += 1
    return yield* Effect.fail("" as const)
  })) as () => Effect.Effect<never, string, never>

export const cachedComposedCause = reactCache(() =>
  Effect.gen(function*() {
    composedCauseExecutions += 1
    return yield* Effect.failCause(Cause.sequential(Cause.fail("boom"), Cause.fail("cleanup")))
  })) as () => Effect.Effect<never, string, never>

export const cachedIdentity = reactCache(
  (input: { readonly id: string }) =>
    Effect.sync(() => {
      identityExecutions += 1
      return { id: input.id, run: identityExecutions }
    })
) as (input: { readonly id: string }) => Effect.Effect<CountedResult, never, never>

export const cachedRequestScoped = reactCache((id: string) =>
  Effect.sync(() => {
    requestExecutions += 1
    return { id, run: requestExecutions }
  })) as (id: string) => Effect.Effect<CountedResult, never, never>

export const cachedLayoutPage = reactCache((id: string) =>
  Effect.sync(() => {
    layoutExecutions += 1
    return { id, run: layoutExecutions }
  })) as (id: string) => Effect.Effect<CountedResult, never, never>

export const cachedRouteHandler = reactCache((id: string) =>
  Effect.sync(() => {
    routeExecutions += 1
    return { id, run: routeExecutions }
  })) as (id: string) => Effect.Effect<CountedResult, never, never>

export const getSameArgsExecutions = () => sameArgsExecutions
export const getDifferentArgsExecutions = () => differentArgsExecutions
export const getConcurrentExecutions = () => concurrentExecutions
export const getContextExecutions = () => contextExecutions
export const getSpanExecutions = () => spanExecutions
export const getFalsySuccessExecutions = () => falsySuccessExecutions
export const getErrorSameArgsExecutions = () => errorSameArgsExecutions
export const getErrorDifferentArgsExecutions = () => errorDifferentArgsExecutions
export const getFalsyErrorExecutions = () => falsyErrorExecutions
export const getComposedCauseExecutions = () => composedCauseExecutions
export const getIdentityExecutions = () => identityExecutions
export const getRequestExecutions = () => requestExecutions
export const getRouteExecutions = () => routeExecutions

export const failuresFromExit = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? Chunk.toReadonlyArray(Cause.failures(exit.cause)) : []

export const prettyCauseFromExit = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? Cause.pretty(exit.cause) : ""
