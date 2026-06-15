import { BLOCK_DEFS } from '../blocks/registry'
import { CAT_STYLES, formatValue } from './ui'
import OutputVisualizer from './OutputVisualizer'

// One or two key values for a chip, e.g. "low-pass · 800Hz".
export function chipSummary(block) {
  const def = BLOCK_DEFS[block.type]
  return def.params
    .filter((p) => p.type !== 'harmonics' && (!p.show || p.show(block.params)))
    .slice(0, 2)
    .map((p) => formatValue(p, block.params[p.key]))
    .join(' · ')
}

// Visualizer view modes, shown as a horizontal segmented control under the
// canvas. Labels kept short to fit under the card.
const VIEW_OPTS = [
  { value: 'wave', label: 'wave' },
  { value: 'spectrum', label: 'spec' },
  { value: 'waterfall', label: 'wfall' },
  { value: 'fire', label: 'fire' },
  { value: 'off', label: 'off' },
]

// The Visualizer is rendered as a card (live canvas + view selector) rather than
// a plain chip, so it shows the signal at its point in the chain among the pills.
function VisualizerCard({ block, selected, onClick, onParam, drag }) {
  const mode = block.params.mode ?? 'wave'
  return (
    <div
      onClick={onClick}
      {...(drag || {})}
      className={`cursor-pointer overflow-hidden rounded-lg border shadow-sm transition-colors ${
        selected ? 'border-accent-deep ring-1 ring-accent-deep/70' : 'border-edge hover:border-edge-hover'
      }`}
    >
      <div className="bg-well px-2 pt-1.5">
        <OutputVisualizer blockId={block.id} mode={mode} />
      </div>
      <div className="flex items-center gap-px border-t border-edge/40 bg-surface px-1 pb-1 pt-0.5">
        {VIEW_OPTS.map((o) => (
          <button
            key={o.value}
            onClick={(e) => { e.stopPropagation(); onParam(block.id, 'mode', o.value) }}
            title={o.value}
            className={`flex-1 rounded px-1 py-0.5 text-[9px] uppercase tracking-wide transition-colors ${
              mode === o.value ? 'bg-accent-deep/20 text-accent-bright' : 'text-faint hover:text-text'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// A single block node in the graph. Selected = amber ring; bypassed = dim +
// struck-through name (sources are never "bypassed" — they mute via the lane).
export default function Chip({ block, selected, onClick, onParam, drag }) {
  const def = BLOCK_DEFS[block.type]
  if (def.type === 'visualizer') return <VisualizerCard block={block} selected={selected} onClick={onClick} onParam={onParam} drag={drag} />
  const cat = CAT_STYLES[def.category]
  const bypassed = !block.enabled && def.kind !== 'source' && def.kind !== 'analyzer'
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
