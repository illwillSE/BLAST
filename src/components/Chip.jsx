import { BLOCK_DEFS } from '../blocks/registry'
import { CAT_STYLES, formatValue } from './ui'

// One or two key values for a chip, e.g. "low-pass · 800Hz".
export function chipSummary(block) {
  const def = BLOCK_DEFS[block.type]
  return def.params
    .filter((p) => p.type !== 'harmonics' && (!p.show || p.show(block.params)))
    .slice(0, 2)
    .map((p) => formatValue(p, block.params[p.key]))
    .join(' · ')
}

// A single block node in the graph. Selected = amber ring; bypassed = dim +
// struck-through name (sources are never "bypassed" — they mute via the lane).
export default function Chip({ block, selected, onClick, drag }) {
  const def = BLOCK_DEFS[block.type]
  const cat = CAT_STYLES[def.category]
  const bypassed = !block.enabled && def.kind !== 'source'
  const summary = chipSummary(block)
  return (
    <button
      onClick={onClick}
      {...(drag || {})}
      className={`flex items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 text-[12px] shadow-sm transition-colors ${
        selected ? 'border-accent-deep ring-1 ring-accent-deep/70' : 'border-edge hover:border-edge-hover'
      } ${bypassed ? 'opacity-45' : ''}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
      <span className={`font-semibold ${cat.text} ${bypassed ? 'line-through' : ''}`}>{def.name}</span>
      {summary && <span className="text-[10px] tabular-nums text-muted">{summary}</span>}
    </button>
  )
}
