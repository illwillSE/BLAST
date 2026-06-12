import { useRef, useState } from 'react'
import { isSource } from '../state/model'
import BlockCard from './BlockCard'
import AddBlockMenu from './AddBlockMenu'
import { Slider } from './ui'

const OUTPUT_VOLUME_DEF = {
  key: 'outputVolume', label: 'Level', type: 'range',
  min: -40, max: 6, step: 0.1, default: 0, format: (v) => `${v.toFixed(1)}dB`,
}

const Arrow = ({ active }) => (
  <div className={`flex h-10 shrink-0 items-center self-start text-lg ${active ? 'text-amber-500/70' : 'text-slate-700'}`}>
    ─▶
  </div>
)

export default function ChainEditor({
  sound, onParam, onToggle, onRemove, onMove, onAdd, onSwapSource, onOutputVolume,
}) {
  const dragIndex = useRef(null)
  const [dropTarget, setDropTarget] = useState(null)

  function dragProps(block, index) {
    if (isSource(block)) return {} // source stays pinned at the front
    return {
      draggable: true,
      onDragStart: (e) => {
        dragIndex.current = index
        e.dataTransfer.effectAllowed = 'move'
      },
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
      onDragEnd: () => { dragIndex.current = null; setDropTarget(null) },
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
            dragProps={dragProps(block, i)}
          />
        </div>
      ))}

      <Arrow active />
      <AddBlockMenu onAdd={onAdd} />
      <Arrow active />

      <div className="w-40 shrink-0 self-start rounded-lg border border-slate-500/40 bg-slate-900/80 shadow-lg">
        <div className="border-b border-slate-800 px-2.5 py-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-300">Output</span>
        </div>
        <div className="p-2.5">
          <Slider def={OUTPUT_VOLUME_DEF} value={sound.outputVolume ?? 0} onChange={onOutputVolume} />
        </div>
      </div>
    </div>
  )
}
