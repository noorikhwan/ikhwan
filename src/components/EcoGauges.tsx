export function RadialHealthGauge({
  scorePct,
  label,
}: {
  scorePct: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(scorePct)));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const strokeColor =
    clamped >= 85 ? '#009530' : clamped >= 65 ? '#D97706' : '#DC2626';

  return (
    <div className="relative w-[76px] h-[76px] shrink-0 flex items-center justify-center">
      <svg viewBox="0 0 76 76" className="w-[76px] h-[76px] -rotate-90" aria-hidden="true">
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-50 tabular-nums leading-none">
          {clamped}%
        </span>
        <span className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 leading-none">
          {label}
        </span>
      </div>
    </div>
  );
}

export function SemiArcPueGauge({ pue }: { pue: number }) {
  // Ideal PUE = 1.10 (full green), 2.00 (red)
  const norm = Math.max(0, Math.min(1, (pue - 1.1) / 0.9));
  const fillFraction = 1 - norm * 0.75; // Higher arc = better efficiency
  const r = 30;
  const halfCircumference = Math.PI * r;
  const dashOffset = halfCircumference * (1 - fillFraction);
  const strokeColor = pue <= 1.35 ? '#009530' : pue <= 1.6 ? '#D97706' : '#DC2626';

  return (
    <div className="relative w-[84px] h-[54px] shrink-0 flex items-end justify-center">
      <svg viewBox="0 0 84 50" className="w-[84px] h-[50px]" aria-hidden="true">
        <path
          d="M 12 42 A 30 30 0 0 1 72 42"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <path
          d="M 12 42 A 30 30 0 0 1 72 42"
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={halfCircumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-300"
        />
      </svg>
      <div className="absolute bottom-0.5 inset-x-0 text-center">
        <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-50 tabular-nums leading-none">
          {pue.toFixed(2)}
        </div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">PUE</div>
      </div>
    </div>
  );
}
