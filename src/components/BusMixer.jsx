import { Slider, VFader } from './ui'
import { useT } from '../state/uiPrefs'
import ConfirmButton from './ConfirmButton'

// The bus mixer — opens when the ∑ Bus node is selected. One channel-strip
// column per lane: a vertical level fader, a smaller pan control beneath it,
// plus the lane's mute and remove controls. Columns overflow horizontally; we
// intentionally don't handle "too many lanes to fit" yet.
const LEVEL_DEF = { key: 'level', label: 'Level', type: 'range', min: -40, max: 6, step: 0.1, default: 0, format: (v) => `${v.toFixed(1)}dB` }
const PAN_DEF = { key: 'pan', label: 'Pan', type: 'range', min: -1, max: 1, step: 0.01, default: 0, format: (v) => (Math.abs(v) < 0.01 ? 'C' : v < 0 ? `${Math.round(-v * 100)}L` : `${Math.round(v * 100)}R`) }

function Strip({ lane, laneNumber, canRemove, onLaneProp, onToggleMute, onRemoveLane }) {
  const t = useT()
  return (
    <div className={`flex w-28 shrink-0 flex-col items-center gap-2 rounded-lg border border-edge bg-surface p-2 ${lane.enabled ? '' : 'opacity-50'}`}>
      <div className="flex w-full items-center justify-between gap-1 text-[10px]">
        <span className="font-semibold uppercase tracking-wider text-ink-soft">{laneNumber} · {lane.type}</span>
        {canRemove && (
          <ConfirmButton onConfirm={onRemoveLane} className="rounded border border-edge px-1 py-0.5 text-text transition-colors hover:border-danger/50 hover:text-danger-bright">
            ✕
          </ConfirmButton>
        )}
      </div>
      <button
        onClick={onToggleMute}
        className={`w-full rounded border px-2 py-0.5 text-[10px] transition-colors ${
          lane.enabled ? 'border-on/50 bg-on/15 text-on-bright' : 'border-danger/50 bg-danger/15 text-danger-bright'
        }`}
      >
        {lane.enabled ? t('bus.on') : t('bus.muted')}
      </button>
      <VFader def={LEVEL_DEF} value={lane.level ?? 0} onChange={(v) => onLaneProp(lane.id, 'level', v)} />
      <div className="w-full">
        <Slider def={PAN_DEF} value={lane.pan ?? 0} onChange={(v) => onLaneProp(lane.id, 'pan', v)} />
      </div>
    </div>
  )
}

export default function BusMixer({ sound, handlers }) {
  const t = useT()
  const lanes = sound.sources ?? []
  return (
    <div className="min-w-[260px]">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-soft">{t('bus.title')}</span>
      <div className="mt-3 flex gap-3 overflow-x-auto">
        {lanes.map((lane, i) => (
          <Strip
            key={lane.id}
            lane={lane}
            laneNumber={i + 1}
            canRemove={lanes.length > 1}
            onLaneProp={handlers.onLaneProp}
            onToggleMute={() => handlers.onToggle(lane.id)}
            onRemoveLane={() => handlers.onRemoveLane(lane.id)}
          />
        ))}
      </div>
    </div>
  )
}
