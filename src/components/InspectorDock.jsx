import { BLOCK_DEFS, disabledSourceParams } from '../blocks/registry'
import { findBlock, findLane, isSource } from '../state/model'
import { estimateDuration } from '../audio/engine'
import { Slider } from './ui'
import BlockControls from './BlockControls'
import BusMixer from './BusMixer'
import SequencerEditor from './SequencerEditor'

const OUT_VOLUME_DEF = { key: 'outputVolume', label: 'Level', type: 'range', min: -40, max: 6, step: 0.1, default: 0, format: (v) => `${v.toFixed(1)}dB` }

function OutputControls({ sound, onOutputVolume, onVoicing }) {
  const voicing = sound.voicing ?? 'poly'
  return (
    <div className="min-w-[260px]">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-soft">Output</span>
      <div className="mt-3 flex items-end gap-4">
        <div className="w-56">
          <Slider def={OUT_VOLUME_DEF} value={sound.outputVolume ?? 0} onChange={onOutputVolume} />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wide text-faint">Voicing</span>
          <div className="mt-1 flex items-center gap-px rounded-md border border-edge bg-surface p-0.5">
            {['mono', 'poly'].map((v) => (
              <button
                key={v}
                onClick={() => onVoicing(v)}
                title={v === 'mono' ? 'One voice — each note steals the last' : 'Stack overlapping notes and chords'}
                className={`flex-1 rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  voicing === v ? 'bg-accent-deep/20 text-accent-bright' : 'text-faint hover:text-text'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Summary({ sound }) {
  const lanes = sound.sources?.length ?? 0
  const master = sound.master?.length ?? 0
  return (
    <div className="flex h-full items-center text-[12px] text-muted">
      <span>
        {lanes} source{lanes === 1 ? '' : 's'} · master {master} block{master === 1 ? '' : 's'} ·
        ~{estimateDuration(sound).toFixed(2)}s · out {(sound.outputVolume ?? 0).toFixed(1)}dB
        <span className="ml-2 text-faint">— select a block to edit</span>
      </span>
    </div>
  )
}

// Resolve one selection key to a rendered control panel.
function Panel({ keyId, sound, handlers }) {
  if (keyId === 'output') return <OutputControls sound={sound} {...handlers} />
  if (keyId === 'seq') return <SequencerEditor sound={sound} onChange={handlers.onSequencer} />
  if (keyId === 'bus') return <BusMixer sound={sound} handlers={handlers} />
  const block = findBlock(sound, keyId)
  if (!block || !BLOCK_DEFS[block.type]) return null
  const source = isSource(block)
  const lane = findLane(sound, keyId)
  return (
    <BlockControls
      block={block}
      soundId={sound.id}
      isSource={source}
      disabledParams={source && lane ? disabledSourceParams(lane) : undefined}
      onParam={(key, value) => handlers.onParam(block.id, key, value)}
      onToggle={() => handlers.onToggle(block.id)}
      onRemove={() => handlers.onRemove(block.id)}
      onSwapSource={(type) => handlers.onSwapSource(block.id, type)}
      onPasteValues={() => handlers.onPasteValues(block.id)}
    />
  )
}

export default function InspectorDock({ sound, selectedKeys, handlers }) {
  const keys = selectedKeys.filter((k) => k === 'output' || k === 'seq' || k === 'bus' || findBlock(sound, k))
  return (
    <div className="shrink-0 border-t border-divider bg-panel">
      <div className="flex items-center gap-2 border-b border-divider px-4 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Inspector</span>
        {keys.length > 1 && <span className="text-[10px] text-muted">{keys.length} blocks · shift-click to add</span>}
      </div>
      <div className="flex gap-8 overflow-x-auto p-4" style={{ minHeight: 168 }}>
        {keys.length === 0 ? (
          <Summary sound={sound} />
        ) : (
          keys.map((k, i) => (
            <div key={k} className="flex min-w-0 flex-1 gap-8">
              {i > 0 && <div className="w-px self-stretch bg-surface-hover" />}
              <Panel keyId={k} sound={sound} handlers={handlers} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
