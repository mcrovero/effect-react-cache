import * as path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  outputFileTracingRoot: path.join(process.cwd(), "../..")
}

export default nextConfig
