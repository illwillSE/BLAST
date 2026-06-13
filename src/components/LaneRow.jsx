import { useRef, useState } from 'react'
import { BLOCK_DEFS } from '../blocks/registry'
import AddBlockMenu from './AddBlockMenu'
import Chip from './Chip'

const panLabel = (v) => (Math.abs(v) < 0.01 ? '⟂C' : v < 0 ? `${Math.round(-v * 100)}L` : `${Math.round(v * 100)}R`)
const delayLabel = (v) => (!v ? '' : v < 1 ? ` · ⧖${Math.round(v * 1000)}ms` : ` · ⧖${v.toFixed(2)}s`)
const mixReadout = (lane) => `${(lane.level ?? 0).toFixed(0)}dB · ${panLabel(lane.pan ?? 0)}${delayLabel(lane.delay)}`

const Conn = () => <span className="text-[13px] text-slate-600">›</span>
const Port = ({ portRef }) => <span ref={portRef} className="ml-1 h-2 w-2 shrink-0 rounded-full bg-slate-600" />

export default function LaneRow({
  lane, laneNumber, focused, selectedKeys, onSelect, onFocusLane, onMove, onAdd, outputRef,
}) {
  const dragIndex = useRef(null)
  const [dropTarget, setDropTarget] = useState(null)
  const isSel = (key) => selectedKeys.includes(key)
  const click = (key) => (e) => onSelect(key, e.shiftKey || e.metaKey)

  // Unfocused lane: same chip pills as focused, but dimmed and without drag/add.
  if (!focused) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => onFocusLane(lane.id)} className="w-6 text-center text-[11px] font-bold text-slate-500 hover:text-amber-400">
          ▸{laneNumber}
        </button>
        <Chip block={lane} selected={isSel(lane.id)} onClick={click(lane.id)} />
        {lane.chain.filter((b) => BLOCK_DEFS[b.type]).map((b) => (
          <span key={b.id} className="flex items-center gap-2">
            <Conn />
            <Chip block={b} selected={isSel(b.id)} onClick={click(b.id)} />
          </span>
        ))}
        <Conn />
        <div className={`ml-1 flex items-center gap-1.5 rounded-lg border border-slate-600/40 bg-slate-800/50 px-2.5 py-1.5 text-[12px] ${!lane.enabled ? 'opacity-50' : ''}`}>
          <span className="font-semibold text-slate-300">Mix</span>
          <span className="text-[10px] tabular-nums text-slate-500">{mixReadout(lane)}</span>
        </div>
        <Port portRef={outputRef} />
      </div>
    )
  }

  // Focused lane: full chip row with reorderable effect chips + mix + add.
  function dragProps(index) {
    return {
      draggable: true,
      onDragStart: (e) => { dragIndex.current = index; e.dataTransfer.effectAllowed = 'move' },
      onDragEnd: () => { dragIndex.current = null; setDropTarget(null) },
      onDragOver: (e) => {
        if (dragIndex.current === null || dragIndex.current === index) return
        e.preventDefault()
        setDropTarget(index)
      },
      onDrop: (e) => {
        e.preventDefault()
        if (dragIndex.current !== null && dragIndex.current !== index) onMove(lane.id, dragIndex.current, index)
        dragIndex.current = null
        setDropTarget(null)
      },
      style: dropTarget === index ? { outline: '2px dashed #f59e0b', outlineOffset: '2px', borderRadius: '8px' } : undefined,
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onFocusLane(lane.id)} className="w-6 text-center text-[11px] font-bold text-amber-400">
        ▾{laneNumber}
      </button>
      <Chip block={lane} selected={isSel(lane.id)} onClick={click(lane.id)} />
      {lane.chain.filter((b) => BLOCK_DEFS[b.type]).map((b, i) => (
        <span key={b.id} className="flex items-center gap-2">
          <Conn />
          <Chip block={b} selected={isSel(b.id)} onClick={click(b.id)} drag={dragProps(i)} />
        </span>
      ))}
      <Conn />
      <AddBlockMenu variant="chip" onAdd={(type) => onAdd(lane.id, type)} />
      <button
        onClick={click(`mix:${lane.id}`)}
        className={`ml-1 flex items-center gap-1.5 rounded-lg border bg-slate-800/50 px-2.5 py-1.5 text-[12px] transition-colors ${
          isSel(`mix:${lane.id}`) ? 'border-amber-500 ring-1 ring-amber-500/70' : 'border-slate-600/40 hover:border-slate-400/60'
        } ${lane.enabled ? '' : 'opacity-50'}`}
      >
        <span className="font-semibold text-slate-300">Mix</span>
        <span className="text-[10px] tabular-nums text-slate-500">{mixReadout(lane)}</span>
      </button>
      <Port portRef={outputRef} />
    </div>
  )
}
