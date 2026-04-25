"use client";
import React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  suffix?: React.ReactNode;
  prefix?: React.ReactNode;
  error?: string;
  hint?: string;
}

export function Input({ label, suffix, prefix, error, hint, style, ...rest }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {label && (
        <label
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '40px',
          background: 'var(--bg-elevated)',
          border: `1px solid ${error ? 'var(--status-danger)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          transition: 'border-color var(--motion-fast), box-shadow var(--motion-fast)',
          overflow: 'hidden',
        }}
        onFocusCapture={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = error
            ? 'var(--status-danger)'
            : 'var(--border-active)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = error
            ? '0 0 0 2px rgba(246,70,93,0.2)'
            : '0 0 0 2px rgba(240,185,11,0.2)';
        }}
        onBlurCapture={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = error
            ? 'var(--status-danger)'
            : 'var(--border-default)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        }}
      >
        {prefix && (
          <span style={{ padding: '0 var(--space-3)', color: 'var(--text-secondary)', flexShrink: 0 }}>
            {prefix}
          </span>
        )}
        <input
          {...rest}
          style={{
            flex: 1,
            height: '100%',
            padding: prefix ? '0 var(--space-2)' : '0 var(--space-3)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            fontSize: '14px',
            ...style,
          }}
        />
        {suffix && (
          <span
            style={{
              padding: '0 var(--space-3)',
              color: 'var(--text-secondary)',
              flexShrink: 0,
              fontSize: '13px',
            }}
          >
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <span style={{ fontSize: '12px', color: 'var(--status-danger)' }}>{error}</span>
      )}
      {!error && hint && (
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{hint}</span>
      )}
    </div>
  );
}
