import { supabase } from './supabase'

const BUCKET = 'nextlayer'

// Upload any file, returns public URL
export async function uploadFile(folder, file) {
    const ext = file.name.split('.').pop().toLowerCase()
    const uuid = crypto.randomUUID()
    const path = `${folder}/${uuid}.${ext}`

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(path)

    return publicUrl
}

// Delete a file by its public URL
export async function deleteFile(publicUrl) {
    try {
        const marker = `/object/public/${BUCKET}/`
        const idx = publicUrl.indexOf(marker)
        if (idx === -1) return
        const path = publicUrl.slice(idx + marker.length)
        await supabase.storage.from(BUCKET).remove([path])
    } catch (err) {
        console.error('Delete file error:', err)
    }
}

// Helpers for accepted file types
export const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp,image/gif'
export const ACCEPTED_STL = '.stl,.STL'