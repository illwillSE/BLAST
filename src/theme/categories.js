// Per-block category colors. These need several related shades per hue
// (bright text, mid dot, faded border, faint glow), so they stay explicit
// Tailwind class strings rather than single @theme tokens — and the strings
// must be complete literals because Tailwind v4 can't compile dynamic class
// names (see CLAUDE.md). The neutral + accent palette lives in `theme.css`.
export const CAT_STYLES = {
  source: { text: 'text-amber-300', border: 'border-amber-400/30', dot: 'bg-amber-400', glow: 'shadow-amber-500/10' },
  dynamics: { text: 'text-sky-300', border: 'border-sky-400/30', dot: 'bg-sky-400', glow: 'shadow-sky-500/10' },
  filter: { text: 'text-emerald-300', border: 'border-emerald-400/30', dot: 'bg-emerald-400', glow: 'shadow-emerald-500/10' },
  time: { text: 'text-violet-300', border: 'border-violet-400/30', dot: 'bg-violet-400', glow: 'shadow-violet-500/10' },
  pitch: { text: 'text-rose-300', border: 'border-rose-400/30', dot: 'bg-rose-400', glow: 'shadow-rose-500/10' },
  distortion: { text: 'text-orange-300', border: 'border-orange-400/30', dot: 'bg-orange-400', glow: 'shadow-orange-500/10' },
  utility: { text: 'text-slate-300', border: 'border-slate-400/30', dot: 'bg-slate-400', glow: 'shadow-slate-500/10' },
}
