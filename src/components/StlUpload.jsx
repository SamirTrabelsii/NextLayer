import { useState, useRef } from 'react'
import { uploadFile, deleteFile, ACCEPTED_STL } from '../lib/storage'
import { Box, Download, Trash2, Loader } from 'lucide-react'

export default function StlUpload({ folder, value, onChange, label = 'STL File' }) {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const inputRef = useRef()

    function getFilename(url) {
        if (!url) return ''
        return decodeURIComponent(url.split('/').pop().split('?')[0])
    }

    async function handleFile(e) {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 50 * 1024 * 1024) {
            setError('File too large. Max 50MB.')
            return
        }

        setUploading(true)
        setError('')
        try {
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
                <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-3 py-3">
                    <div className="p-2 bg-violet-100 rounded-lg">
                        <Box size={16} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-violet-700 truncate">
                            {getFilename(value)}
                        </p>
                        <p className="text-xs text-violet-400">STL file ready</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                        <a href={value} download target="_blank" rel="noreferrer"
                            className="p-1.5 text-violet-500 hover:bg-violet-100 rounded-lg transition-colors">
                            <Download size={15} />
                        </a>
                        <button onClick={() => inputRef.current?.click()}
                            className="p-1.5 text-violet-500 hover:bg-violet-100 rounded-lg transition-colors text-xs font-medium px-2">
                            Replace
                        </button>
                        <button onClick={handleRemove}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={15} />
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="w-full border-2 border-dashed border-slate-200 rounded-xl flex items-center gap-3 px-4 py-3 hover:border-violet-300 hover:bg-violet-50 transition-all disabled:opacity-50">
                    {uploading ? (
                        <Loader size={18} className="text-violet-400 animate-spin flex-shrink-0" />
                    ) : (
                        <Box size={18} className="text-slate-300 flex-shrink-0" />
                    )}
                    <div className="text-left">
                        <p className="text-xs font-medium text-slate-400">
                            {uploading ? 'Uploading...' : 'Upload STL file'}
                        </p>
                        <p className="text-xs text-slate-300">Max 50MB</p>
                    </div>
                </button>
            )}

            <input ref={inputRef} type="file" accept={ACCEPTED_STL}
                onChange={handleFile} className="hidden" />

            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
    )
}