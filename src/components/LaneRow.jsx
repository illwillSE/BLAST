import { useRef, useState } from 'react'
import { BLOCK_DEFS } from '../blocks/registry'
import { CAT_STYLES } from './ui'
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

  // Slim (unfocused) lane: a single compact bar; click anywhere to focus.
  if (!focused) {
    const chain = lane.chain.filter((b) => BLOCK_DEFS[b.type])
    return (
      <div className="flex items-center gap-2 opacity-80">
        <button onClick={() => onFocusLane(lane.id)} className="w-6 text-center text-[11px] font-bold text-slate-500 hover:text-amber-400">
          ▸{laneNumber}
        </button>
        <button
          onClick={() => onFocusLane(lane.id)}
          className={`flex items-center gap-2 rounded-lg border bg-slate-900/50 px-3 py-1.5 text-[12px] transition-colors hover:border-slate-500/60 ${
            lane.enabled ? 'border-slate-800' : 'border-slate-800 opacity-60'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="text-slate-300">{BLOCK_DEFS[lane.type].name}</span>
          {chain.map((b) => {
            const cat = CAT_STYLES[BLOCK_DEFS[b.type].category]
            return (
              <span key={b.id} className="flex items-center gap-2">
                <span className="text-slate-600">·</span>
                <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
                <span className={!b.enabled ? 'text-slate-600 line-through' : 'text-slate-300'}>
                  {BLOCK_DEFS[b.type].name}
                </span>
              </span>
            )
          })}
          <span className="ml-1.5 text-[10px] tabular-nums text-slate-500">{mixReadout(lane)}</span>
          {!lane.enabled && <span className="rounded bg-red-500/15 px-1 text-[9px] uppercase text-red-300">muted</span>}
        </button>
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
