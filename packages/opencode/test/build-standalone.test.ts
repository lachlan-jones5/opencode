import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { $ } from "bun"
import path from "path"
import fs from "fs/promises"

const SCRIPT_PATH = path.resolve(import.meta.dir, "../script/build-standalone.ts")
const DIST_DIR = path.resolve(import.meta.dir, "../dist/standalone")

describe("build-standalone", () => {
  describe("help and arguments", () => {
    test("--help shows usage information", async () => {
      const result = await $`bun run ${SCRIPT_PATH} --help`.quiet().nothrow()
      const output = result.stdout.toString()

      expect(output).toContain("Build standalone OpenCode binaries")
      expect(output).toContain("--all")
      expect(output).toContain("--arm64")
      expect(output).toContain("--x64")
      expect(output).toContain("--linux")
      expect(output).toContain("--darwin")
      expect(output).toContain("--windows")
      expect(output).toContain("--skip-install")
      expect(result.exitCode).toBe(0)
    })

    test("-h shows usage information", async () => {
      const result = await $`bun run ${SCRIPT_PATH} -h`.quiet().nothrow()
      expect(result.stdout.toString()).toContain("Build standalone OpenCode binaries")
      expect(result.exitCode).toBe(0)
    })
  })

  describe("binary compilation", () => {
    beforeAll(async () => {
      await fs.rm(DIST_DIR, { recursive: true, force: true })
    })

    afterAll(async () => {
      await fs.rm(DIST_DIR, { recursive: true, force: true })
    })

    test(
      "builds binary for current platform",
      async () => {
        const result = await $`bun run ${SCRIPT_PATH} --skip-install`.quiet().nothrow()
        const output = result.stdout.toString()

        expect(result.exitCode).toBe(0)
        expect(output).toContain("Build complete")

        // Check binary was created
        const files = await fs.readdir(DIST_DIR).catch(() => [])
        expect(files.length).toBeGreaterThan(0)

        // Find the binary for current platform
        const os = process.platform === "win32" ? "windows" : process.platform
        const arch = process.arch
        const expectedName = `opencode-${os}-${arch}${process.platform === "win32" ? ".exe" : ""}`

        expect(files).toContain(expectedName)

        // Check binary is executable (on unix)
        if (process.platform !== "win32") {
          const binaryPath = path.join(DIST_DIR, expectedName)
          const stats = await fs.stat(binaryPath)
          expect(stats.mode & 0o111).toBeGreaterThan(0) // has execute permission
        }
      },
      { timeout: 300000 },
    )

    test(
      "compiled binary runs and shows version",
      async () => {
        const os = process.platform === "win32" ? "windows" : process.platform
        const arch = process.arch
        const binaryName = `opencode-${os}-${arch}${process.platform === "win32" ? ".exe" : ""}`
        const binaryPath = path.join(DIST_DIR, binaryName)

        // Check binary exists
        const exists = await fs
          .access(binaryPath)
          .then(() => true)
          .catch(() => false)
        if (!exists) {
          console.log("Skipping: binary not found (run previous test first)")
          return
        }

        const result = await $`${binaryPath} --version`.quiet().nothrow()
        expect(result.exitCode).toBe(0)

        const output = result.stdout.toString().trim()
        // Version should match pattern like "0.0.0-dev-YYYYMMDDHHMM" or semver
        expect(output).toMatch(/^\d+\.\d+\.\d+/)
      },
      { timeout: 30000 },
    )

    test(
      "compiled binary shows help",
      async () => {
        const os = process.platform === "win32" ? "windows" : process.platform
        const arch = process.arch
        const binaryName = `opencode-${os}-${arch}${process.platform === "win32" ? ".exe" : ""}`
        const binaryPath = path.join(DIST_DIR, binaryName)

        const exists = await fs
          .access(binaryPath)
          .then(() => true)
          .catch(() => false)
        if (!exists) {
          console.log("Skipping: binary not found")
          return
        }

        const result = await $`${binaryPath} --help`.quiet().nothrow()
        expect(result.exitCode).toBe(0)

        const output = result.stdout.toString()
        expect(output).toContain("opencode")
      },
      { timeout: 30000 },
    )
  })
})
