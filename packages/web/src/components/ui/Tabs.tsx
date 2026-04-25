"use client";
import React from 'react';

export interface Tab {
  key: string;
  label: string;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export function Tabs({ tabs, activeKey, onChange, size = 'md', style }: TabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        height: size === 'sm' ? '36px' : 'var(--tab-bar-h)',
        borderBottom: '1px solid var(--border-default)',
        gap: 'var(--space-1)',
        ...style,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.key)}
            style={{
              position: 'relative',
              height: '100%',
              padding: '0 var(--space-5)',
              background: 'none',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-ui)',
              fontSize: size === 'sm' ? '13px' : '14px',
              fontWeight: isActive ? 600 : 400,
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              opacity: tab.disabled ? 0.4 : 1,
              transition: 'color var(--motion-fast), border-color var(--motion-fast)',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
