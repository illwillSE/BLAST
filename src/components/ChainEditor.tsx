import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight, ClipboardPaste } from 'lucide-react'
import { MASTER, findLane, findBlock, isSource } from '../state/model'
import { useClipboard, getClipboard, copyBlock } from '../state/clipboard'
import type { Block, BlockType, Sequencer, Sound, SourceType, Target } from '../types'
import AddBlockMenu from './AddBlockMenu'
import SequencerModal from './SequencerModal'
import LaneRow from './LaneRow'
import LaneTimeline from './LaneTimeline'
import InspectorDock from './InspectorDock'
import type { InspectorHandlers } from './InspectorDock'
import Chip from './Chip'
import BackgroundVisualization from './BackgroundVisualization'
import { getColor } from '../theme/colors'
import { useT, useUIPrefs } from '../state/uiPrefs'

const Conn = () => <ChevronRight size={12} className="shrink-0 text-faint" />

interface PathInfo { id: string; enabled: boolean; d: string }

interface ChainEditorProps {
  sound: Sound
  onParam: (blockId: string, key: string, value: unknown) => void
  onToggle: (blockId: string) => void
  onRemove: (blockId: string) => void
  onMove: (target: Target, from: number, to: number) => void
  onAdd: (target: Target, type: BlockType) => string | undefined
  onSwapSource: (blockId: string, type: SourceType) => void
  onLaneProp: (laneId: string, key: string, value: number) => void
  onAddSource: () => string | undefined
  onRemoveLane: (laneId: string) => void
  onOutputVolume: (v: number) => void
  onVoicing: (v: 'mono' | 'poly') => void
  onSequencer: (patch: Partial<Sequencer>) => void
  onPasteBlock: (target: Target) => string | undefined
  onPasteSourceLane: () => string | undefined
  onPasteValues: (blockId: string) => void
  initialSelectedKey?: string
}

