import { AnimatePresence, motion } from 'framer-motion'
import { tr } from '../lib/i18n'
import { X } from '../lib/icons'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Закрывать по Escape (в игре Escape занят под «Неправильно») */
  closeOnEsc?: boolean
  hideClose?: boolean
}

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

export default function Modal({ open, onClose, children, title, size = 'md', closeOnEsc = true, hideClose }: Props) {
  useEffect(() => {
    if (!open || !closeOnEsc) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, closeOnEsc])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`glass-strong relative z-10 flex max-h-[92vh] w-full ${sizes[size]} flex-col rounded-t-3xl sm:rounded-3xl`}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            {(title || !hideClose) && (
              <div className="flex items-center justify-between gap-4 px-6 pt-5">
                <div className="text-lg font-bold">{title}</div>
                {!hideClose && (
                  <button
                    onClick={onClose}
                    className="rounded-full p-2 text-muted transition hover:bg-fg/10 hover:text-fg"
                    aria-label={tr('Закрыть')}
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            <div className="scrollbar-thin overflow-y-auto px-6 pb-6 pt-3">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
