import type { ProductStatus } from '@/hooks/useProducts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

interface ProductActionStatusProps {
    status: ProductStatus;
    error: string | null;
    submittingMessage: string;
    successMessage: string;
}

export default function ProductActionStatus({
    status,
    error,
    submittingMessage,
    successMessage,
}: ProductActionStatusProps) {
    if (status === 'idle') return null;

    return (
        <Card padding="none" className="p-3">
            <div className="mb-2">
                <Badge
                    variant={status === 'error' ? 'danger' : status === 'success' ? 'success' : 'warning'}
                    dot
                >
                    {status === 'error' ? 'Error' : status === 'success' ? 'Success' : 'Pending'}
                </Badge>
            </div>
            <p className={`text-sm ${
                status === 'error'
                    ? 'text-red-200'
                    : status === 'success'
                    ? 'text-green-200'
                    : 'text-amber-200'
            }`}>
                {status === 'submitting' && submittingMessage}
                {status === 'success' && successMessage}
                {status === 'error' && error}
            </p>
        </Card>
    );
}
