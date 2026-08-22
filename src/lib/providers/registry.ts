import { OllamaProvider } from './ollama'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { OpenAICompatibleProvider } from './openaiCompatible'
import type { LLMProvider, ProviderSettings } from './types'

export function providerSupportsVision(providerId: string, modelName: string): boolean {
  if (providerId === 'ollama') {
    return /(llava|bakllava|llama3\.2-vision|gemma3|qwen2-vl|qwen3\.5|moondream|vision)/i.test(modelName)
  }

  if (providerId === 'openai') {
    return /gpt-4o|gpt-4\.1|o1|o3/i.test(modelName)
  }

  if (providerId === 'anthropic') return /claude/i.test(modelName)
  if (providerId === 'gemini') return /gemini/i.test(modelName)
  if (providerId === 'other') return /vision|vl|gpt-4o|qwen|llava/i.test(modelName)

  return false
}

export function getProvider(providerId: string, settings: ProviderSettings = {}): LLMProvider {
  switch (providerId) {
    case 'ollama':
      return new OllamaProvider(settings.baseUrl ?? 'http://localhost:11434')
    case 'openai':
      return new OpenAIProvider({ apiKey: settings.apiKey ?? '', baseUrl: settings.baseUrl ?? 'https://api.openai.com' })
    case 'anthropic':
      return new AnthropicProvider(settings.apiKey ?? '', settings.baseUrl)
    case 'gemini':
      return new GeminiProvider(settings.apiKey ?? '', settings.baseUrl)
    case 'other':
      return new OpenAICompatibleProvider({ apiKey: settings.apiKey ?? '', baseUrl: settings.baseUrl ?? '' })
    default:
      throw new Error(`Unsupported provider: ${providerId}`)
  }
}
