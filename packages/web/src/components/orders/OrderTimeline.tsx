import React from 'react';

interface TimelineStep {
  label: string;
  sublabel?: string;
  timestamp?: string;
  status: 'done' | 'active' | 'pending';
}

interface OrderTimelineProps {
  steps: TimelineStep[];
}

export function OrderTimeline({ steps }: OrderTimelineProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const dotColor = step.status === 'done'
          ? 'var(--status-success)'
          : step.status === 'active'
          ? 'var(--color-primary)'
          : 'var(--border-default)';

        return (
          <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', minHeight: isLast ? 'auto' : '56px' }}>
            {/* Spine */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '20px' }}>
              <div style={{
                width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0, marginTop: '3px',
                background: dotColor,
                boxShadow: step.status === 'active' ? `0 0 0 3px rgba(240,185,11,0.2)` : 'none',
                border: step.status === 'pending' ? `2px solid var(--border-default)` : 'none',
              }} />
              {!isLast && (
                <div style={{
                  flex: 1, width: '2px', marginTop: '4px',
                  background: step.status === 'done' ? 'var(--status-success)' : 'var(--border-default)',
                  opacity: 0.4,
                }} />
              )}
            </div>

            {/* Content */}
            <div style={{ paddingBottom: isLast ? 0 : 'var(--space-4)', flex: 1 }}>
              <div style={{
                fontSize: '14px', fontWeight: step.status === 'active' ? 600 : 400,
                color: step.status === 'pending' ? 'var(--text-tertiary)' : 'var(--text-primary)',
              }}>
                {step.label}
              </div>
              {step.sublabel && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{step.sublabel}</div>
              )}
              {step.timestamp && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  {step.timestamp}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
