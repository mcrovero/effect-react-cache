import { Effect } from "effect"
import {
  Random,
  cachedComposedCause,
  cachedConcurrent,
  cachedContext,
  cachedDifferentArgs,
  cachedErrorDifferentArgs,
  cachedErrorSameArgs,
  cachedFalsyError,
  cachedFalsySuccess,
  cachedIdentity,
  cachedSameArgs,
  cachedSpan,
  failuresFromExit,
  getComposedCauseExecutions,
  getConcurrentExecutions,
  getContextExecutions,
  getDifferentArgsExecutions,
  getErrorDifferentArgsExecutions,
  getErrorSameArgsExecutions,
  getFalsyErrorExecutions,
  getFalsySuccessExecutions,
  getIdentityExecutions,
  getSameArgsExecutions,
  getSpanExecutions,
  prettyCauseFromExit
} from "../../lib/cache-fixture"

export const dynamic = "force-dynamic"

export default async function BehaviorsPage() {
  const sameFirst = await Effect.runPromise(cachedSameArgs("same"))
  const sameSecond = await Effect.runPromise(cachedSameArgs("same"))

  const differentFirst = await Effect.runPromise(cachedDifferentArgs("a"))
  const differentSecond = await Effect.runPromise(cachedDifferentArgs("b"))

  const [concurrentFirst, concurrentSecond] = await Promise.all([
    Effect.runPromise(cachedConcurrent("shared")),
    Effect.runPromise(cachedConcurrent("shared"))
  ])

  const contextFirst = await Effect.runPromise(
    cachedContext().pipe(
      Effect.provideService(Random, {
        next: Effect.succeed(111)
      })
    )
  )
  const contextSecond = await Effect.runPromise(
    cachedContext().pipe(
      Effect.provideService(Random, {
        next: Effect.succeed(222)
      })
    )
  )

  const spanFirst = await Effect.runPromise(
    cachedSpan().pipe(Effect.withSpan("outer-span"))
  )
  const spanSecond = await Effect.runPromise(
    cachedSpan().pipe(Effect.withSpan("inner-span"))
  )

  const falsySuccessFirst = await Effect.runPromise(cachedFalsySuccess())
  const falsySuccessSecond = await Effect.runPromise(cachedFalsySuccess())

  const errorSameArgsFirst = await Effect.runPromiseExit(cachedErrorSameArgs("x"))
  const errorSameArgsSecond = await Effect.runPromiseExit(cachedErrorSameArgs("x"))

  const errorDifferentArgsFirst = await Effect.runPromiseExit(cachedErrorDifferentArgs("a"))
  const errorDifferentArgsSecond = await Effect.runPromiseExit(cachedErrorDifferentArgs("b"))

  const falsyError = await Effect.runPromiseExit(cachedFalsyError())
  const composedCause = await Effect.runPromiseExit(cachedComposedCause())

  const stableInput = { id: "stable" }
  const identityStableFirst = await Effect.runPromise(cachedIdentity(stableInput))
  const identityStableSecond = await Effect.runPromise(cachedIdentity(stableInput))
  const identityFreshFirst = await Effect.runPromise(cachedIdentity({ id: "fresh" }))
  const identityFreshSecond = await Effect.runPromise(cachedIdentity({ id: "fresh" }))

  const payload = {
    sameArgs: {
      first: sameFirst,
      second: sameSecond,
      executions: getSameArgsExecutions()
    },
    differentArgs: {
      first: differentFirst,
      second: differentSecond,
      executions: getDifferentArgsExecutions()
    },
    concurrent: {
      first: concurrentFirst,
      second: concurrentSecond,
      executions: getConcurrentExecutions()
    },
    context: {
      first: contextFirst,
      second: contextSecond,
      executions: getContextExecutions()
    },
    span: {
      first: spanFirst,
      second: spanSecond,
      executions: getSpanExecutions()
    },
    falsySuccess: {
      first: falsySuccessFirst,
      second: falsySuccessSecond,
      executions: getFalsySuccessExecutions()
    },
    errorSameArgs: {
      first: failuresFromExit(errorSameArgsFirst),
      second: failuresFromExit(errorSameArgsSecond),
      executions: getErrorSameArgsExecutions()
    },
    errorDifferentArgs: {
      first: failuresFromExit(errorDifferentArgsFirst),
      second: failuresFromExit(errorDifferentArgsSecond),
      executions: getErrorDifferentArgsExecutions()
    },
    falsyError: {
      failures: failuresFromExit(falsyError),
      executions: getFalsyErrorExecutions()
    },
    composedCause: {
      pretty: prettyCauseFromExit(composedCause),
      executions: getComposedCauseExecutions()
    },
    identity: {
      stableFirst: identityStableFirst,
      stableSecond: identityStableSecond,
      freshFirst: identityFreshFirst,
      freshSecond: identityFreshSecond,
      executions: getIdentityExecutions()
    }
  }

  return <pre id="payload">{JSON.stringify(payload)}</pre>
}
