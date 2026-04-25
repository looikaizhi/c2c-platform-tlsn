"use client";
import React from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'buy' | 'sell' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    color: 'var(--color-primary-text)',
    border: 'none',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
  },
  danger: {
    background: 'var(--color-sell)',
    color: '#fff',
    border: 'none',
  },
  buy: {
    background: 'var(--color-buy)',
    color: '#0B0E11',
    border: 'none',
  },
  sell: {
    background: 'var(--color-sell)',
    color: '#fff',
    border: 'none',
  },
  link: {
    background: 'transparent',
    color: 'var(--color-primary)',
    border: 'none',
    padding: '0',
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { height: '32px', padding: '0 12px', fontSize: '13px', borderRadius: 'var(--radius-sm)' },
  md: { height: '40px', padding: '0 16px', fontSize: '14px', borderRadius: 'var(--radius-md)' },
  lg: { height: '48px', padding: '0 24px', fontSize: '15px', borderRadius: 'var(--radius-md)', fontWeight: 600 },
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontFamily: 'var(--font-ui)',
    fontWeight: 500,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.55 : 1,
    transition: 'opacity var(--motion-fast), filter var(--motion-fast)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    width: fullWidth ? '100%' : undefined,
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...style,
  };

  return (
    <button disabled={isDisabled} style={baseStyle} {...rest}>
      {loading && (
        <span
          style={{
            width: '14px',
            height: '14px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      )}
      {children}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}
