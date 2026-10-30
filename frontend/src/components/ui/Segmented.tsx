/** Compact segmented control (tabs that switch a view in place). */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /** Accessible name of the group. */
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className="inline-flex flex-wrap rounded-lg border p-0.5 gap-0.5"
      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted) / 0.5)' }}
      role="tablist"
      aria-label={label}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.key)}
            className={`${size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'} rounded-md transition-colors font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            style={{
              backgroundColor: selected ? 'hsl(var(--card))' : 'transparent',
              color: selected ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              boxShadow: selected ? '0 1px 2px rgb(0 0 0 / 0.08)' : undefined,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
