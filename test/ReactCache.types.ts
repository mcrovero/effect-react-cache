import { Effect } from "effect"
import type * as Scope from "effect/Scope"
import { reactCache } from "../src/ReactCache.js"

const cachedNoScope = reactCache((id: string, attempt: number) =>
  Effect.succeed({ id, attempt } as const))

const sameSignature: (
  id: string,
  attempt: number
) => Effect.Effect<{ readonly id: string; readonly attempt: number }, never, never> = cachedNoScope

void sameSignature("user-1", 1)

const requiresScope = (): Effect.Effect<string, never, Scope.Scope> =>
  Effect.succeed("scoped") as Effect.Effect<string, never, Scope.Scope>

// @ts-expect-error Effects requiring Scope must not be cacheable.
reactCache(requiresScope)
