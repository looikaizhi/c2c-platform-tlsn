import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export default function BulkPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
        <div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bulk Desk</p>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>大宗区 Block Trade</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            后续将提供高额度报价、批量清算和撮合风控流程。
          </p>
        </div>
        <Badge variant="warning" dot>Building</Badge>
      </div>

      <Card variant="default" padding="lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '288px' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>大宗区建设中</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            规划中的功能包括 RFQ 报价、大额结算和托管策略。
          </p>
        </div>
      </Card>
    </div>
  );
}
