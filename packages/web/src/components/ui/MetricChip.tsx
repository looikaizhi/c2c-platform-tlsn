interface MetricChipProps {
    label: string;
    value: string;
    hint?: string;
    tone?: 'neutral' | 'success' | 'warning' | 'info';
}

const toneClass: Record<NonNullable<MetricChipProps['tone']>, string> = {
    neutral: 'border-[var(--line-soft)] bg-[var(--bg-surface-1)]',
    success: 'border-[color:rgb(14_203_129_/_45%)] bg-[color:rgb(14_203_129_/_10%)]',
    warning: 'border-[color:rgb(240_185_11_/_45%)] bg-[color:rgb(240_185_11_/_10%)]',
    info: 'border-[color:rgb(78_164_255_/_45%)] bg-[color:rgb(78_164_255_/_10%)]',
};

export default function MetricChip({
    label,
    value,
    hint,
    tone = 'neutral',
}: MetricChipProps) {
    return (
        <div className={`rounded-lg border px-3 py-2.5 ${toneClass[tone]}`}>
            <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 font-[var(--font-mono)] text-base font-semibold text-white">{value}</p>
            {hint ? <p className="mt-1 text-xs text-[var(--text-subtle)]">{hint}</p> : null}
        </div>
    );
}
