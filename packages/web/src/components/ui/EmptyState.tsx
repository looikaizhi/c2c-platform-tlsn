"use client";
import React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
}

const sizeMap = {
  sm: { icon: 32, gap: "var(--space-2)", padding: "var(--space-6)" },
  md: { icon: 40, gap: "var(--space-3)", padding: "var(--space-8)" },
  lg: { icon: 48, gap: "var(--space-4)", padding: "var(--space-10)" },
} as const;

/**
 * EmptyState — unified empty/blank state.
 * Standard pattern: icon + title + (description) + (action).
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  size = "md",
  className,
  style,
}: EmptyStateProps) {
  const s = sizeMap[size];
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: s.gap,
        padding: s.padding,
        textAlign: "center",
        color: "var(--text-secondary)",
        ...style,
      }}
    >
      <Icon size={s.icon} strokeWidth={1.5} aria-hidden="true" />
      <div
        style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {title}
      </div>
      {description ? (
        <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "360px" }}>
          {description}
        </div>
      ) : null}
      {action ? <div style={{ marginTop: "var(--space-2)" }}>{action}</div> : null}
    </div>
  );
}

export default EmptyState;
