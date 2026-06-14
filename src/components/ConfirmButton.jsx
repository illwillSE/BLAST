import { useState, useRef } from 'react'

export default function ConfirmButton({ onConfirm, children, className, armedClassName, armDelay = 600, resetAfter = 3000 }) {
  const [armed, setArmed] = useState(false)
  const readyAt = useRef(0)
  const resetTimer = useRef(null)

  function handleClick(e) {
    e.stopPropagation()
    if (!armed) {
      setArmed(true)
      readyAt.current = Date.now() + armDelay
      resetTimer.current = setTimeout(() => setArmed(false), resetAfter)
    } else if (Date.now() >= readyAt.current) {
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
      {armed ? 'confirm' : children}
    </button>
  )
}
