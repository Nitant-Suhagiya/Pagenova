export type MessageType =
  | 'CHAT_REQUEST'
  | 'STOP_GENERATION'
  | 'CHAT_CHUNK'
  | 'CHAT_DONE'
  | 'CHAT_ERROR'
  | 'CONTEXT_INFO'
  | 'PULL_MODEL'
  | 'PULL_MODEL_PROGRESS'
  | 'PULL_MODEL_DONE'
  | 'PULL_MODEL_ERROR'
  | 'CAPTURE_SCREENSHOT'

export interface BaseMessage {
  type: MessageType
}

export interface ChatRequestMessage extends BaseMessage {
  type: 'CHAT_REQUEST'
  text: string
  provider?: string
  model?: string
  tabIds?: number[]
  images?: { base64: string; mimeType: string }[]
  docs?: { name: string; text: string }[]
  webSearch?: boolean
  visionSupported?: boolean
  history?: Array<{ role: 'user' | 'assistant'; content: string; images?: { base64: string; mimeType: string }[] }>
}

export interface StopGenerationMessage extends BaseMessage {
  type: 'STOP_GENERATION'
}

export interface ChatChunkMessage extends BaseMessage {
  type: 'CHAT_CHUNK'
  delta: string
}

export interface ChatDoneMessage extends BaseMessage {
  type: 'CHAT_DONE'
}

export interface ChatErrorMessage extends BaseMessage {
  type: 'CHAT_ERROR'
  error: string
}

export interface ContextInfoMessage extends BaseMessage {
  type: 'CONTEXT_INFO'
  mode: 'full' | 'retrieval'
  sources: string[]
  truncated: boolean
}

export interface PullModelMessage extends BaseMessage {
  type: 'PULL_MODEL'
  model: string
}

export interface PullModelProgressMessage extends BaseMessage {
  type: 'PULL_MODEL_PROGRESS'
  status: string
  completed?: number
  total?: number
}

export interface PullModelDoneMessage extends BaseMessage {
  type: 'PULL_MODEL_DONE'
}

export interface PullModelErrorMessage extends BaseMessage {
  type: 'PULL_MODEL_ERROR'
  error: string
}

export interface CaptureScreenshotMessage extends BaseMessage {
  type: 'CAPTURE_SCREENSHOT'
  sourceTabId?: number
}

export type ExtensionMessage =
  | ChatRequestMessage
  | StopGenerationMessage
  | ChatChunkMessage
  | ChatDoneMessage
  | ChatErrorMessage
  | ContextInfoMessage
  | PullModelMessage
  | PullModelProgressMessage
  | PullModelDoneMessage
  | PullModelErrorMessage
  | CaptureScreenshotMessage
