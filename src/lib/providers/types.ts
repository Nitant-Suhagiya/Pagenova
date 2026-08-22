export type MessageRole = 'system' | 'user' | 'assistant'

export type ContentPart =
  | { type: 'text'; text: string; cache?: boolean }
  | { type: 'image'; base64: string; mimeType: string }

export interface ChatMessage {
  role: MessageRole
  content: ContentPart[]
}

export interface StreamChunk {
  delta: string
  done: boolean
}

export interface ModelInfo {
  name: string
  supportsVision: boolean
}

export interface LLMProvider {
  id: string
  listModels(): Promise<ModelInfo[]>
  chatStream(
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk>
}

export interface ProviderSettings {
  baseUrl?: string
  apiKey?: string
}
