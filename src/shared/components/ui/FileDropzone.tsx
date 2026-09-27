import { type ChangeEvent, type DragEvent, useId, useRef, useState } from 'react'
import { File as FileIcon, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface FileDropzoneProps {
  label?: string
  hint?: string
  multiple?: boolean
  accept?: string
  files: string[]
  onChange: (files: string[]) => void
}

export function FileDropzone({
  label = 'Arrastrá el archivo o',
  hint = 'PDF, video o imagen',
  multiple = false,
  accept,
  files,
  onChange,
}: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const names = Array.from(list).map((f) => f.name)
    onChange(multiple ? [...files, ...names] : [names[0]])
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files)
    e.target.value = ''
  }

  function removeFile(name: string) {
    onChange(files.filter((f) => f !== name))
  }

  return (
    <div>
      {files.length > 0 && (
        <ul className="mb-3 space-y-2">
          {files.map((name) => (
            <li
              key={name}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2 text-gray-700">
                <FileIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                {name}
              </span>
              <button
                type="button"
                onClick={() => removeFile(name)}
                className="flex items-center gap-1 text-primary-600 hover:underline"
              >
                <X className="h-3.5 w-3.5" /> Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm text-gray-500 transition-colors',
          dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-gray-50',
        )}
      >
        {label}{' '}
        <label htmlFor={inputId} className="cursor-pointer font-semibold text-primary-600 hover:underline">
          elegilo
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple={multiple}
          accept={accept}
          className="sr-only"
          onChange={handleInputChange}
        />
        <p className="mt-1 text-xs text-gray-400">{hint}</p>
      </div>
    </div>
  )
}
