interface SectionHeaderProps {
    eyebrow?: string;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export default function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps) {
    return (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
                {eyebrow ? (
                    <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{eyebrow}</p>
                ) : null}
                <h2 className="mt-1 font-[var(--font-heading)] text-[1.65rem] font-semibold text-white">{title}</h2>
                {description ? (
                    <p className="mt-1 max-w-3xl text-sm text-[var(--text-subtle)]">{description}</p>
                ) : null}
            </div>
            {action}
        </div>
    );
}
