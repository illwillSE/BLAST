import { useEffect, useRef, useState } from 'react'
import { SAMPLE_RATES, EXPORT_CHANNELS, EXPORT_FORMATS } from '../audio/render'
import { Button } from './ui'

// A labelled native <select>, matching the chain editor's select styling.
function Field({ label, value, onChange, children }) {
  return (
    <label className="block select-none">
      <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded border border-edge bg-surface px-1.5 py-1 font-mono text-[12px] text-ink outline-none focus:border-accent-deep/60"
      >
        {children}
      </select>
    </label>
  )
}

// Popover of export options (sample rate, channels, format). These settings
// also drive "→ Sample sound" / copy-to-sample, so the rendered audio matches.
export default function ExportSettings({ settings, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen((o) => !o)} title="Export options" aria-expanded={open}>⚙</Button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-44 space-y-2 rounded border border-edge bg-panel p-2.5 shadow-xl">
          <Field
            label="Sample rate"
            value={settings.sampleRate}
            onChange={(e) => onChange({ sampleRate: Number(e.target.value) })}
          >
            {SAMPLE_RATES.map((r) => (
              <option key={r} value={r}>{r / 1000} kHz</option>
            ))}
          </Field>
          <Field
            label="Channels"
            value={settings.channels}
            onChange={(e) => onChange({ channels: Number(e.target.value) })}
          >
            {EXPORT_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Field>
          <Field
            label="Format"
            value={settings.format}
            onChange={(e) => onChange({ format: e.target.value })}
          >
            {EXPORT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </Field>
        </div>
      )}
    </div>
  )
}
