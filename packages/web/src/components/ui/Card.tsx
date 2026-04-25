"use client";
import React from 'react';

export interface CardProps {
  variant?: 'default' | 'elevated' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  onClick?: () => void;
}

const paddingMap = {
  none: '0',
  sm: 'var(--space-3)',
  md: 'var(--space-4)',
  lg: 'var(--space-6)',
};

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
  },
  elevated: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
  },
  bordered: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
};

export function Card({
  variant = 'default',
  padding = 'md',
  className,
  style,
  children,
  onClick,
}: CardProps) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 'var(--radius-md)',
        padding: paddingMap[padding],
        cursor: onClick ? 'pointer' : undefined,
        ...variantStyles[variant],
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
