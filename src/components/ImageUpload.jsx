import { useState, useRef } from 'react'
import { uploadFile, deleteFile, ACCEPTED_IMAGES } from '../lib/storage'
import { Image, X, Loader } from 'lucide-react'

export default function ImageUpload({ folder, value, onChange, label = 'Photo' }) {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const inputRef = useRef()

    async function handleFile(e) {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 5 * 1024 * 1024) {
            setError('File too large. Max 5MB.')
            return
        }

        setUploading(true)
        setError('')
        try {
            // Delete old file if exists
            if (value) await deleteFile(value)
            const url = await uploadFile(folder, file)
            onChange(url)
        } catch (err) {
            console.error(err)
            setError('Upload failed. Try again.')
        } finally {
            setUploading(false)
            e.target.value = ''
        }
    }

    async function handleRemove() {
        if (value) await deleteFile(value)
        onChange('')
    }

    return (
        <div>
            {label && (
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{label}</label>
            )}

            {value ? (
                <div className="relative group">
                    <img src={value} alt="Product"
                        className="w-full h-40 object-cover rounded-xl border border-slate-200" />
                    <button
                        onClick={handleRemove}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={14} />
                    </button>
                    <button
                        onClick={() => inputRef.current?.click()}
                        className="absolute bottom-2 right-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                        Replace
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="w-full h-32 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-sky-300 hover:bg-sky-50 transition-all disabled:opacity-50">
                    {uploading ? (
                        <Loader size={20} className="text-sky-400 animate-spin" />
                    ) : (
                        <Image size={20} className="text-slate-300" />
                    )}
                    <span className="text-xs text-slate-400 font-medium">
                        {uploading ? 'Uploading...' : 'Click to upload image'}
                    </span>
                    <span className="text-xs text-slate-300">JPG, PNG, WebP — max 5MB</span>
                </button>
            )}

            <input ref={inputRef} type="file" accept={ACCEPTED_IMAGES}
                onChange={handleFile} className="hidden" />

            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
    )
}