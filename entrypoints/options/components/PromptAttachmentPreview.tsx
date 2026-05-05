import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, FolderOpen, HardDrive, ImageIcon, Loader2, X } from 'lucide-react'

import type { PromptAttachment } from '@/utils/types'
import { formatFileSize, isImageAttachment } from '@/utils/attachments/metadata'
import { createImageThumbnailDataUrl } from '@/utils/attachments/imageThumbnail'
import {
  getAttachmentRootHandle,
  getFileFromAttachmentRoot,
  verifyReadWritePermission,
  pickAndStoreAttachmentRoot,
  useInternalAttachmentStorage,
} from '@/utils/attachments/fileSystem'
import { t } from '@/utils/i18n'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface PromptAttachmentPreviewProps {
  attachments?: PromptAttachment[]
  compact?: boolean
}

interface ImagePreviewState {
  thumbnailUrl?: string
  fullUrl?: string
  objectUrl?: string
  error?: string
  isLoadingFull?: boolean
}

const EMPTY_ATTACHMENTS: PromptAttachment[] = []
const MAX_RUNTIME_THUMBNAIL_CACHE_ENTRIES = 80
const runtimeThumbnailCache = new Map<string, ImagePreviewState | Promise<ImagePreviewState>>()

const getAttachmentCacheKey = (attachment: PromptAttachment): string => (
  `${attachment.relativePath}:${attachment.size}:${attachment.createdAt}`
)

const getCachedRuntimeThumbnail = (
  cacheKey: string
): ImagePreviewState | Promise<ImagePreviewState> | undefined => {
  const cached = runtimeThumbnailCache.get(cacheKey)

  if (cached) {
    runtimeThumbnailCache.delete(cacheKey)
    runtimeThumbnailCache.set(cacheKey, cached)
  }

  return cached
}

const setRuntimeThumbnailCache = (
  cacheKey: string,
  value: ImagePreviewState | Promise<ImagePreviewState>
) => {
  if (runtimeThumbnailCache.has(cacheKey)) {
    runtimeThumbnailCache.delete(cacheKey)
  }

  runtimeThumbnailCache.set(cacheKey, value)

  while (runtimeThumbnailCache.size > MAX_RUNTIME_THUMBNAIL_CACHE_ENTRIES) {
    const oldestKey = runtimeThumbnailCache.keys().next().value
    if (!oldestKey) break
    runtimeThumbnailCache.delete(oldestKey)
  }
}

let lastRootPermissionFailed = false

const getAuthorizedRoot = async () => {
  const root = await getAttachmentRootHandle()
  const hasPermission = root ? await verifyReadWritePermission(root) : false

  if (!root || !hasPermission) {
    lastRootPermissionFailed = true
    throw new Error(t('attachmentPermissionLost'))
  }

  lastRootPermissionFailed = false
  return root
}

const loadRuntimeThumbnail = async (attachment: PromptAttachment): Promise<ImagePreviewState> => {
  const cacheKey = getAttachmentCacheKey(attachment)
  const cached = getCachedRuntimeThumbnail(cacheKey)

  if (cached) {
    return await cached
  }

  const promise = (async (): Promise<ImagePreviewState> => {
    const root = await getAuthorizedRoot()
    const file = await getFileFromAttachmentRoot(root, attachment.relativePath)
    const thumbnailDataUrl = await createImageThumbnailDataUrl(file)

    if (thumbnailDataUrl) {
      return { thumbnailUrl: thumbnailDataUrl }
    }

    const objectUrl = URL.createObjectURL(file)
    return { thumbnailUrl: objectUrl, fullUrl: objectUrl, objectUrl }
  })()

  setRuntimeThumbnailCache(cacheKey, promise)

  try {
    const result = await promise

    if (result.objectUrl) {
      if (runtimeThumbnailCache.get(cacheKey) === promise) {
        runtimeThumbnailCache.delete(cacheKey)
      }
    } else if (runtimeThumbnailCache.get(cacheKey) === promise) {
      setRuntimeThumbnailCache(cacheKey, result)
    }

    return result
  } catch (error) {
    if (runtimeThumbnailCache.get(cacheKey) === promise) {
      runtimeThumbnailCache.delete(cacheKey)
    }
    throw error
  }
}

