import { useEffect, type ReactNode } from 'react'
import { MorphingModal } from '@/components/beui/morphing-modal'

export function Modal({
  viewId,
  onClose,
  className,
  children,
}: {
  viewId: string | null
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (viewId === null) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key.startsWith('Arrow')) e.stopPropagation()
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [viewId, onClose])

  return (
    <MorphingModal viewId={viewId} onClose={onClose} placement="center" className={className}>
      {children}
    </MorphingModal>
  )
}
