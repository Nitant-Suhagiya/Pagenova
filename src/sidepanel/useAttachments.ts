import { useEffect, useState } from 'react'

import { encodeImage } from '../lib/images/encode'
import { extractDocumentText } from '../lib/rag/documents'

export interface PendingImage {
  name: string
  dataUrl: string
}

export interface PendingDoc {
  name: string
  text: string | null
}

export interface PageImage {
  dataUrl: string
  alt: string
}

const screenshotPermission = { origins: ['<all_urls>'] }

export async function requestScreenshotAccess(): Promise<boolean> {
  if (await chrome.permissions.contains(screenshotPermission)) return true
  return chrome.permissions.request(screenshotPermission)
}

export function useAttachments() {
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
  const [pageImages, setPageImages] = useState<PageImage[]>([])
  const [pageImagesOpen, setPageImagesOpen] = useState(false)

  useEffect(() => {
    void chrome.storage.local.get('pendingImage').then((stored) => {
      const pending = stored.pendingImage as PendingImage | undefined
      if (pending?.dataUrl) {
        void encodeImage(pending.dataUrl).then((dataUrl) => {
          setPendingImages((cur) => [...cur, { ...pending, dataUrl }])
        }).catch(() => undefined)
        void chrome.storage.local.remove('pendingImage')
      }
    })
  }, [])

  const clearAttachments = () => {
    setPendingImages([])
    setPendingDocs([])
  }

  const addImages = (files: Iterable<File> | null) => {
    if (!files) return
    Array.from(files).forEach(async (file) => {
      const dataUrl = await encodeImage(file)
      setPendingImages((cur) => [...cur, { name: file.name, dataUrl }])
    })
  }

  const addDocs = async (files: Iterable<File> | null): Promise<string | null> => {
    if (!files) return null
    const items = await Promise.all(Array.from(files).map(async (f) => ({
      name: f.name,
      text: await extractDocumentText(f),
    })))
    const parsed = items.filter((d): d is { name: string; text: string } => d.text != null)
    const failed = items.filter((d) => d.text == null)
    setPendingDocs((cur) => [...cur, ...parsed.map((d) => ({ name: d.name, text: d.text }))])
    return failed.length
      ? `${failed.map((f) => f.name).join(', ')} not supported or exceeds the 10 MB limit (PDF/TXT/CSV/MD/DOCX only — legacy .doc is not).`
      : null
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter((it) => it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f != null)
    if (imageFiles.length) {
      e.preventDefault()
      imageFiles.forEach(async (f) => {
        const dataUrl = await encodeImage(f)
        setPendingImages((cur) => [...cur, { name: 'pasted-image.png', dataUrl }])
      })
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const imageFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length) addImages(imageFiles)
  }

  const removeImage = (index: number) => setPendingImages((cur) => cur.filter((_, i) => i !== index))
  const removeDoc = (index: number) => setPendingDocs((cur) => cur.filter((_, i) => i !== index))

  const addPageImage = (name: string, dataUrl: string) => {
    void encodeImage(dataUrl).then((encoded) => {
      setPendingImages((cur) => [...cur, { name, dataUrl: encoded }])
    }).catch(() => undefined)
  }

  const captureScreenshot = async (sourceTabId?: number): Promise<string | null> => {
    if (!await requestScreenshotAccess()) {
      return 'Allow Pagenova to access all sites to capture the active tab after you switch tabs.'
    }
    const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', ...(sourceTabId != null ? { sourceTabId } : {}) }).catch(() => null)
    if (res?.ok && typeof res.dataUrl === 'string') {
      const dataUrl = await encodeImage(res.dataUrl)
      setPendingImages((cur) => [...cur, { name: 'screenshot.png', dataUrl }])
      return null
    }
    return res?.error ?? 'Could not capture screenshot. Try Screenshot again.'
  }

  const loadPageImages = async () => {
    const res = await chrome.runtime.sendMessage({ type: 'FETCH_PAGE_IMAGES' }).catch(() => null)
    if (Array.isArray(res)) {
      setPageImages(res)
      setPageImagesOpen(true)
    }
  }

  return {
    pendingImages, pendingDocs, pageImages, pageImagesOpen, setPageImagesOpen,
    addImages, addDocs, removeImage, removeDoc, addPageImage,
    captureScreenshot, handlePaste, handleDrop, loadPageImages, clearAttachments,
  }
}
