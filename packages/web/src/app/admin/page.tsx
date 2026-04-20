"use client";
import dynamic from 'next/dynamic';

// ssr: false — admin console is fully client-side; disabling SSR avoids
// hydration mismatches caused by browser extensions injecting attributes
// (e.g. fdprocessedid from password managers) before React hydrates.
const AdminConsole = dynamic(() => import('@/components/admin/AdminConsole'), {
    ssr: false,
});

export default function AdminPage() {
    return (
        <div className="flex w-full justify-center">
            <AdminConsole />
        </div>
    );
}
