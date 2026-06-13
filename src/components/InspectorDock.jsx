import { BLOCK_DEFS, disabledSourceParams } from '../blocks/registry'
import { findBlock, findLane, isSource } from '../state/model'
import { estimateDuration } from '../audio/engine'
import { Slider, Select } from './ui'
import BlockControls from './BlockControls'

const LEVEL_DEF = { key: 'level', label: 'Level', type: 'range', min: -40, max: 6, step: 0.1, default: 0, format: (v) => `${v.toFixed(1)}dB` }
const PAN_DEF = { key: 'pan', label: 'Pan', type: 'range', min: -1, max: 1, step: 0.01, default: 0, format: (v) => (Math.abs(v) < 0.01 ? 'center' : v < 0 ? `${Math.round(-v * 100)}L` : `${Math.round(v * 100)}R`) }
const DELAY_DEF = { key: 'delay', label: 'Delay', type: 'range', min: 0, max: 2, step: 0.005, default: 0, format: (v) => (v < 0.001 ? 'none' : v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`) }
const OUT_VOLUME_DEF = { key: 'outputVolume', label: 'Level', type: 'range', min: -40, max: 6, step: 0.1, default: 0, format: (v) => `${v.toFixed(1)}dB` }
const OUT_VIEW_DEF = {
  key: 'outputView', label: 'Display', type: 'select', default: 'wave',
  options: [{ value: 'wave', label: 'waveform' }, { value: 'spectrum', label: 'spectrum' }, { value: 'fire', label: 'fire' }, { value: 'off', label: 'off' }],
}

// Lane mix (level / pan / delay) + mute & remove — a lane property, not a block.
function MixControls({ lane, laneNumber, canRemove, onLaneProp, onToggleMute, onRemoveLane }) {
  return (
    <div className="min-w-[260px]">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-soft">Lane {laneNumber} · Mix</span>
        <div className="ml-auto flex items-center gap-1.5 text-[10px]">
          <button
            onClick={onToggleMute}
            className={`rounded border px-2 py-0.5 transition-colors ${
              lane.enabled ? 'border-on/50 bg-on/15 text-on-bright' : 'border-danger/50 bg-danger/15 text-danger-bright'
            }`}
          >
            {lane.enabled ? '⏻ on' : '⏻ muted'}
          </button>
          {canRemove && (
            <button onClick={onRemoveLane} className="rounded border border-edge px-2 py-0.5 text-text transition-colors hover:border-danger/50 hover:text-danger-bright">
              ✕ lane
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(3, minmax(130px, 1fr))' }}>
        <Slider def={LEVEL_DEF} value={lane.level ?? 0} onChange={(v) => onLaneProp(lane.id, 'level', v)} />
        <Slider def={PAN_DEF} value={lane.pan ?? 0} onChange={(v) => onLaneProp(lane.id, 'pan', v)} />
        <Slider def={DELAY_DEF} value={lane.delay ?? 0} onChange={(v) => onLaneProp(lane.id, 'delay', v)} />
      </div>
    </div>
  )
}

function OutputControls({ sound, onOutputVolume, onOutputView }) {
  return (
    <div className="min-w-[260px]">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-soft">Output</span>
      <div className="mt-3 grid w-56 gap-3">
        <Slider def={OUT_VOLUME_DEF} value={sound.outputVolume ?? 0} onChange={onOutputVolume} />
        <Select def={OUT_VIEW_DEF} value={sound.outputView ?? 'wave'} onChange={onOutputView} />
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
  if (keyId.startsWith('mix:')) {
    const laneId = keyId.slice(4)
    const idx = sound.sources.findIndex((s) => s.id === laneId)
    const lane = sound.sources[idx]
    if (!lane) return null
    return (
      <MixControls
        lane={lane}
        laneNumber={idx + 1}
        canRemove={sound.sources.length > 1}
        onLaneProp={handlers.onLaneProp}
        onToggleMute={() => handlers.onToggle(lane.id)}
        onRemoveLane={() => handlers.onRemoveLane(lane.id)}
      />
    )
  }
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
    />
  )
}

export default function InspectorDock({ sound, selectedKeys, handlers }) {
  const keys = selectedKeys.filter((k) => k === 'output' || k.startsWith('mix:') || findBlock(sound, k))
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
