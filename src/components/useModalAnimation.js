import { useCallback, useEffect, useState } from 'react'

const DURATION = 200 // ms — keep in sync with the duration-200 classes below

// Shared enter/exit animation for centered modals: the backdrop fades while the
// panel drops in from the top and zooms slightly; reversed on close. Returns the
// `entered` flag plus a `handleClose` that plays the exit before the parent
// unmounts us via onClose. Drop `backdropAnim`/`panelAnim` into the respective
// className strings.
export function useModalAnimation(onClose) {
  const [entered, setEntered] = useState(false)

  // Trigger the enter transition on the frame after mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Play the exit (reverse) animation, then let the parent unmount us.
  const handleClose = useCallback(() => {
    setEntered(false)
    setTimeout(onClose, DURATION)
  }, [onClose])

  return { entered, handleClose }
}

export const backdropAnim = (entered) =>
  `transition-opacity duration-200 ease-out ${entered ? 'opacity-100' : 'opacity-0'}`

export const panelAnim = (entered) =>
  `transition-transform duration-200 ease-out ${entered ? 'translate-y-0 scale-100' : '-translate-y-6 scale-[.97]'}`