export default function ChainEditor({
  sound, onParam, onToggle, onRemove, onMove, onAdd, onSwapSource,
  onLaneProp, onAddSource, onRemoveLane, onOutputVolume, onVoicing,
  onSequencer, onPasteBlock, onPasteSourceLane, onPasteValues, initialSelectedKey,
}: ChainEditorProps) {
  const t = useT()
  const { backgroundViz } = useUIPrefs()
  // `initialSelectedKey` lets a caller (the tutorial) open a specific block on
  // load — e.g. pre-select a chain block so its controls are already in the
  // inspector. Defaults to the first source.
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => [initialSelectedKey ?? sound.sources[0]!.id])
  const [focusedLane, setFocusedLane] = useState<string>(() => findLane(sound, initialSelectedKey ?? '')?.id ?? sound.sources[0]!.id)
  const [inspectorMin, setInspectorMin] = useState(false)
  const [seqModalOpen, setSeqModalOpen] = useState(false)
  const masterDragIndex = useRef<number | null>(null)
  const [masterDropTarget, setMasterDropTarget] = useState<number | null>(null)

  // Reset selection/focus when switching to a different sound (honouring an
  // initial pre-selection, e.g. the sound the tutorial just loaded).
  useEffect(() => {
    const initKey = initialSelectedKey ?? sound.sources[0]!.id
    setSelectedKeys([initKey])
    setFocusedLane(findLane(sound, initKey)?.id ?? sound.sources[0]!.id)
    setInspectorMin(false)
  }, [sound.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selection valid if blocks/lanes disappear (remove, mute rebuild, etc.).
  const valid = (k: string) => k === 'output' || k === 'seq' || k === 'bus'
    || (!!k && !!findLane(sound, k)) || (!!k && sound.master.some((b) => b.id === k))
  useEffect(() => {
    const kept = selectedKeys.filter(valid)
    if (kept.length !== selectedKeys.length) setSelectedKeys(kept.length ? kept : [initialSelectedKey ?? sound.sources[0]!.id])
    if (!sound.sources.some((s) => s.id === focusedLane)) setFocusedLane(sound.sources[0]!.id)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  function select(key: string, additive?: boolean) {
    setInspectorMin(false)
    setSelectedKeys((cur) => {
      if (additive) return cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
      return [key]
    })
    const laneId = findLane(sound, key)?.id
    if (laneId && !additive) setFocusedLane(laneId)
  }

  // Clicking empty canvas background clears the selection and tucks the inspector away.
  function deselect() {
    setSelectedKeys([])
    setInspectorMin(true)
  }

  function focusLane(laneId: string) {
    setInspectorMin(false)
    setFocusedLane(laneId)
    const src = sound.sources.find((s) => s.id === laneId)
    if (src) setSelectedKeys([src.id])
  }

  function handleAdd(target: Target, type: BlockType) {
    const id = onAdd(target, type)
    if (!id) return
    setInspectorMin(false)
    setSelectedKeys([id])
    if (target !== MASTER) setFocusedLane(target)
  }

  function handleAddSource() {
    const id = onAddSource()
    if (!id) return
    setInspectorMin(false)
    setFocusedLane(id)
    setSelectedKeys([id])
  }

  function handlePaste(target: Target) {
    const id = onPasteBlock(target)
    if (!id) return
    setInspectorMin(false)
    setSelectedKeys([id])
    if (target !== MASTER) setFocusedLane(target)
  }

  function handlePasteSource() {
    const id = onPasteSourceLane()
    if (!id) return
    setInspectorMin(false)
    setFocusedLane(id)
    setSelectedKeys([id])
  }

  // Cmd/Ctrl-C copies the single selected block; Cmd/Ctrl-V pastes into the
  // focused lane (a copied source becomes a new lane). Text entry keeps the
  // browser's own copy/paste.
  const clip = useClipboard()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const el = document.activeElement as HTMLInputElement | null
      const isTextEntry = el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && el.type !== 'range')
      if (isTextEntry) return
      const key = e.key.toLowerCase()
      if (key === 'c') {
        const sel = selectedKeys.filter((k) => k !== 'output' && k !== 'bus')
        const block = sel.length === 1 ? findBlock(sound, sel[0]!) : null
        if (!block) return
        e.preventDefault()
        copyBlock(block)
      } else if (key === 'v') {
        const c = getClipboard()
        if (c?.kind !== 'block') return
        e.preventDefault()
        if (isSource(c.block as Block)) handlePasteSource()
        else handlePaste(focusedLane)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // --- bezier connectors from each lane's output port to the mix bus -------
  const wrapRef = useRef<HTMLDivElement>(null)
  const busRef = useRef<HTMLDivElement>(null)
  const portRefs = useRef(new Map<string, HTMLSpanElement>())
  const [paths, setPaths] = useState<PathInfo[]>([])
  const setPortRef = (id: string) => (el: HTMLSpanElement | null) => { if (el) portRefs.current.set(id, el); else portRefs.current.delete(id) }

  useLayoutEffect(() => {
    const compute = () => {
      const wrap = wrapRef.current
      const bus = busRef.current
      if (!wrap || !bus) return
      const wr = wrap.getBoundingClientRect()
      const br = bus.getBoundingClientRect()
      const bx = br.left - wr.left
      const by = br.top - wr.top + br.height / 2
      const next: PathInfo[] = []
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

  // Master chain reorder — mirrors LaneRow's dragProps but targets MASTER.
  function masterDragProps(index: number): React.HTMLAttributes<HTMLElement> {
    return {
      draggable: true,
      onDragStart: (e) => { masterDragIndex.current = index; e.dataTransfer.effectAllowed = 'move' },
      onDragEnd: () => { masterDragIndex.current = null; setMasterDropTarget(null) },
      onDragOver: (e) => {
        if (masterDragIndex.current === null || masterDragIndex.current === index) return
        e.preventDefault()
        setMasterDropTarget(index)
      },
      onDrop: (e) => {
        e.preventDefault()
        if (masterDragIndex.current !== null && masterDragIndex.current !== index) onMove(MASTER, masterDragIndex.current, index)
        masterDragIndex.current = null
        setMasterDropTarget(null)
      },
      style: masterDropTarget === index ? { outline: `2px dashed ${getColor('accent-deep')}`, outlineOffset: '2px', borderRadius: '8px' } : undefined,
    }
  }

  const isSel = (k: string) => selectedKeys.includes(k)
  const handlers: InspectorHandlers = { onParam, onToggle, onRemove, onSwapSource, onLaneProp, onRemoveLane, onOutputVolume, onVoicing, onSequencer, onPasteValues, onSelect: select }
  const seqOn = sound.sequencer?.enabled

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LaneTimeline sound={sound} onLaneProp={onLaneProp} />

      {/* Clicking empty canvas (padding, gaps, lane stack background) deselects.
          data-canvas-bg marks those background surfaces; chips/cards bubble up
          here but carry no marker, so they don't trigger a deselect. */}
      <div
        data-canvas-bg
        onClick={(e) => { if ((e.target as HTMLElement).dataset.canvasBg !== undefined) deselect() }}
        className="relative min-h-0 flex-1 overflow-auto p-4"
      >
        <BackgroundVisualization
          enabled={backgroundViz}
          onBackgroundClick={deselect}
        />
        <div ref={wrapRef} data-canvas-bg className="relative flex items-stretch gap-6">
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
          <div data-canvas-bg className="relative z-20 flex flex-col gap-2">
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
                onAddMenuOpen={() => setInspectorMin(true)}
                outputRef={setPortRef(lane.id)}
              />
            ))}
            <div className="flex items-center gap-2 pl-8">
              <button
                data-tut="add-source"
                onClick={handleAddSource}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-accent-dim/50 px-3 text-[11px] font-semibold uppercase tracking-wider text-accent-deep/70 transition-colors hover:border-accent-deep hover:bg-accent-deep/10 hover:text-accent"
              >
                <span className="text-base leading-none">+</span> {t('chain.addSource')}
              </button>
              {clip?.kind === 'block' && isSource(clip.block as Block) && (
                <button
                  onClick={handlePasteSource}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-accent-dim/50 px-3 text-[11px] font-semibold uppercase tracking-wider text-accent-deep/70 transition-colors hover:border-accent-deep hover:bg-accent-deep/10 hover:text-accent"
                >
                  <ClipboardPaste size={13} className="shrink-0" /> {t('chain.pasteSource')}
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
            {sound.master.map((b, i) => (
              <span key={b.id} className="flex items-center gap-2">
                <Conn />
                <Chip
                  block={b}
                  selected={isSel(b.id)}
                  onClick={(e) => select(b.id, e.shiftKey || e.metaKey)}
                  onParam={onParam}
                  drag={masterDragProps(i)}
                />
              </span>
            ))}
            <Conn />
            <AddBlockMenu variant="chip" excludeKinds={['control']} label={t('chain.addMaster')} onAdd={(type) => handleAdd(MASTER, type)} onPaste={() => handlePaste(MASTER)} onOpen={() => setInspectorMin(true)} />
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
              data-tut="sequencer"
              onClick={(e) => { select('seq', e.shiftKey || e.metaKey); setSeqModalOpen(true) }}
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

      <InspectorDock sound={sound} selectedKeys={selectedKeys} handlers={handlers} minimized={inspectorMin} onToggleMinimize={() => setInspectorMin((m) => !m)} />
      {seqModalOpen && <SequencerModal sound={sound} onChange={onSequencer} onClose={() => setSeqModalOpen(false)} />}
    </div>
  )
}
