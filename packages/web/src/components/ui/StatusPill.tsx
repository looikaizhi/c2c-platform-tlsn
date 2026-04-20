interface StatusPillProps {
    label: string;
    tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const toneClass: Record<NonNullable<StatusPillProps['tone']>, string> = {
    success: 'border-[color:rgb(14_203_129_/_38%)] bg-[color:rgb(14_203_129_/_14%)] text-[var(--state-success)]',
    warning: 'border-[color:rgb(240_185_11_/_45%)] bg-[color:rgb(240_185_11_/_16%)] text-[var(--state-warning)]',
    danger: 'border-[color:rgb(246_70_93_/_45%)] bg-[color:rgb(246_70_93_/_14%)] text-[var(--state-danger)]',
    info: 'border-[color:rgb(78_164_255_/_45%)] bg-[color:rgb(78_164_255_/_14%)] text-[var(--state-info)]',
    neutral: 'border-[var(--line-soft)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)]',
};

export default function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
    return (
        <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] ${toneClass[tone]}`}>
            {label}
        </span>
    );
}
