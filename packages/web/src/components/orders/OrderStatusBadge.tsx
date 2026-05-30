import { Badge } from '@/components/ui/Badge';
import type { BadgeVariant } from '@/components/ui/Badge';

const STATUS_MAP: Record<number, { label: string; variant: BadgeVariant }> = {
  0: { label: 'PENDING',   variant: 'warning' },
  1: { label: 'COMPLETED', variant: 'success' },
  2: { label: 'CANCELLED', variant: 'muted'   },
  3: { label: 'EXPIRED',   variant: 'muted'   },
  4: { label: 'DISPUTED',  variant: 'danger'  },
  5: { label: 'WAITING',   variant: 'info'    },
};

interface OrderStatusBadgeProps {
  status: number;
  dot?: boolean;
  size?: 'sm' | 'md';
}

export function OrderStatusBadge({ status, dot = true, size = 'md' }: OrderStatusBadgeProps) {
  const { label, variant } = STATUS_MAP[status] ?? { label: `STATUS_${status}`, variant: 'muted' as BadgeVariant };
  return <Badge variant={variant} dot={dot} size={size}>{label}</Badge>;
}
