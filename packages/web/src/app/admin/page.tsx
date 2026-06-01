"use client";
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldX, Settings, Coins, ShieldCheck } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import NotConnectedPlaceholder from '@/components/shared/NotConnectedPlaceholder';

const AdminConsole = dynamic(() => import('@/components/admin/AdminConsole'), {
    ssr: false,
});

function UnauthorizedPlaceholder() {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: '60vh', gap: '12px', color: 'var(--text-secondary)',
        }}>
            <ShieldX size={32} strokeWidth={1.5} style={{ color: 'var(--status-danger)' }} />
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--status-danger)', margin: 0 }}>Access Denied</p>
            <p style={{ fontSize: '14px', margin: 0 }}>Your connected wallet is not the contract admin.</p>
        </div>
    );
}

export default function AdminPage() {
    const router = useRouter();
    const { isConnected } = useWallet();
    const { isAdmin, isLoading } = useIsAdmin();

    useEffect(() => {
        if (isConnected && !isLoading && !isAdmin) {
            router.replace('/dashboard');
        }
    }, [isConnected, isLoading, isAdmin, router]);

    if (!isConnected) {
        return (
            <NotConnectedPlaceholder
                title="Admin access requires a wallet"
                description="Connect the contract admin wallet to manage platforms, tokens, and fees."
                features={[
                    { icon: Settings, label: 'Platform & fee configuration' },
                    { icon: Coins, label: 'Token whitelist management' },
                    { icon: ShieldCheck, label: 'Verified admin-only access' },
                ]}
            />
        );
    }
    if (isLoading) return null;
    if (!isAdmin) return <UnauthorizedPlaceholder />;

    return (
        <div className="flex w-full justify-center">
            <AdminConsole />
        </div>
    );
}
