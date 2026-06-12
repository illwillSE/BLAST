import { useRef, useState } from 'react'
import { isSource } from '../state/model'
import { disabledSourceParams } from '../blocks/registry'
import BlockCard from './BlockCard'
import AddBlockMenu from './AddBlockMenu'
import OutputVisualizer from './OutputVisualizer'
import { Slider, Select } from './ui'

const OUTPUT_VOLUME_DEF = {
  key: 'outputVolume', label: 'Level', type: 'range',
  min: -40, max: 6, step: 0.1, default: 0, format: (v) => `${v.toFixed(1)}dB`,
}

const OUTPUT_VIEW_DEF = {
  key: 'outputView', label: 'Display', type: 'select', default: 'wave',
  options: [
    { value: 'wave', label: 'waveform' },
    { value: 'spectrum', label: 'spectrum' },
    { value: 'fire', label: 'fire' },
    { value: 'off', label: 'off' },
  ],
}

const Arrow = ({ active }) => (
  <div className={`flex h-10 shrink-0 items-center self-start text-lg ${active ? 'text-amber-500/70' : 'text-slate-700'}`}>
    ─▶
  </div>
)

export default function ChainEditor({
  sound, onParam, onToggle, onRemove, onMove, onAdd, onSwapSource, onOutputVolume, onOutputView,
}) {
  const dragIndex = useRef(null)
  const [dropTarget, setDropTarget] = useState(null)
  // Source controls another block currently overrides (greyed out in the card).
  const sourceLocks = disabledSourceParams(sound)

  // Drag SOURCE lives on the grip handle only, not the whole card — otherwise
  // the native element-drag swallows mouse interaction with anything rich
  // inside the card (WaveSurfer regions, the sample-editor modal, canvases).
  function dragHandleProps(block, index) {
    if (isSource(block)) return null // source stays pinned at the front
    return {
      draggable: true,
      onDragStart: (e) => {
        dragIndex.current = index
        e.dataTransfer.effectAllowed = 'move'
      },
      onDragEnd: () => { dragIndex.current = null; setDropTarget(null) },
    }
  }

  // Drop TARGET stays the whole card so you can release anywhere over it.
  function dropProps(block, index) {
    if (isSource(block)) return {}
    return {
      onDragOver: (e) => {
        if (dragIndex.current === null || dragIndex.current === index) return
        e.preventDefault()
        setDropTarget(index)
      },
      onDrop: (e) => {
        e.preventDefault()
        if (dragIndex.current !== null && dragIndex.current !== index) {
          onMove(dragIndex.current, index)
        }
        dragIndex.current = null
        setDropTarget(null)
      },
      style: dropTarget === index ? { outline: '2px dashed #f59e0b', outlineOffset: '2px' } : undefined,
    }
  }

  return (
    <div className="flex items-start gap-2 overflow-x-auto p-4 pb-6">
      {sound.blocks.map((block, i) => (
        <div key={block.id} className="flex items-start gap-2">
          {i > 0 && <Arrow active={block.enabled || isSource(block)} />}
          <BlockCard
            block={block}
            soundId={sound.id}
            isSource={isSource(block)}
            onParam={(key, value) => onParam(block.id, key, value)}
            onToggle={() => onToggle(block.id)}
            onRemove={() => onRemove(block.id)}
            onSwapSource={(type) => onSwapSource(block.id, type)}
            disabledParams={isSource(block) ? sourceLocks : undefined}
            dropProps={dropProps(block, i)}
            dragHandleProps={dragHandleProps(block, i)}
          />
        </div>
      ))}

      <Arrow active />
      <AddBlockMenu onAdd={onAdd} />
      <Arrow active />

      <div className="w-52 shrink-0 self-start rounded-lg border border-slate-500/40 bg-slate-900/80 shadow-lg">
        <div className="border-b border-slate-800 px-2.5 py-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-300">Output</span>
        </div>
        <div className="space-y-2 p-2.5">
          <Slider def={OUTPUT_VOLUME_DEF} value={sound.outputVolume ?? 0} onChange={onOutputVolume} />
          <Select def={OUTPUT_VIEW_DEF} value={sound.outputView ?? 'wave'} onChange={onOutputView} />
          {(sound.outputView ?? 'wave') !== 'off' && (
            <OutputVisualizer mode={sound.outputView ?? 'wave'} />
          )}
        </div>
      </div>
    </div>
  )
}
