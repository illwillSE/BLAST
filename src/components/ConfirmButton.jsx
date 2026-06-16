import { useState, useRef } from 'react'
import { useT } from '../state/uiPrefs'

export default function ConfirmButton({ onConfirm, children, className, armedClassName, resetAfter = 3000 }) {
  const t = useT()
  const [armed, setArmed] = useState(false)
  const resetTimer = useRef(null)

  function handleClick(e) {
    e.stopPropagation()
    if (!armed) {
      setArmed(true)
      resetTimer.current = setTimeout(() => setArmed(false), resetAfter)
    } else {
      clearTimeout(resetTimer.current)
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
