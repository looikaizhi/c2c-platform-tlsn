interface SurfaceCardProps {
    children: React.ReactNode;
    className?: string;
    elevated?: boolean;
}

export default function SurfaceCard({ children, className = '', elevated = false }: SurfaceCardProps) {
    return (
        <div
            className={`rounded-xl border border-[var(--line-soft)] ${
                elevated
                    ? 'bg-[var(--bg-surface-2)] shadow-[0_10px_24px_rgb(0_0_0_/_28%)]'
                    : 'bg-[var(--bg-surface-1)]'
            } ${className}`}
        >
            {children}
        </div>
    );
}
