export interface Chunk {
  id: string
  sourceId: string
  title: string
  text: string
  embedding: Float32Array
}

export type EmbeddingBackend = 'browser' | 'ollama'

export interface RetrievedChunk {
  chunk: Chunk
  score: number
}
