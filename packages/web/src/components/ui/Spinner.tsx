"use client";
import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

const sizeMap = { sm: '16px', md: '24px', lg: '36px' };

export function Spinner({ size = 'md', color = 'var(--color-primary)' }: SpinnerProps) {
  const px = sizeMap[size];
  return (
    <>
      <span
        style={{
          display: 'inline-block',
          width: px,
          height: px,
          border: `2px solid ${color}`,
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
          flexShrink: 0,
        }}
      />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
