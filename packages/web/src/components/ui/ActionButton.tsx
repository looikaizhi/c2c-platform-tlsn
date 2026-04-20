interface ActionButtonProps {
    type?: 'button' | 'submit';
    onClick?: () => void;
    disabled?: boolean;
    children: React.ReactNode;
    className?: string;
    tone?: 'primary' | 'success' | 'danger' | 'ghost';
}

const toneClass: Record<NonNullable<ActionButtonProps['tone']>, string> = {
    primary: 'border border-[color:rgb(252_213_53_/_75%)] bg-[var(--accent-cta)] text-[var(--text-inverse)] hover:bg-[color:rgb(245_197_24_/_96%)]',
    success: 'border border-[color:rgb(14_203_129_/_70%)] bg-[var(--state-success)] text-[var(--text-inverse)] hover:bg-[color:rgb(10_181_116_/_96%)]',
    danger: 'border border-[color:rgb(246_70_93_/_72%)] bg-[var(--state-danger)] text-white hover:bg-[color:rgb(229_56_81_/_96%)]',
    ghost: 'border border-[var(--line-soft)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:text-white',
};

export default function ActionButton({
    type = 'button',
    onClick,
    disabled,
    children,
    className = '',
    tone = 'primary',
}: ActionButtonProps) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`h-11 rounded-lg px-4 text-sm font-semibold transition-all duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(252_213_53_/_35%)] ${toneClass[tone]} disabled:cursor-not-allowed disabled:border-[var(--line-soft)] disabled:bg-[var(--bg-surface-3)] disabled:text-[var(--text-muted)] disabled:opacity-70 ${className}`}
        >
            {children}
        </button>
    );
}
