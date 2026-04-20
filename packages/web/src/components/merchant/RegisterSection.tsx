import TlsnVerifyButton from '@/components/TlsnVerifyButton';
import SurfaceCard from '@/components/ui/SurfaceCard';
import StatusPill from '@/components/ui/StatusPill';

export default function RegisterSection() {
    return (
        <SurfaceCard className="p-6">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">注册成为商家</h3>
                <StatusPill label="KYB Required" tone="warning" />
            </div>
            <p className="mb-4 text-sm text-[var(--text-subtle)]">
                完成 KYB 验证以注册 C2C Merchant。需要使用 TLSN 扩展验证身份信息。
            </p>
            <TlsnVerifyButton contractAction={{ type: 'registerMerchant' }} onSuccess={() => window.location.reload()} />
        </SurfaceCard>
    );
}
