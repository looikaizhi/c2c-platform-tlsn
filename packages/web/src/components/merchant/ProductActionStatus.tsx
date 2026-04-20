import type { ProductStatus } from '@/hooks/useProducts';
import StatusPill from '@/components/ui/StatusPill';
import SurfaceCard from '@/components/ui/SurfaceCard';

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
        <SurfaceCard className="p-3">
            <div className="mb-2">
                <StatusPill
                    label={status === 'error' ? 'Error' : status === 'success' ? 'Success' : 'Pending'}
                    tone={status === 'error' ? 'danger' : status === 'success' ? 'success' : 'warning'}
                />
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
        </SurfaceCard>
    );
}
