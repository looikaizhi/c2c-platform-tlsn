"use client";
import { useState } from 'react';
import { CreditCard, ShieldCheck } from 'lucide-react';
import type { Address, Hex } from 'viem';
import { useProducts } from '@/hooks/useProducts';
import { useMyBinding } from '@/hooks/useMyBinding';
import { useMyRole } from '@/hooks/useMyRole';
import { PLATFORM_WISE, PLATFORM_ALIPAY } from '@/platforms/registry';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BindingSetupModal } from '@/components/binding/BindingSetupModal';
import { BindingHealthBanner } from '@/components/binding/BindingHealthBanner';

interface Props {
    merchantAddr: Address;
    products: ReturnType<typeof useProducts>;
}

function PlatformRow({
    platformId,
    platformLabel,
}: {
    platformId: Hex;
    platformLabel: string;
}) {
    const { binding, inSync, isLoading } = useMyBinding(platformId);
    const [modalOpen, setModalOpen] = useState(false);

    return (
        <div className="space-y-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{platformLabel}</span>
                    {binding && inSync && (
                        <ShieldCheck size={14} className="text-emerald-400" aria-label="binding in sync" />
                    )}
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                    {isLoading
                        ? 'Loading…'
                        : binding
                            ? <>name <code className="text-[11px]">{binding.plaintextName}</code> · handle <code className="text-[11px]">{binding.plaintextHandle}</code></>
                            : 'Not bound'}
                </span>
            </div>
            <BindingHealthBanner platformId={platformId} platformLabel={platformLabel} />
            <div className="flex justify-end">
                <Button
                    variant={binding ? 'ghost' : 'primary'}
                    size="sm"
                    onClick={() => setModalOpen(true)}
                >
                    {binding ? 'Re-bind' : `Bind ${platformLabel}`}
                </Button>
            </div>
            <BindingSetupModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                platformId={platformId}
                platformLabel={platformLabel}
            />
        </div>
    );
}

export default function PaymentInfoSection({ merchantAddr }: Props) {
    const { role, isMerchant, isLoading } = useMyRole(merchantAddr as Hex);

    return (
        <Card padding="none" className="card-glow space-y-3 p-6">
            <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                    <CreditCard size={14} className="text-[var(--text-muted)]" />
                    <span className="uppercase tracking-[0.08em]">Platform payment info</span>
                </h3>
                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                    Your Wise / Alipay account names are stored on the server with a random salt;
                    only the keccak256(name‖salt) commit is published on-chain. Re-binding supersedes
                    the previous record but keeps it queryable for historical orders.
                </p>
            </div>
            {isLoading ? (
                <div className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-muted)]">
                    Checking role…
                </div>
            ) : !isMerchant ? (
                <div className="rounded-md border border-amber-700/40 bg-amber-900/15 p-3 text-xs text-amber-300">
                    Your wallet does not have the <code>merchant</code> role
                    {role ? <> (current role: <code>{role}</code>)</> : null}. Ask an admin to grant
                    merchant status before setting platform payment info here. Buyers who only need
                    to bind for placing orders should use the prompt that appears when they open an
                    order.
                </div>
            ) : (
                <>
                    <PlatformRow platformId={PLATFORM_WISE}   platformLabel="Wise" />
                    <PlatformRow platformId={PLATFORM_ALIPAY} platformLabel="Alipay" />
                </>
            )}
        </Card>
    );
}
