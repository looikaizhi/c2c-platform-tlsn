"use client";
import type { ReactNode } from 'react';
import { AlertTriangle, X, CheckCircle, Info } from 'lucide-react';

/**
 * Inline status banner — warning / error / success / info variants. Centralises
 * the colour + border + icon combos used across admin/order/binding pages.
 */
export type StatusBannerVariant = 'warning' | 'error' | 'success' | 'info';

const VARIANT_STYLE: Record<StatusBannerVariant, {
    border: string;
    bg:     string;
    color:  string;
    Icon:   typeof AlertTriangle;
}> = {
    warning: {
        border: 'border-[color:rgb(240_185_11_/_30%)]',
        bg:     'bg-[color:rgb(240_185_11_/_8%)]',
        color:  'text-[var(--state-warning)]',
        Icon:   AlertTriangle,
    },
    error:   {
        border: 'border-[color:rgb(246_70_93_/_30%)]',
        bg:     'bg-[color:rgb(246_70_93_/_8%)]',
        color:  'text-[var(--state-danger)]',
        Icon:   X,
    },
    success: {
        border: 'border-[color:rgb(14_203_129_/_30%)]',
        bg:     'bg-[color:rgb(14_203_129_/_8%)]',
        color:  'text-[var(--state-success)]',
        Icon:   CheckCircle,
    },
    info:    {
        border: 'border-[var(--line-soft)]',
        bg:     'bg-[var(--bg-surface-2)]',
        color:  'text-[var(--text-secondary)]',
        Icon:   Info,
    },
};

export function StatusBanner({
    variant,
    children,
    className,
}: {
    variant:    StatusBannerVariant;
    children:   ReactNode;
    className?: string;
}) {
    const s = VARIANT_STYLE[variant];
    return (
        <div className={`flex items-center gap-2 rounded-lg border ${s.border} ${s.bg} px-3 py-2 ${className ?? ''}`}>
            <s.Icon className={`h-3.5 w-3.5 flex-shrink-0 ${s.color}`} />
            <p className={`text-xs ${s.color}`}>{children}</p>
        </div>
    );
}