const PromptAttachmentPreview: React.FC<PromptAttachmentPreviewProps> = ({
  attachments,
  compact = false,
}) => {
  const safeAttachments = attachments ?? EMPTY_ATTACHMENTS
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const [imagePreviews, setImagePreviews] = useState<Record<string, ImagePreviewState>>({})
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [needsReauthorization, setNeedsReauthorization] = useState(false)
  const [isReauthorizing, setIsReauthorizing] = useState(false)
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0)

  const getPreview = (attachment: PromptAttachment): ImagePreviewState | undefined => {
    const loadedPreview = imagePreviews[attachment.id]

    if (attachment.thumbnailDataUrl) {
      return {
        ...loadedPreview,
        thumbnailUrl: attachment.thumbnailDataUrl,
      }
    }

    return loadedPreview
  }

  const viewableImages = useMemo(() => (
    safeAttachments
      .filter(isImageAttachment)
      .map((attachment) => {
        const preview = getPreview(attachment)
        return {
          attachment,
          url: preview?.fullUrl || preview?.thumbnailUrl,
          isLoadingFull: preview?.isLoadingFull,
        }
      })
      .filter((item): item is { attachment: PromptAttachment; url: string; isLoadingFull: boolean | undefined } => Boolean(item.url))
  ), [safeAttachments, imagePreviews])

  const activeImageIndex = activeImageId
    ? viewableImages.findIndex((item) => item.attachment.id === activeImageId)
    : -1
  const activeImage = activeImageIndex >= 0 ? viewableImages[activeImageIndex] : null

  const loadFullImage = async (attachment: PromptAttachment) => {
    const currentPreview = getPreview(attachment)
    if (currentPreview?.fullUrl || currentPreview?.isLoadingFull) return

    setImagePreviews((current) => ({
      ...current,
      [attachment.id]: {
        ...current[attachment.id],
        thumbnailUrl: attachment.thumbnailDataUrl || current[attachment.id]?.thumbnailUrl,
        isLoadingFull: true,
      },
    }))

    try {
      const root = await getAuthorizedRoot()
      const file = await getFileFromAttachmentRoot(root, attachment.relativePath)
      const fullUrl = URL.createObjectURL(file)
      objectUrlsRef.current.add(fullUrl)

      setImagePreviews((current) => ({
        ...current,
        [attachment.id]: {
          ...current[attachment.id],
          thumbnailUrl: attachment.thumbnailDataUrl || current[attachment.id]?.thumbnailUrl,
          fullUrl,
          isLoadingFull: false,
        },
      }))
    } catch {
      if (lastRootPermissionFailed) {
        setNeedsReauthorization(true)
      }
      setImagePreviews((current) => ({
        ...current,
        [attachment.id]: {
          ...current[attachment.id],
          thumbnailUrl: attachment.thumbnailDataUrl || current[attachment.id]?.thumbnailUrl,
          error: t('attachmentPermissionLost'),
          isLoadingFull: false,
        },
      }))
    }
  }

  const openImageViewer = (attachment: PromptAttachment) => {
    setActiveImageId(attachment.id)
    void loadFullImage(attachment)
  }

  const showPreviousImage = () => {
    if (viewableImages.length === 0 || activeImageIndex < 0) return
    const previousIndex = (activeImageIndex - 1 + viewableImages.length) % viewableImages.length
    const previousAttachment = viewableImages[previousIndex].attachment
    setActiveImageId(previousAttachment.id)
    void loadFullImage(previousAttachment)
  }

  const showNextImage = () => {
    if (viewableImages.length === 0 || activeImageIndex < 0) return
    const nextIndex = (activeImageIndex + 1) % viewableImages.length
    const nextAttachment = viewableImages[nextIndex].attachment
    setActiveImageId(nextAttachment.id)
    void loadFullImage(nextAttachment)
  }

  const handleReauthorizeExternal = async () => {
    if (isReauthorizing) return
    setIsReauthorizing(true)
    try {
      await pickAndStoreAttachmentRoot()
      setNeedsReauthorization(false)
      setImagePreviews({})
      setPreviewRefreshKey((k) => k + 1)
    } catch (err) {
      console.error("Error reauthorizing attachment directory:", err)
    } finally {
      setIsReauthorizing(false)
    }
  }

  const handleSwitchToInternal = async () => {
    if (isReauthorizing) return

    if (safeAttachments.length > 0) {
      alert(t('switchToInternalStorageBlockedByAttachments'))
      return
    }

    setIsReauthorizing(true)
    try {
      await useInternalAttachmentStorage()
      setNeedsReauthorization(false)
      setImagePreviews({})
      setPreviewRefreshKey((k) => k + 1)
    } catch (err) {
      console.error("Error switching to internal storage:", err)
    } finally {
      setIsReauthorizing(false)
    }
  }

  useEffect(() => {
    const imageAttachments = safeAttachments.filter((attachment) => (
      isImageAttachment(attachment) && !attachment.thumbnailDataUrl
    ))
    const objectUrls: string[] = []
    let canceled = false

    if (imageAttachments.length === 0) {
      setImagePreviews((current) => {
        const nextEntries = Object.entries(current).filter(([id, preview]) => (
          safeAttachments.some((attachment) => attachment.id === id) && (preview.fullUrl || preview.isLoadingFull)
        ))
        return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries)
      })
      return
    }

    const loadPreviews = async () => {
      const nextPreviews: Record<string, ImagePreviewState> = {}

      await Promise.all(imageAttachments.map(async (attachment) => {
        try {
          const preview = await loadRuntimeThumbnail(attachment)
          if (preview.objectUrl) {
            objectUrls.push(preview.objectUrl)
          }
          nextPreviews[attachment.id] = preview
        } catch {
          if (lastRootPermissionFailed) {
            setNeedsReauthorization(true)
          }
          nextPreviews[attachment.id] = { error: t('attachmentPermissionLost') }
        }
      }))

      if (!canceled) {
        setImagePreviews((current) => ({ ...current, ...nextPreviews }))
      } else {
        objectUrls.forEach((url) => URL.revokeObjectURL(url))
      }
    }

    loadPreviews()

    return () => {
      canceled = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [safeAttachments, previewRefreshKey])

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      objectUrlsRef.current.clear()
    }
  }, [])

  if (safeAttachments.length === 0) {
    return null
  }

  return (
    <>
      {needsReauthorization && (
        <Alert variant="warning" className="mb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <AlertDescription>{t('attachmentPermissionLost')}</AlertDescription>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReauthorizeExternal}
                disabled={isReauthorizing}
              >
                {isReauthorizing ? <Loader2 className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
                {t('reauthorizeAttachmentDirectory')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSwitchToInternal}
                disabled={isReauthorizing}
              >
                {isReauthorizing ? <Loader2 className="size-3.5 animate-spin" /> : <HardDrive className="size-3.5" />}
                {t('switchToInternalStorage')}
              </Button>
            </div>
          </div>
        </Alert>
      )}
    <div className={compact ? 'flex w-fit flex-wrap items-center gap-1.5' : 'mt-3 flex flex-wrap gap-2'}>
      {safeAttachments.map((attachment) => {
        const preview = getPreview(attachment)
        const thumbnailUrl = preview?.thumbnailUrl
        const hasImagePreview = isImageAttachment(attachment) && thumbnailUrl
        const hideImageMetadata = Boolean(hasImagePreview)

        return (
          <div
            key={attachment.id}
            className={
              compact
                ? hasImagePreview
                  ? 'qp-compact-image-attachment flex shrink-0 items-center justify-center rounded-xl'
                  : 'flex min-w-0 max-w-[148px] items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-1.5 py-1'
                : hasImagePreview
                  ? 'qp-card-image-attachment flex shrink-0 items-center justify-center rounded-xl'
                  : 'flex min-w-0 max-w-full items-center gap-2 rounded-2xl border border-border bg-muted/40 px-2 py-1.5'
            }
            title={hideImageMetadata ? `${attachment.name} (${formatFileSize(attachment.size)})` : undefined}
          >
            {hasImagePreview && (
              <button
                type="button"
                onClick={() => openImageViewer(attachment)}
                className="group relative flex-shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                aria-label={attachment.name}
                title={hideImageMetadata ? `${attachment.name} (${formatFileSize(attachment.size)})` : undefined}
              >
                <img
                  src={thumbnailUrl}
                  alt={attachment.name}
                  loading="lazy"
                  decoding="async"
                  className={compact ? 'h-12 w-12 rounded-xl border border-border object-cover' : 'h-20 w-20 rounded-xl border border-border object-cover'}
                />
                <span className="absolute inset-0 hidden items-center justify-center rounded-xl bg-black/35 text-white opacity-0 transition-opacity group-hover:flex group-hover:opacity-100">
                  <ImageIcon className="size-4" />
                </span>
              </button>
            )}
            {!hasImagePreview && (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
                <FileText className="size-3.5" />
              </span>
            )}
            {!hideImageMetadata && (
              <div className="min-w-0 max-w-full">
                <div className="truncate text-xs font-medium text-foreground">
                  {attachment.name}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {formatFileSize(attachment.size)}
                </div>
                {isImageAttachment(attachment) && preview?.error && (
                  <div className="truncate text-[11px] text-amber-600 dark:text-amber-400">
                    {preview.error}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {activeImage && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('imagePreviewDialog')}
          onClick={() => setActiveImageId(null)}
        >
          <div className="relative flex max-h-full max-w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <img
              src={activeImage.url}
              alt={activeImage.attachment.name}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
            {activeImage.isLoadingFull && (
              <div className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-xs text-white">
                <Loader2 className="size-3.5 animate-spin" />
                {t('loading')}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setActiveImageId(null)
            }}
            className="fixed right-4 top-4 z-[1001] inline-flex size-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label={t('closeImagePreview')}
          >
            <X className="size-5" />
          </button>
          {viewableImages.length > 1 && (
            <>
              <Button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  showPreviousImage()
                }}
                variant="ghost"
                size="icon"
                className="fixed left-4 top-1/2 z-[1001] -translate-y-1/2 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white focus:ring-white"
                aria-label={t('previousImage')}
              >
                <ChevronLeft className="size-6" />
              </Button>
              <Button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  showNextImage()
                }}
                variant="ghost"
                size="icon"
                className="fixed right-4 top-1/2 z-[1001] -translate-y-1/2 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white focus:ring-white"
                aria-label={t('nextImage')}
              >
                <ChevronRight className="size-6" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
    </>
  )
}

export default PromptAttachmentPreview
