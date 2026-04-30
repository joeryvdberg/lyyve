import { supabase } from './supabase'

const IMAGE_BUCKET = import.meta.env.VITE_SUPABASE_IMAGE_BUCKET || 'checkin-photos'
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = String(dataUrl || '').split(',', 2)
  if (!meta || !base64) return null
  const mimeMatch = meta.match(/^data:(.+?);base64$/i)
  const mimeType = mimeMatch?.[1] || 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

function getPublicUrl(path) {
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path)
  return data?.publicUrl || ''
}

function extensionForMime(mimeType = '') {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'jpg'
}

export async function uploadCheckInPhotos(userId, photos = []) {
  if (!supabase || !userId || !Array.isArray(photos) || photos.length === 0) return []

  const uploadedUrls = []
  for (let index = 0; index < photos.length; index += 1) {
    const value = photos[index]
    if (!value) continue
    if (!String(value).startsWith('data:')) {
      uploadedUrls.push(value)
      continue
    }

    const blob = dataUrlToBlob(value)
    if (!blob || blob.size > MAX_UPLOAD_BYTES) continue
    const ext = extensionForMime(blob.type)
    const filePath = `${userId}/${crypto.randomUUID()}-${Date.now()}-${index}.${ext}`

    const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(filePath, blob, {
      contentType: blob.type || 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) continue

    const publicUrl = getPublicUrl(filePath)
    if (publicUrl) uploadedUrls.push(publicUrl)
  }

  return uploadedUrls
}
