import TlsnVerifyButton from '@/components/TlsnVerifyButton';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export default function RegisterSection() {
    return (
        <Card padding="none" className="p-6">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Register as Merchant</h3>
                <Badge variant="warning">KYB Required</Badge>
            </div>
            <p className="mb-4 text-sm text-[var(--text-subtle)]">
                Complete KYB verification to register as a C2C Merchant. The TLSN extension is required to verify identity.
            </p>
            <TlsnVerifyButton contractAction={{ type: 'registerMerchant' }} onSuccess={() => window.location.reload()} />
        </Card>
    );
}
