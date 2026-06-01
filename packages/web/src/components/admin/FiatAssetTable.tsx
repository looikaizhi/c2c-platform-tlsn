"use client";
import { useEffect, useMemo, useRef } from 'react';
import { Landmark } from 'lucide-react';
import type { SupportFiatAsset } from '@/server/db_types';
import { useAdminContract, AssetType } from '@/hooks/useAdminContract';
import { useAdminFiatQuery } from '@/hooks/queries/useAdminFiatQuery';
import { AssetTable } from '@/components/shared/AssetTable';

interface Props {
    refreshSignal: number;
    onStatsChange: (stats: { total: number; active: number }) => void;
}

export default function FiatAssetTable({ refreshSignal, onStatsChange }: Props) {
    const { data, isLoading, refetch } = useAdminFiatQuery();
    const rows: SupportFiatAsset[] = useMemo(() => data ?? [], [data]);
    const { toggleAsset } = useAdminContract();

    const onStatsChangeRef = useRef(onStatsChange);
    onStatsChangeRef.current = onStatsChange;
    const total  = rows.length;
    const active = rows.filter((r) => r.is_active).length;
    useEffect(() => {
        onStatsChangeRef.current({ total, active });
    }, [total, active]);

    useEffect(() => {
        if (refreshSignal > 0) refetch();
    }, [refreshSignal, refetch]);

    return (
        <AssetTable<SupportFiatAsset>
            title="Fiat Assets"
            icon={Landmark}
            iconBgClass="bg-[color:rgb(78_164_255_/_15%)]"
            iconColorVar="text-[var(--state-info)]"
            rows={rows}
            loading={isLoading}
            rowKey={(r) => r.fiat_id}
            rowId={(r) => r.fiat_id}
            isActive={(r) => r.is_active}
            onToggle={(r, active) => toggleAsset(r.fiat_id, AssetType.FIAT, active)}
            onRefresh={() => { refetch(); }}
            emptyText="No fiat assets yet."
            columns={[
                { key: 'id',      header: 'ID',        width: 'w-12',
                  render: (r) => <span className="font-mono text-xs text-[var(--text-muted)]">{r.fiat_id}</span> },
                { key: 'name',    header: 'Fiat Name',
                  render: (r) => <span className="font-semibold text-white">{r.fiat_name}</span> },
                { key: 'updated', header: 'Updated',
                  render: (r) => <span className="text-xs text-[var(--text-muted)]">{new Date(r.edit_time).toLocaleDateString()}</span> },
            ]}
        />
    );
}
