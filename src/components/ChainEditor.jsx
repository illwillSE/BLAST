import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MASTER, findLane } from '../state/model'
import AddBlockMenu from './AddBlockMenu'
import LaneRow from './LaneRow'
import LaneTimeline from './LaneTimeline'
import InspectorDock from './InspectorDock'
import Chip from './Chip'
import OutputVisualizer from './OutputVisualizer'

const Conn = () => <span className="text-[13px] text-slate-600">›</span>

export default function ChainEditor({
  sound, onParam, onToggle, onRemove, onMove, onAdd, onSwapSource,
  onLaneProp, onAddSource, onRemoveLane, onOutputVolume, onOutputView,
}) {
  const [selectedKeys, setSelectedKeys] = useState(() => [sound.sources[0]?.id])
  const [focusedLane, setFocusedLane] = useState(() => sound.sources[0]?.id)

  // Reset selection/focus when switching to a different sound.
  useEffect(() => {
    setSelectedKeys([sound.sources[0]?.id])
    setFocusedLane(sound.sources[0]?.id)
  }, [sound.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selection valid if blocks/lanes disappear (remove, mute rebuild, etc.).
  const valid = (k) => k === 'output' || (k?.startsWith('mix:') && sound.sources.some((s) => s.id === k.slice(4)))
    || (k && findLane(sound, k)) || (k && sound.master.some((b) => b.id === k))
  useEffect(() => {
    const kept = selectedKeys.filter(valid)
    if (kept.length !== selectedKeys.length) setSelectedKeys(kept.length ? kept : [sound.sources[0]?.id])
    if (!sound.sources.some((s) => s.id === focusedLane)) setFocusedLane(sound.sources[0]?.id)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  function select(key, additive) {
    setSelectedKeys((cur) => {
      if (additive) return cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
      return [key]
    })
    const laneId = key.startsWith('mix:') ? key.slice(4) : findLane(sound, key)?.id
    if (laneId && !additive) setFocusedLane(laneId)
  }

  function focusLane(laneId) {
    setFocusedLane(laneId)
    const src = sound.sources.find((s) => s.id === laneId)
    if (src) setSelectedKeys([src.id])
  }

  function handleAdd(target, type) {
    const id = onAdd(target, type)
    if (!id) return
    setSelectedKeys([id])
    if (target !== MASTER) setFocusedLane(target)
  }

  function handleAddSource() {
    const id = onAddSource()
    if (!id) return
    setFocusedLane(id)
    setSelectedKeys([id])
  }

  // --- bezier connectors from each lane's output port to the mix bus -------
  const wrapRef = useRef(null)
  const busRef = useRef(null)
  const portRefs = useRef(new Map())
  const [paths, setPaths] = useState([])
  const setPortRef = (id) => (el) => { el ? portRefs.current.set(id, el) : portRefs.current.delete(id) }

  useLayoutEffect(() => {
    const compute = () => {
      const wrap = wrapRef.current
      const bus = busRef.current
      if (!wrap || !bus) return
      const wr = wrap.getBoundingClientRect()
      const br = bus.getBoundingClientRect()
      const bx = br.left - wr.left
      const by = br.top - wr.top + br.height / 2
      const next = []
      for (const lane of sound.sources) {
        const el = portRefs.current.get(lane.id)
        if (!el) continue
        const r = el.getBoundingClientRect()
        const x1 = r.right - wr.left
        const y1 = r.top - wr.top + r.height / 2
        const dx = Math.max(24, (bx - x1) * 0.5)
        next.push({ id: lane.id, enabled: lane.enabled, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${bx - dx} ${by}, ${bx} ${by}` })
      }
      setPaths(next)
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (wrapRef.current) ro.observe(wrapRef.current)
    if (busRef.current) ro.observe(busRef.current)
    window.addEventListener('resize', compute)
    return () => { ro.disconnect(); window.removeEventListener('resize', compute) }
  }, [sound, focusedLane, selectedKeys])

  const isSel = (k) => selectedKeys.includes(k)
  const multiLane = sound.sources.length > 1
  const handlers = { onParam, onToggle, onRemove, onSwapSource, onLaneProp, onRemoveLane, onOutputVolume, onOutputView }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {multiLane && <LaneTimeline sound={sound} onLaneProp={onLaneProp} />}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div ref={wrapRef} className="relative flex items-stretch gap-6">
          <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" style={{ overflow: 'visible' }}>
            <defs>
              <marker id="lane-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke" />
              </marker>
            </defs>
            {paths.map((p) => (
              <path key={p.id} d={p.d} fill="none" stroke={p.enabled ? '#f59e0b' : '#475569'}
                strokeOpacity={p.enabled ? 0.7 : 0.4} strokeWidth="1.5" markerEnd="url(#lane-arrow)" />
            ))}
          </svg>

          {/* lanes */}
          <div className="relative z-10 flex flex-col gap-2">
            {sound.sources.map((lane, i) => (
              <LaneRow
                key={lane.id}
                lane={lane}
                laneNumber={i + 1}
                focused={focusedLane === lane.id}
                selectedKeys={selectedKeys}
                onSelect={select}
                onFocusLane={focusLane}
                onMove={onMove}
                onAdd={handleAdd}
                outputRef={setPortRef(lane.id)}
              />
            ))}
            <div className="flex items-center gap-2 pl-8">
              <button
                onClick={handleAddSource}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-amber-700/50 px-3 text-[11px] font-semibold uppercase tracking-wider text-amber-500/80 transition-colors hover:border-amber-500/70 hover:text-amber-400"
              >
                <span className="text-base leading-none">+</span> Source
              </button>
            </div>
          </div>

          {/* mix bus → master → output, centered against the lane stack */}
          <div className="relative z-10 flex items-center gap-2 self-center">
            <div ref={busRef} className="rounded-lg border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">∑ Bus</div>
              <div className="text-[9px] text-slate-600">all lanes</div>
            </div>
            {sound.master.map((b) => (
              <span key={b.id} className="flex items-center gap-2">
                <Conn />
                <Chip block={b} selected={isSel(b.id)} onClick={(e) => select(b.id, e.shiftKey || e.metaKey)} />
              </span>
            ))}
            <Conn />
            <AddBlockMenu variant="chip" excludeKinds={['control']} label="Add Master" onAdd={(type) => handleAdd(MASTER, type)} />
            <Conn />
            <button
              onClick={(e) => select('output', e.shiftKey || e.metaKey)}
              className={`overflow-hidden rounded-lg border transition-colors ${
                isSel('output') ? 'border-amber-500 ring-1 ring-amber-500/70' : 'border-slate-600/50 hover:border-slate-400/60'
              }`}
            >
              <div className="bg-slate-950/60 px-2 pt-1.5">
                <OutputVisualizer mode={sound.outputView ?? 'wave'} />
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900/70 px-2.5 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Out</span>
                <span className="text-[10px] tabular-nums text-slate-500">{(sound.outputVolume ?? 0).toFixed(1)}dB</span>
                <span className="text-[10px] text-slate-600">· {sound.outputView ?? 'wave'}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <InspectorDock sound={sound} selectedKeys={selectedKeys} handlers={handlers} />
    </div>
  )
}
