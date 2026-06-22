import { useState, useRef } from 'react'
import type { ReactNode } from 'react'
import { useT } from '../state/uiPrefs'

interface ConfirmButtonProps {
  onConfirm: () => void
  children: ReactNode
  className?: string
  armedClassName?: string
  resetAfter?: number
}

export default function ConfirmButton({ onConfirm, children, className, armedClassName, resetAfter = 3000 }: ConfirmButtonProps) {
  const t = useT()
  const [armed, setArmed] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!armed) {
      setArmed(true)
      resetTimer.current = setTimeout(() => setArmed(false), resetAfter)
    } else {
      if (resetTimer.current) clearTimeout(resetTimer.current)
      setArmed(false)
      onConfirm()
    }
  }

  return (
    <button
      onClick={handleClick}
      className={armed
        ? (armedClassName ?? 'rounded border border-danger bg-danger px-2 py-0.5 text-white transition-colors')
        : className}
    >
      {armed ? t('common.confirm') : children}
    </button>
  )
}
