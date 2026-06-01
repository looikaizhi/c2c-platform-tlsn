import { Layers } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

export default function BulkPage() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Block Trade</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            High-volume RFQ quotes, batch settlement and matching risk controls.
          </p>
        </div>
        <Badge variant="warning" dot>Building</Badge>
      </div>

      <Card variant="default" padding="none" style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon={Layers}
          title="Block Desk — Coming Soon"
          description="Planned features include RFQ quoting, large-amount settlement and escrow strategies."
          size="lg"
        />
      </Card>
    </div>
  );
}
