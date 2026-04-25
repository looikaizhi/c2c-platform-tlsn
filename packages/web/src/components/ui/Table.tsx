"use client";
import React, { useState } from 'react';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  render?: (value: unknown, row: T) => React.ReactNode;
  width?: string;
}

export interface TableProps<T extends object> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
  keyField?: keyof T;
}

type SortDir = 'asc' | 'desc';

export function Table<T extends object>({
  columns,
  data,
  loading = false,
  emptyText = 'No data',
  onRowClick,
  stickyHeader = false,
  keyField,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av === bv) return 0;
      const cmp = av! < bv! ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const headerStyle: React.CSSProperties = {
    position: stickyHeader ? 'sticky' : undefined,
    top: stickyHeader ? 0 : undefined,
    background: 'var(--bg-surface)',
    zIndex: stickyHeader ? 1 : undefined,
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-ui)',
          fontSize: '14px',
        }}
      >
        <thead style={headerStyle}>
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                onClick={() => col.sortable && handleSort(String(col.key))}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  textAlign: col.align ?? 'left',
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                  fontSize: '12px',
                  borderBottom: '1px solid var(--border-default)',
                  cursor: col.sortable ? 'pointer' : 'default',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  width: col.width,
                }}
              >
                {col.header}
                {col.sortable && sortKey === String(col.key) && (
                  <span style={{ marginLeft: '4px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={String(col.key)} style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <div
                      style={{
                        height: '16px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)',
                        animation: 'pulse 1.4s ease-in-out infinite',
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 'var(--space-12)',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                }}
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => {
              const rowKey = keyField ? String(row[keyField]) : i;
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    borderBottom: '1px solid var(--border-default)',
                    cursor: onRowClick ? 'pointer' : undefined,
                    transition: 'background var(--motion-fast)',
                  }}
                  onMouseEnter={(e) => {
                    if (onRowClick) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                  }}
                >
                  {columns.map((col) => {
                    const raw = (row as Record<string, unknown>)[String(col.key)];
                    return (
                      <td
                        key={String(col.key)}
                        style={{
                          padding: 'var(--space-3) var(--space-4)',
                          textAlign: col.align ?? 'left',
                          color: 'var(--text-primary)',
                          verticalAlign: 'middle',
                        }}
                      >
                        {col.render ? col.render(raw, row) : String(raw ?? '')}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
