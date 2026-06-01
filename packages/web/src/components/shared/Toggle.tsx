"use client";

/**
 * Switch-style toggle. Replaces inline impls in Crypto/FiatAssetTable.
 */
export function Toggle({
    checked,
    onChange,
    disabled = false,
    ariaLabel,
}: {
    checked:    boolean;
    onChange:   (v: boolean) => void;
    disabled?:  boolean;
    ariaLabel?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-cta)] disabled:cursor-not-allowed disabled:opacity-50 ${
                checked ? 'bg-[var(--accent-cta)]' : 'bg-[var(--bg-surface-4)]'
            }`}
        >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
    );
}
