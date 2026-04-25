import TlsnVerifyButton from '@/components/TlsnVerifyButton';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export default function RegisterSection() {
    return (
        <Card padding="none" className="p-6">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">注册成为商家</h3>
                <Badge variant="warning">KYB Required</Badge>
            </div>
            <p className="mb-4 text-sm text-[var(--text-subtle)]">
                完成 KYB 验证以注册 C2C Merchant。需要使用 TLSN 扩展验证身份信息。
            </p>
            <TlsnVerifyButton contractAction={{ type: 'registerMerchant' }} onSuccess={() => window.location.reload()} />
        </Card>
    );
}
