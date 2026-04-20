import SectionHeader from '@/components/ui/SectionHeader';
import SurfaceCard from '@/components/ui/SurfaceCard';
import StatusPill from '@/components/ui/StatusPill';

export default function BulkPage() {
  return (
    <div className="flex w-full flex-col gap-4">
      <SectionHeader
        eyebrow="Bulk Desk"
        title="大宗区 Block Trade"
        description="后续将提供高额度报价、批量清算和撮合风控流程。"
        action={<StatusPill label="Building" tone="warning" />}
      />

      <SurfaceCard className="flex h-72 items-center justify-center">
        <div className="text-center">
          <p className="text-xl font-semibold text-white">大宗区建设中</p>
          <p className="mt-2 text-sm text-[var(--text-subtle)]">
            规划中的功能包括 RFQ 报价、大额结算和托管策略。
          </p>
        </div>
      </SurfaceCard>
    </div>
  );
}
