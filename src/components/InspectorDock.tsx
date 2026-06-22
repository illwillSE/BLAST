import { useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { BLOCK_DEFS, disabledSourceParams } from '../blocks/registry'
import { findBlock, findLane, isSource } from '../state/model'
import { estimateDuration } from '../audio/engine'
import { useT } from '../state/uiPrefs'
import type { RangeParamDef } from '../blocks/registry'
import type { Sequencer, Sound, SourceType } from '../types'
import { Slider } from './ui'
import BlockControls from './BlockControls'
import BusMixer from './BusMixer'
import SequencerEditor from './SequencerEditor'

const OUT_VOLUME_DEF: RangeParamDef = { key: 'outputVolume', label: 'Level', type: 'range', min: -40, max: 6, step: 0.1, default: 0, format: (v) => `${v.toFixed(1)}dB` }

// The shared handler bag the inspector threads to its panels (BlockControls,
// BusMixer, OutputControls, SequencerEditor). App constructs it.
export interface InspectorHandlers {
  onParam: (blockId: string, key: string, value: unknown) => void
  onToggle: (blockId: string) => void
  onRemove: (blockId: string) => void
  onRemoveLane: (laneId: string) => void
  onSwapSource: (blockId: string, type: SourceType) => void
  onPasteValues: (blockId: string) => void
  onSelect: (key: string, additive?: boolean) => void
  onSequencer: (patch: Partial<Sequencer>) => void
  onOutputVolume: (v: number) => void
  onVoicing: (v: 'mono' | 'poly') => void
  onLaneProp: (laneId: string, key: string, value: number) => void
}

function OutputControls({ sound, onOutputVolume, onVoicing }: { sound: Sound; onOutputVolume: (v: number) => void; onVoicing: (v: 'mono' | 'poly') => void }) {
  const t = useT()
  const voicing = sound.voicing ?? 'poly'
  return (
    <div className="min-w-[260px]">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-soft">{t('inspector.output')}</span>
      <div className="mt-3 flex items-end gap-4">
        <div className="w-56">
          <Slider def={OUT_VOLUME_DEF} value={sound.outputVolume ?? 0} onChange={onOutputVolume} />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wide text-faint">{t('inspector.voicing')}</span>
          <div className="mt-1 flex items-center gap-px rounded-md border border-edge bg-surface p-0.5">
            {(['mono', 'poly'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onVoicing(v)}
                title={v === 'mono' ? t('inspector.monoTitle') : t('inspector.polyTitle')}
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

function Summary({ sound }: { sound: Sound }) {
  const t = useT()
  const lanes = sound.sources?.length ?? 0
  const master = sound.master?.length ?? 0
  return (
    <div className="flex h-full items-center text-[12px] text-muted">
      <span>
        {lanes} source{lanes === 1 ? '' : 's'} · master {master} block{master === 1 ? '' : 's'} ·
        ~{estimateDuration(sound).toFixed(2)}s · out {(sound.outputVolume ?? 0).toFixed(1)}dB
        <span className="ml-2 text-faint">— {t('inspector.selectToEdit')}</span>
      </span>
    </div>
  )
}

// Resolve one selection key to a rendered control panel.
function Panel({ keyId, sound, handlers }: { keyId: string; sound: Sound; handlers: InspectorHandlers }) {
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
      sound={sound}
      soundId={sound.id}
      isSource={source}
      canRemoveLane={source && sound.sources.length > 1}
      disabledParams={source && lane ? disabledSourceParams(lane) : undefined}
      onParam={(key, value) => handlers.onParam(block.id, key, value)}
      onToggle={() => handlers.onToggle(block.id)}
      onRemove={() => (source ? handlers.onRemoveLane(block.id) : handlers.onRemove(block.id))}
      onSwapSource={(type) => handlers.onSwapSource(block.id, type)}
      onPasteValues={() => handlers.onPasteValues(block.id)}
      onSelect={handlers.onSelect}
    />
  )
}

interface InspectorDockProps {
  sound: Sound
  selectedKeys: string[]
  handlers: InspectorHandlers
  minimized: boolean
  onToggleMinimize: () => void
}

export default function InspectorDock({ sound, selectedKeys, handlers, minimized, onToggleMinimize }: InspectorDockProps) {
  const t = useT()
  const keys = selectedKeys.filter((k) => k === 'output' || k === 'seq' || k === 'bus' || findBlock(sound, k))

  // Measure real content height via ResizeObserver, then animate the outer
  // wrapper between 0 (minimized) and the measured value.
  const innerRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  useEffect(() => {
    if (!innerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const size = entries[0]?.borderBoxSize?.[0]?.blockSize
      if (size != null) setContentHeight(size)
    })
    ro.observe(innerRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="shrink-0 border-t border-divider bg-panel">
      <div className="flex items-center gap-2 border-b border-divider px-4 py-1.5">
        <button
          onClick={onToggleMinimize}
          title={minimized ? t('inspector.expand') : t('inspector.collapse')}
          className="rounded p-0.5 text-faint transition-colors hover:bg-surface hover:text-text"
        >
          {minimized ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{t('inspector.title')}</span>
        {keys.length > 1 && <span className="text-[10px] text-muted">{keys.length} blocks · {t('inspector.multi')}</span>}
      </div>
      {/* Animate between 0 and the measured inner height for both minimize and
          content-height changes (different blocks have different panel heights). */}
      <div
        className="overflow-hidden transition-[height] duration-500 ease-in-out"
        style={{ height: minimized ? 0 : (contentHeight ?? 'auto') }}
      >
        <div ref={innerRef} className="flex gap-8 overflow-x-auto p-4" style={{ minHeight: 168 }}>
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
    </div>
  )
}
