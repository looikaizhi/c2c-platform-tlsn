import 'server-only';

export async function POST() {
    return Response.json(
        { error: 'not_implemented', detail: 'binding revoke is a Phase 2 feature' },
        { status: 501 },
    );
}
