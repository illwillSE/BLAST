import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MASTER, findLane, findBlock, isSource } from '../state/model'
import { useClipboard, getClipboard, copyBlock } from '../state/clipboard'
import AddBlockMenu from './AddBlockMenu'
import LaneRow from './LaneRow'
import LaneTimeline from './LaneTimeline'
import InspectorDock from './InspectorDock'
import Chip from './Chip'
import { getColor } from '../theme/colors'
import { useT } from '../state/uiPrefs'

const Conn = () => <span className="text-[13px] text-faint">›</span>

export default function ChainEditor({
  sound, onParam, onToggle, onRemove, onMove, onAdd, onSwapSource,
  onLaneProp, onAddSource, onRemoveLane, onOutputVolume, onVoicing,
  onSequencer, onPasteBlock, onPasteSourceLane, onPasteValues,
}) {
  const t = useT()
  const [selectedKeys, setSelectedKeys] = useState(() => [sound.sources[0]?.id])
  const [focusedLane, setFocusedLane] = useState(() => sound.sources[0]?.id)

  // Reset selection/focus when switching to a different sound.
  useEffect(() => {
    setSelectedKeys([sound.sources[0]?.id])
    setFocusedLane(sound.sources[0]?.id)
  }, [sound.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selection valid if blocks/lanes disappear (remove, mute rebuild, etc.).
  const valid = (k) => k === 'output' || k === 'seq' || k === 'bus'
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
    const laneId = findLane(sound, key)?.id
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

  function handlePaste(target) {
    const id = onPasteBlock(target)
    if (!id) return
    setSelectedKeys([id])
    if (target !== MASTER) setFocusedLane(target)
  }

  function handlePasteSource() {
    const id = onPasteSourceLane()
    if (!id) return
    setFocusedLane(id)
    setSelectedKeys([id])
  }

  // Cmd/Ctrl-C copies the single selected block; Cmd/Ctrl-V pastes into the
  // focused lane (a copied source becomes a new lane). Text entry keeps the
  // browser's own copy/paste.
  const clip = useClipboard()
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const el = document.activeElement
      const isTextEntry = el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && el.type !== 'range')
      if (isTextEntry) return
      const key = e.key.toLowerCase()
      if (key === 'c') {
        const sel = selectedKeys.filter((k) => k !== 'output' && k !== 'bus')
        const block = sel.length === 1 ? findBlock(sound, sel[0]) : null
        if (!block) return
        e.preventDefault()
        copyBlock(block)
      } else if (key === 'v') {
        const c = getClipboard()
        if (c?.kind !== 'block') return
        e.preventDefault()
        isSource(c.block) ? handlePasteSource() : handlePaste(focusedLane)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

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
  const handlers = { onParam, onToggle, onRemove, onSwapSource, onLaneProp, onRemoveLane, onOutputVolume, onVoicing, onSequencer, onPasteValues, onSelect: select }
  const seqOn = sound.sequencer?.enabled

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
              <path key={p.id} d={p.d} fill="none" stroke={p.enabled ? getColor('accent-deep') : getColor('faint')}
                strokeOpacity={p.enabled ? 0.8 : 0.5} strokeWidth="1.5" markerEnd="url(#lane-arrow)" />
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
                onPaste={handlePaste}
                onParam={onParam}
                outputRef={setPortRef(lane.id)}
              />
            ))}
            <div className="flex items-center gap-2 pl-8">
              <button
                onClick={handleAddSource}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-accent-dim/50 px-3 text-[11px] font-semibold uppercase tracking-wider text-accent-deep/80 transition-colors hover:border-accent-deep/70 hover:text-accent"
              >
                <span className="text-base leading-none">+</span> {t('chain.addSource')}
              </button>
              {clip?.kind === 'block' && isSource(clip.block) && (
                <button
                  onClick={handlePasteSource}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-accent-dim/50 px-3 text-[11px] font-semibold uppercase tracking-wider text-accent-deep/80 transition-colors hover:border-accent-deep/70 hover:text-accent"
                >
                  <span className="text-base leading-none">⇲</span> {t('chain.pasteSource')}
                </button>
              )}
            </div>
          </div>

          {/* mix bus → master → output, centered against the lane stack */}
          <div className="relative z-10 flex items-center gap-2 self-center">
            <div
              ref={busRef}
              onClick={(e) => select('bus', e.shiftKey || e.metaKey)}
              className={`cursor-pointer rounded-lg border bg-surface px-3 py-2 text-center shadow-sm transition-colors ${
                isSel('bus') ? 'border-accent-deep ring-1 ring-accent-deep/70' : 'border-edge hover:border-edge-hover'
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text">{t('chain.bus')}</div>
              <div className="text-[9px] text-faint">{t('chain.allLanes')}</div>
            </div>
            {sound.master.map((b) => (
              <span key={b.id} className="flex items-center gap-2">
                <Conn />
                <Chip block={b} selected={isSel(b.id)} onClick={(e) => select(b.id, e.shiftKey || e.metaKey)} />
              </span>
            ))}
            <Conn />
            <AddBlockMenu variant="chip" excludeKinds={['control']} excludeTypes={['visualizer']} label={t('chain.addMaster')} onAdd={(type) => handleAdd(MASTER, type)} onPaste={() => handlePaste(MASTER)} />
            <Conn />
            <div
              onClick={(e) => select('output', e.shiftKey || e.metaKey)}
              className={`cursor-pointer overflow-hidden rounded-lg border transition-colors ${
                isSel('output') ? 'border-accent-deep ring-1 ring-accent-deep/70' : 'border-edge hover:border-edge-hover'
              } shadow-sm`}
            >
              <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{t('chain.out')}</span>
                <span className="text-[10px] tabular-nums text-muted">{(sound.outputVolume ?? 0).toFixed(1)}dB</span>
              </div>
              {/* Voicing status — display only; clicking the card selects Out,
                  where the mono/poly toggle lives. */}
              <div className="flex items-center gap-1 border-t border-edge/40 bg-surface px-2 pb-1 pt-0.5">
                <span className={`h-1.5 w-1.5 rounded-full ${(sound.voicing ?? 'poly') === 'mono' ? 'bg-faint' : 'bg-on-bright'}`} />
                <span className="text-[9px] uppercase tracking-wide text-faint">{sound.voicing ?? 'poly'}</span>
              </div>
            </div>
            <Conn />
            {/* Sound-level step sequencer — drives the trigger, sits after Output. */}
            <button
              onClick={(e) => select('seq', e.shiftKey || e.metaKey)}
              title={t('chain.seqTitle')}
              className={`flex items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 text-[12px] shadow-sm transition-colors ${
                isSel('seq') ? 'border-accent-deep ring-1 ring-accent-deep/70' : 'border-edge hover:border-edge-hover'
              } ${seqOn ? '' : 'opacity-60'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${seqOn ? 'bg-on-bright' : 'bg-faint'}`} />
              <span className="font-semibold text-ink-soft">{t('chain.seq')}</span>
              <span className="text-[10px] tabular-nums text-muted">
                {seqOn ? `${sound.sequencer.steps.length} steps` : t('chain.seqOff')}
              </span>
            </button>
          </div>
        </div>
      </div>

      <InspectorDock sound={sound} selectedKeys={selectedKeys} handlers={handlers} />
    </div>
  )
}
