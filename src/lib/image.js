function estimateDataUrlBytes(dataUrl = '') {
  const markerIndex = dataUrl.indexOf(',')
  if (markerIndex === -1) return 0
  const base64 = dataUrl.slice(markerIndex + 1)
  const padding = (base64.match(/=*$/)?.[0] || '').length
  return Math.floor((base64.length * 3) / 4) - padding
}

async function loadImageFromDataUrl(sourceDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image-load-failed'))
    img.src = sourceDataUrl
  })
}

export async function compressImageDataUrl(sourceDataUrl, { size = 1024, quality = 0.82 } = {}) {
  if (!sourceDataUrl) return ''

  const image = await loadImageFromDataUrl(sourceDataUrl)

  const srcWidth = image.naturalWidth || image.width
  const srcHeight = image.naturalHeight || image.height
  const maxSide = Math.max(srcWidth, srcHeight)
  const ratio = maxSide > size ? size / maxSide : 1
  const targetWidth = Math.max(1, Math.round(srcWidth * ratio))
  const targetHeight = Math.max(1, Math.round(srcHeight * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return sourceDataUrl
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function compressImageDataUrlToMaxBytes(
  sourceDataUrl,
  { maxBytes = 2 * 1024 * 1024, maxSideStart = 1024, minSide = 480, qualityStart = 0.82, minQuality = 0.55 } = {}
) {
  if (!sourceDataUrl) return ''
  const image = await loadImageFromDataUrl(sourceDataUrl)
  const srcWidth = image.naturalWidth || image.width
  const srcHeight = image.naturalHeight || image.height

  let maxSide = maxSideStart
  let quality = qualityStart
  let best = sourceDataUrl

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const ratio = Math.min(1, maxSide / Math.max(srcWidth, srcHeight))
    const targetWidth = Math.max(1, Math.round(srcWidth * ratio))
    const targetHeight = Math.max(1, Math.round(srcHeight * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return best
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight)
    const candidate = canvas.toDataURL('image/jpeg', quality)
    best = candidate
    if (estimateDataUrlBytes(candidate) <= maxBytes) return candidate

    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.07)
    } else if (maxSide > minSide) {
      maxSide = Math.max(minSide, Math.round(maxSide * 0.86))
    } else {
      return candidate
    }
  }
  return best
}

export async function cropFileToSquareDataUrl(file, size = 1024, maxBytes = 2 * 1024 * 1024) {
  if (!file || !file.type?.startsWith('image/')) return ''

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('file-read-failed'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image-load-failed'))
    img.src = dataUrl
  })

  const srcWidth = image.naturalWidth || image.width
  const srcHeight = image.naturalHeight || image.height
  const edge = Math.min(srcWidth, srcHeight)
  const startX = Math.max(0, Math.floor((srcWidth - edge) / 2))
  const startY = Math.max(0, Math.floor((srcHeight - edge) / 2))

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl

  ctx.drawImage(image, startX, startY, edge, edge, 0, 0, size, size)
  return compressImageDataUrlToMaxBytes(canvas.toDataURL('image/jpeg', 0.84), {
    maxBytes,
    maxSideStart: size,
    minSide: 480,
    qualityStart: 0.82,
    minQuality: 0.55,
  })
}
