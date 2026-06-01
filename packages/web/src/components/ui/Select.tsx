"use client";
import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Select({ label, error, hint, children, style, ...rest }: SelectProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {label && (
        <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {label}
        </label>
      )}
      <select
        {...rest}
        style={{
          height: '40px',
          padding: '0 var(--space-3)',
          background: 'var(--bg-elevated)',
          border: `1px solid ${error ? 'var(--status-danger)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-ui)',
          fontSize: '14px',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23848E9C' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: '32px',
          transition: 'border-color var(--motion-fast)',
          outline: 'none',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-active)';
          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(80,210,193,0.25)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--status-danger)' : 'var(--border-default)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {children}
      </select>
      {error && <span style={{ fontSize: '12px', color: 'var(--status-danger)' }}>{error}</span>}
      {!error && hint && <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{hint}</span>}
    </div>
  );
}
