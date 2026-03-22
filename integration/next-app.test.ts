import { spawn } from "node:child_process"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { existsSync } from "node:fs"
import { once } from "node:events"
import { createServer } from "node:net"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.join(currentDir, "..", "fixtures", "next-app")

const decodeHtml = (value: string) =>
  value
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")

const extractPayload = (html: string, id = "payload") => {
  const match = html.match(new RegExp(`<pre id="${id}">([\\s\\S]*?)<\\/pre>`))
  if (!match) {
    throw new Error(`Could not find payload "${id}" in HTML:\n${html}`)
  }
  return JSON.parse(decodeHtml(match[1]))
}

const getAvailablePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a local port")))
        return
      }
      const { port } = address
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })

type RunResult = {
  stdout: string
  stderr: string
}

const runCommand = (cwd: string, args: ReadonlyArray<string>) =>
  new Promise<RunResult>((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd,
      env: {
        ...process.env,
        CI: "true",
        NEXT_TELEMETRY_DISABLED: "1"
      },
      stdio: "pipe"
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`pnpm ${args.join(" ")} failed with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    })
  })

const waitForExit = async(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals) => {
  child.kill(signal)
  const timer = setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL")
    }
  }, 5_000)
  try {
    await once(child, "exit")
  } finally {
    clearTimeout(timer)
  }
}

const waitForServer = async(baseUrl: string, child: ChildProcessWithoutNullStreams, output: () => string) => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next server exited early with code ${child.exitCode}\n${output()}`)
    }
    try {
      const response = await fetch(baseUrl)
      await response.text()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error(`Timed out waiting for Next server at ${baseUrl}\n${output()}`)
}

const ensureFixtureInstalled = async() => {
  if (existsSync(path.join(fixtureDir, "node_modules"))) {
    return
  }
  await runCommand(fixtureDir, ["install", "--no-frozen-lockfile"])
}

describe("real Next.js integration", () => {
  let server: ChildProcessWithoutNullStreams | undefined
  let port = 0
  let baseUrl = ""
  let serverOutput = ""

  beforeAll(async () => {
    await ensureFixtureInstalled()
    await runCommand(fixtureDir, ["exec", "next", "build"])

    port = await getAvailablePort()
    baseUrl = `http://127.0.0.1:${port}`

    server = spawn("pnpm", ["exec", "next", "start", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: fixtureDir,
      env: {
        ...process.env,
        CI: "true",
        NEXT_TELEMETRY_DISABLED: "1"
      },
      stdio: "pipe"
    })

    server.stdout.on("data", (chunk: Buffer | string) => {
      serverOutput += chunk.toString()
    })
    server.stderr.on("data", (chunk: Buffer | string) => {
      serverOutput += chunk.toString()
    })

    await waitForServer(baseUrl, server, () => serverOutput)
  })

  afterAll(async () => {
    if (server && server.exitCode === null) {
      await waitForExit(server, "SIGTERM")
    }
  })

  it("preserves reactCache behavior during a real server render", async () => {
    const response = await fetch(`${baseUrl}/behaviors`)

    expect(response.status).toBe(200)

    const payload = extractPayload(await response.text())

    expect(payload.sameArgs).toEqual({
      first: { id: "same", run: 1 },
      second: { id: "same", run: 1 },
      executions: 1
    })
    expect(payload.differentArgs).toEqual({
      first: { id: "a", run: 1 },
      second: { id: "b", run: 2 },
      executions: 2
    })
    expect(payload.concurrent).toEqual({
      first: { id: "shared", run: 1 },
      second: { id: "shared", run: 1 },
      executions: 1
    })
    expect(payload.context).toEqual({
      first: { run: 1, value: 111 },
      second: { run: 1, value: 111 },
      executions: 1
    })
    expect(payload.span).toEqual({
      first: { run: 1, span: "outer-span" },
      second: { run: 1, span: "outer-span" },
      executions: 1
    })
    expect(payload.falsySuccess).toEqual({
      first: false,
      second: false,
      executions: 1
    })
    expect(payload.errorSameArgs).toEqual({
      first: ["boom:x"],
      second: ["boom:x"],
      executions: 1
    })
    expect(payload.errorDifferentArgs).toEqual({
      first: ["boom:a"],
      second: ["boom:b"],
      executions: 2
    })
    expect(payload.falsyError).toEqual({
      failures: [""],
      executions: 1
    })
    expect(payload.composedCause.executions).toBe(1)
    expect(payload.composedCause.pretty).toContain("boom")
    expect(payload.composedCause.pretty).toContain("cleanup")
    expect(payload.identity).toEqual({
      stableFirst: { id: "stable", run: 1 },
      stableSecond: { id: "stable", run: 1 },
      freshFirst: { id: "fresh", run: 2 },
      freshSecond: { id: "fresh", run: 3 },
      executions: 3
    })
  })

  it("isolates the cache between separate requests", async () => {
    const first = await fetch(`${baseUrl}/request-isolation`)
    const second = await fetch(`${baseUrl}/request-isolation`)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    expect(extractPayload(await first.text())).toEqual({
      first: { id: "request", run: 1 },
      second: { id: "request", run: 1 },
      executions: 1
    })
    expect(extractPayload(await second.text())).toEqual({
      first: { id: "request", run: 2 },
      second: { id: "request", run: 2 },
      executions: 2
    })
  })

  it("deduplicates shared work between a nested layout and page", async () => {
    const response = await fetch(`${baseUrl}/tree`)

    expect(response.status).toBe(200)

    const html = await response.text()
    expect(extractPayload(html, "layout-payload")).toEqual({ id: "layout-page", run: 1 })
    expect(extractPayload(html, "page-payload")).toEqual({ id: "layout-page", run: 1 })
  })

  it("does not memoize in a route handler outside a React server render", async () => {
    const response = await fetch(`${baseUrl}/api/no-react-cache`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      first: { id: "route", run: 1 },
      second: { id: "route", run: 2 },
      executions: 2
    })
  })
})
