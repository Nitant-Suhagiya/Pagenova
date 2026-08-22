import 'fake-indexeddb/auto'

// pdfjs-dist's canvas renderer references DOMMatrix at module scope, but neither
// node nor jsdom implements it. Stub a minimal identity matrix so importing the
// document parser (via useAttachments) doesn't crash in component tests. Keeping
// this here means every future component test inherits it instead of
// rediscovering the same import-time crash.
if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrix {
    m11 = 1
    m12 = 0
    m13 = 0
    m14 = 0
    m21 = 0
    m22 = 1
    m23 = 0
    m24 = 0
    m31 = 0
    m32 = 0
    m33 = 1
    m34 = 0
    m41 = 0
    m42 = 0
    m43 = 0
    m44 = 1
    a = 1
    b = 0
    c = 0
    d = 1
    e = 0
    f = 0
    static fromMatrix(): DOMMatrix { return new DOMMatrix() }
    static fromFloat32Array(): DOMMatrix { return new DOMMatrix() }
    static fromFloat64Array(): DOMMatrix { return new DOMMatrix() }
    translate(): DOMMatrix { return this }
    scale(): DOMMatrix { return this }
    multiply(): DOMMatrix { return this }
    invert(): DOMMatrix { return this }
  }
  ;(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix
}
