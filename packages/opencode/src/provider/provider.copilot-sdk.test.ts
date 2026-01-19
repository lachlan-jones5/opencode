/**
 * GitHub Copilot Provider SDK Fallback Tests
 *
 * Tests for the github-copilot and github-copilot-enterprise provider
 * custom loaders to ensure they work with both:
 * 1. Custom SDK with .chat() method
 * 2. Standard @ai-sdk/openai-compatible with .chatModel() method
 */

import { describe, it, expect } from "bun:test"

// Mock the shouldUseCopilotResponsesApi function
function isGpt5OrLater(modelID: string): boolean {
  const match = modelID.match(/gpt-(\d+)/)
  if (!match) {
    return false
  }
  return Number(match[1]) >= 5
}

function shouldUseCopilotResponsesApi(modelID: string): boolean {
  return isGpt5OrLater(modelID) && !modelID.startsWith("gpt-5-mini")
}

// Define the custom loader logic (extracted from provider.ts)
async function getGitHubCopilotModelLoader() {
  return {
    autoload: false,
    async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
      if (shouldUseCopilotResponsesApi(modelID)) {
        return sdk.responses(modelID)
      }
      // Fallback: try .chat() first (custom SDK), then .chatModel() (standard @ai-sdk/openai-compatible)
      return typeof sdk.chat === "function" ? sdk.chat(modelID) : sdk.chatModel(modelID)
    },
    options: {},
  }
}

describe("GitHub Copilot SDK Fallback", () => {
  describe("Custom SDK with .chat() method", () => {
    it("uses .chat() for non-GPT-5 models when available", async () => {
      const mockSdk = {
        chat: (modelID: string) => ({ type: "chat", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "gpt-4o", {})

      expect(result).toEqual({ type: "chat", model: "gpt-4o" })
    })

    it("uses .chat() for Claude models when available", async () => {
      const mockSdk = {
        chat: (modelID: string) => ({ type: "chat", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "claude-sonnet-4.5", {})

      expect(result).toEqual({ type: "chat", model: "claude-sonnet-4.5" })
    })

    it("uses .responses() for GPT-5+ models", async () => {
      const mockSdk = {
        chat: (modelID: string) => ({ type: "chat", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "gpt-5", {})

      expect(result).toEqual({ type: "responses", model: "gpt-5" })
    })

    it("uses .chat() for gpt-5-mini (exception)", async () => {
      const mockSdk = {
        chat: (modelID: string) => ({ type: "chat", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "gpt-5-mini", {})

      expect(result).toEqual({ type: "chat", model: "gpt-5-mini" })
    })
  })

  describe("Standard SDK with .chatModel() method (fallback)", () => {
    it("uses .chatModel() when .chat() is not available", async () => {
      const mockSdk = {
        chatModel: (modelID: string) => ({ type: "chatModel", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "gpt-4o", {})

      expect(result).toEqual({ type: "chatModel", model: "gpt-4o" })
    })

    it("uses .chatModel() for Claude models when .chat() is not available", async () => {
      const mockSdk = {
        chatModel: (modelID: string) => ({ type: "chatModel", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "claude-opus-4.5", {})

      expect(result).toEqual({ type: "chatModel", model: "claude-opus-4.5" })
    })

    it("still uses .responses() for GPT-5+ models", async () => {
      const mockSdk = {
        chatModel: (modelID: string) => ({ type: "chatModel", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "gpt-5-pro", {})

      expect(result).toEqual({ type: "responses", model: "gpt-5-pro" })
    })
  })

  describe("Edge cases", () => {
    it("prefers .chat() over .chatModel() when both exist", async () => {
      const mockSdk = {
        chat: (modelID: string) => ({ type: "chat", model: modelID }),
        chatModel: (modelID: string) => ({ type: "chatModel", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "gpt-4o", {})

      expect(result).toEqual({ type: "chat", model: "gpt-4o" })
    })

    it("handles model IDs with variants", async () => {
      const mockSdk = {
        chatModel: (modelID: string) => ({ type: "chatModel", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "gpt-4o-2024-11-20", {})

      expect(result).toEqual({ type: "chatModel", model: "gpt-4o-2024-11-20" })
    })

    it("correctly identifies gpt-6 as GPT-5+", async () => {
      const mockSdk = {
        chatModel: (modelID: string) => ({ type: "chatModel", model: modelID }),
        responses: (modelID: string) => ({ type: "responses", model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      const result = await loader.getModel(mockSdk, "gpt-6", {})

      expect(result).toEqual({ type: "responses", model: "gpt-6" })
    })
  })

  describe("typeof check behavior", () => {
    it("correctly detects when .chat is a function", async () => {
      const mockSdk = {
        chat: (modelID: string) => ({ model: modelID }),
        responses: (modelID: string) => ({ model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      
      // Verify typeof check works as expected
      expect(typeof mockSdk.chat).toBe("function")
      
      const result = await loader.getModel(mockSdk, "claude-sonnet-4.5", {})
      expect(result.model).toBe("claude-sonnet-4.5")
    })

    it("correctly detects when .chat is undefined", async () => {
      const mockSdk = {
        chatModel: (modelID: string) => ({ model: modelID }),
        responses: (modelID: string) => ({ model: modelID }),
      }

      const loader = await getGitHubCopilotModelLoader()
      
      // Verify typeof check works as expected
      expect(typeof (mockSdk as any).chat).toBe("undefined")
      
      const result = await loader.getModel(mockSdk, "claude-opus-4.5", {})
      expect(result.model).toBe("claude-opus-4.5")
    })
  })
})

describe("shouldUseCopilotResponsesApi logic", () => {
  it("returns true for gpt-5", () => {
    expect(shouldUseCopilotResponsesApi("gpt-5")).toBe(true)
  })

  it("returns true for gpt-5-pro", () => {
    expect(shouldUseCopilotResponsesApi("gpt-5-pro")).toBe(true)
  })

  it("returns false for gpt-5-mini", () => {
    expect(shouldUseCopilotResponsesApi("gpt-5-mini")).toBe(false)
  })

  it("returns false for gpt-4o", () => {
    expect(shouldUseCopilotResponsesApi("gpt-4o")).toBe(false)
  })

  it("returns false for claude models", () => {
    expect(shouldUseCopilotResponsesApi("claude-sonnet-4.5")).toBe(false)
    expect(shouldUseCopilotResponsesApi("claude-opus-4.5")).toBe(false)
  })

  it("returns true for gpt-6 and higher", () => {
    expect(shouldUseCopilotResponsesApi("gpt-6")).toBe(true)
    expect(shouldUseCopilotResponsesApi("gpt-10")).toBe(true)
  })
})
