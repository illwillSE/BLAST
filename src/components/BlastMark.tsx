// BLAST logo symbol: a burst (corner spikes) around a centered waveform.
// Identical markup to public/favicon.svg — one shape, two consumers. Inline so
// it scales and sits in the intro modal; favicon.svg is the standalone tab icon.
export default function BlastMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#0f172a" />
      <g stroke="#fbbf24" strokeWidth="4" strokeLinecap="round">
        <line x1="16" y1="16" x2="8" y2="8" />
        <line x1="48" y1="16" x2="56" y2="8" />
        <line x1="16" y1="48" x2="8" y2="56" />
        <line x1="48" y1="48" x2="56" y2="56" />
      </g>
      <g fill="#fbbf24">
        <rect x="16" y="25" width="4" height="14" rx="2" />
        <rect x="23" y="19" width="4" height="26" rx="2" />
        <rect x="30" y="13" width="4" height="38" rx="2" />
        <rect x="37" y="19" width="4" height="26" rx="2" />
        <rect x="44" y="25" width="4" height="14" rx="2" />
      </g>
    </svg>
  )
}
