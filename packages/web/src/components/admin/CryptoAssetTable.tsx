"use client";
import { useEffect, useMemo, useRef } from 'react';
import { Coins } from 'lucide-react';
import type { SupportCryptoAsset } from '@/server/db_types';
import { useAdminContract, AssetType } from '@/hooks/useAdminContract';
import { useAdminCryptoQuery } from '@/hooks/queries/useAdminCryptoQuery';
import { AssetTable } from '@/components/shared/AssetTable';

interface Props {
    refreshSignal: number;
    onStatsChange: (stats: { total: number; active: number }) => void;
}

export default function CryptoAssetTable({ refreshSignal, onStatsChange }: Props) {
    const { data, isLoading, refetch } = useAdminCryptoQuery();
    const rows: SupportCryptoAsset[] = useMemo(() => data ?? [], [data]);
    const { toggleAsset } = useAdminContract();

    // Parent may pass new onStatsChange identity each render — stash it.
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
        <AssetTable<SupportCryptoAsset>
            title="Crypto Assets"
            icon={Coins}
            iconBgClass="bg-[color:rgb(240_185_11_/_15%)]"
            iconColorVar="text-[var(--accent-cta)]"
            rows={rows}
            loading={isLoading}
            rowKey={(r) => r.crypto_id}
            rowId={(r) => r.crypto_id}
            isActive={(r) => r.is_active}
            onToggle={(r, active) => toggleAsset(r.crypto_id, AssetType.CRYPTO, active)}
            onRefresh={() => { refetch(); }}
            emptyText="No crypto assets yet."
            columns={[
                { key: 'id',      header: 'ID',            width: 'w-12',
                  render: (r) => <span className="font-mono text-xs text-[var(--text-muted)]">{r.crypto_id}</span> },
                { key: 'symbol',  header: 'Symbol',
                  render: (r) => <span className="font-semibold text-white">{r.token_symbol}</span> },
                { key: 'address', header: 'Token Address',
                  render: (r) => <span className="font-mono text-xs text-[var(--text-secondary)]">{r.token_address.slice(0, 10)}…{r.token_address.slice(-8)}</span> },
                { key: 'updated', header: 'Updated',
                  render: (r) => <span className="text-xs text-[var(--text-muted)]">{new Date(r.edit_time).toLocaleDateString()}</span> },
            ]}
        />
    );
}
