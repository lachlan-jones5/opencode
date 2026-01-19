#!/usr/bin/env bun

/**
 * Build standalone binaries for distribution (no git history, single file).
 *
 * Usage:
 *   bun run script/build-standalone.ts              # Build for current platform
 *   bun run script/build-standalone.ts --all        # Build for all platforms
 *   bun run script/build-standalone.ts --arm64      # Build ARM64 (linux + darwin)
 *   bun run script/build-standalone.ts --x64        # Build x64 (linux + darwin)
 *   bun run script/build-standalone.ts --linux      # Build Linux (arm64 + x64)
 *   bun run script/build-standalone.ts --darwin     # Build macOS (arm64 + x64)
 *   bun run script/build-standalone.ts --windows    # Build Windows (x64)
 *
 * Output:
 *   dist/standalone/opencode-<os>-<arch>[.exe]
 */

import solidPlugin from "../node_modules/@opentui/solid/scripts/solid-plugin"
import path from "path"
import fs from "fs"
import { $ } from "bun"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

import pkg from "../package.json"
import { Script } from "@opencode-ai/script"

type Target = {
  os: "linux" | "darwin" | "win32"
  arch: "arm64" | "x64"
  abi?: "musl" | "glibc"
}

const ALL_TARGETS: Target[] = [
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "arm64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl" },
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "win32", arch: "x64" },
]

function parseArgs(): Target[] {
  const args = process.argv.slice(2)

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Build standalone OpenCode binaries.

Usage:
  bun run script/build-standalone.ts [options]

Options:
  --all           Build all platforms (linux, darwin, windows)
  --arm64         Build ARM64 binaries (linux + darwin)
  --x64           Build x64 binaries (linux + darwin + windows)
  --linux         Build Linux binaries (arm64 + x64, glibc + musl)
  --darwin        Build macOS binaries (arm64 + x64)
  --windows       Build Windows binaries (x64)
  --musl          Include musl builds for Linux (alpine, etc.)
  --skip-install  Skip installing cross-platform deps (faster rebuilds)
  -h, --help      Show this help

Examples:
  # Build for your current machine
  bun run script/build-standalone.ts

  # Build ARM64 for both Linux and macOS (Pi + Mac M1/M2)
  bun run script/build-standalone.ts --arm64

  # Build everything
  bun run script/build-standalone.ts --all

Output:
  dist/standalone/opencode-linux-arm64
  dist/standalone/opencode-linux-x64
  dist/standalone/opencode-darwin-arm64
  dist/standalone/opencode-darwin-x64
  dist/standalone/opencode-windows-x64.exe
`)
    process.exit(0)
  }

  if (args.includes("--all")) {
    return ALL_TARGETS
  }

  const includeMusl = args.includes("--musl")
  let targets: Target[] = []

  if (args.includes("--arm64")) {
    targets.push({ os: "linux", arch: "arm64" })
    targets.push({ os: "darwin", arch: "arm64" })
    if (includeMusl) targets.push({ os: "linux", arch: "arm64", abi: "musl" })
  }

  if (args.includes("--x64")) {
    targets.push({ os: "linux", arch: "x64" })
    targets.push({ os: "darwin", arch: "x64" })
    targets.push({ os: "win32", arch: "x64" })
    if (includeMusl) targets.push({ os: "linux", arch: "x64", abi: "musl" })
  }

  if (args.includes("--linux")) {
    targets.push({ os: "linux", arch: "arm64" })
    targets.push({ os: "linux", arch: "x64" })
    if (includeMusl) {
      targets.push({ os: "linux", arch: "arm64", abi: "musl" })
      targets.push({ os: "linux", arch: "x64", abi: "musl" })
    }
  }

  if (args.includes("--darwin")) {
    targets.push({ os: "darwin", arch: "arm64" })
    targets.push({ os: "darwin", arch: "x64" })
  }

  if (args.includes("--windows")) {
    targets.push({ os: "win32", arch: "x64" })
  }

  // Default: build for current platform
  if (targets.length === 0) {
    const currentOs = process.platform as "linux" | "darwin" | "win32"
    const currentArch = process.arch as "arm64" | "x64"
    targets.push({ os: currentOs, arch: currentArch })
  }

  // Dedupe
  const seen = new Set<string>()
  return targets.filter((t) => {
    const key = `${t.os}-${t.arch}-${t.abi ?? "default"}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function targetName(t: Target): string {
  const parts = [t.os === "win32" ? "windows" : t.os, t.arch]
  if (t.abi) parts.push(t.abi)
  return parts.join("-")
}

function binaryName(t: Target): string {
  const base = `opencode-${targetName(t)}`
  return t.os === "win32" ? `${base}.exe` : base
}

async function installDeps() {
  console.log("Installing cross-platform dependencies...")
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
}

async function buildTarget(target: Target): Promise<string> {
  const name = targetName(target)
  const outfile = `dist/standalone/${binaryName(target)}`

  console.log(`\n📦 Building ${name}...`)

  const parserWorker = fs.realpathSync(path.resolve(dir, "./node_modules/@opentui/core/parser.worker.js"))
  const workerPath = "./src/cli/cmd/tui/worker.ts"

  const bunfsRoot = target.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const workerRelativePath = path.relative(dir, parserWorker).replaceAll("\\", "/")

  const result = await Bun.build({
    conditions: ["browser"],
    tsconfig: "./tsconfig.json",
    plugins: [solidPlugin],
    sourcemap: "none", // No sourcemaps for standalone distribution
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      //@ts-ignore
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      //@ts-ignore - Bun types don't include all valid targets
      target: `bun-${target.os === "win32" ? "windows" : target.os}-${target.arch}`,
      outfile,
      execArgv: [`--user-agent=opencode/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
    entrypoints: ["./src/index.ts", parserWorker, workerPath],
    define: {
      OPENCODE_VERSION: `'${Script.version}'`,
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + workerRelativePath,
      OPENCODE_WORKER_PATH: workerPath,
      OPENCODE_CHANNEL: `'standalone'`,
      OPENCODE_LIBC: target.os === "linux" ? `'${target.abi ?? "glibc"}'` : "",
    },
  })

  if (!result.success) {
    console.error(`❌ Failed to build ${name}:`, result.logs)
    throw new Error(`Build failed for ${name}`)
  }

  const stats = await Bun.file(outfile).stat()
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1)
  console.log(`✓ Built ${outfile} (${sizeMB} MB)`)

  return outfile
}

async function main() {
  const targets = parseArgs()
  const skipInstall = process.argv.includes("--skip-install")

  console.log(`\n🔨 Building standalone binaries for: ${targets.map(targetName).join(", ")}\n`)

  await $`rm -rf dist/standalone`
  await $`mkdir -p dist/standalone`

  if (!skipInstall) {
    await installDeps()
  } else {
    console.log("Skipping dependency install (--skip-install)")
  }

  const outputs: string[] = []
  for (const target of targets) {
    outputs.push(await buildTarget(target))
  }

  console.log("\n" + "=".repeat(50))
  console.log("✅ Build complete! Standalone binaries:")
  console.log("=".repeat(50))
  for (const out of outputs) {
    console.log(`   ${out}`)
  }
  console.log("\nThese binaries are self-contained and can be distributed without git history.")
  console.log("Copy them anywhere and run directly.\n")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
