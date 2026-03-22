---
"@mcrovero/effect-react-cache": patch
---

Fix `reactCache` to preserve full `Exit` information, including falsy values and composed causes, instead of collapsing failures into a lossy intermediate shape.

Clarify the React and Next.js caching semantics in the docs and add real Next.js integration coverage for request scoping, cross-component deduplication, and non-render route-handler behavior.
