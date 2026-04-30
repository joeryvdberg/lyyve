export async function cropFileToSquareDataUrl(file, size = 1200) {
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
  return canvas.toDataURL('image/jpeg', 0.9)
}
