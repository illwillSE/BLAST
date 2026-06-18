import { useRef, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { BLOCK_DEFS } from '../blocks/registry'
import AddBlockMenu from './AddBlockMenu'
import Chip from './Chip'
import { getColor } from '../theme/colors'

const Conn = () => <ChevronRight size={12} className="shrink-0 text-faint" />
const Port = ({ portRef }) => <span ref={portRef} className="ml-1 h-2 w-2 shrink-0 rounded-full bg-edge-2" />

export default function LaneRow({
  lane, laneNumber, focused, selectedKeys, onSelect, onFocusLane, onMove, onAdd, onPaste, onParam, outputRef,
}) {
  const dragIndex = useRef(null)
  const [dropTarget, setDropTarget] = useState(null)
  const isSel = (key) => selectedKeys.includes(key)
  const click = (key) => (e) => onSelect(key, e.shiftKey || e.metaKey)

  // Unfocused lane: same chip pills as focused, but dimmed and without drag/add.
  if (!focused) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => onFocusLane(lane.id)} className="flex w-6 items-center justify-center text-[11px] font-bold text-muted hover:text-accent">
          <ChevronRight size={11} />{laneNumber}
        </button>
        <Chip block={lane} selected={isSel(lane.id)} onClick={click(lane.id)} />
        {lane.chain.filter((b) => BLOCK_DEFS[b.type]).map((b) => (
          <span key={b.id} className="flex items-center gap-2">
            <Conn />
            <Chip block={b} selected={isSel(b.id)} onClick={click(b.id)} onParam={onParam} />
          </span>
        ))}
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
      style: dropTarget === index ? { outline: `2px dashed ${getColor('accent-deep')}`, outlineOffset: '2px', borderRadius: '8px' } : undefined,
    }
  }

  return (
    <div data-tut="lane-chain" className="flex items-center gap-2">
      <button onClick={() => onFocusLane(lane.id)} className="flex w-6 items-center justify-center text-[11px] font-bold text-accent">
        <ChevronDown size={11} />{laneNumber}
      </button>
      <Chip block={lane} selected={isSel(lane.id)} onClick={click(lane.id)} />
      {lane.chain.filter((b) => BLOCK_DEFS[b.type]).map((b, i) => (
        <span key={b.id} className="flex items-center gap-2">
          <Conn />
          <Chip block={b} selected={isSel(b.id)} onClick={click(b.id)} onParam={onParam} drag={dragProps(i)} />
        </span>
      ))}
      <Conn />
      <AddBlockMenu variant="chip" dataTut="add-effect" onAdd={(type) => onAdd(lane.id, type)} onPaste={() => onPaste(lane.id)} />
      <Port portRef={outputRef} />
    </div>
  )
}
