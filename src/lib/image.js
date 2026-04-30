export async function compressImageDataUrl(sourceDataUrl, { size = 1024, quality = 0.82 } = {}) {
  if (!sourceDataUrl) return ''

  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image-load-failed'))
    img.src = sourceDataUrl
  })

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

export async function cropFileToSquareDataUrl(file, size = 1024) {
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
  return canvas.toDataURL('image/jpeg', 0.82)
}
