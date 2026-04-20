export const POST = async (req: Request) => {
    const { merchant } = await req.json() as { merchant: string };

    if (!merchant) {
        return Response.json({ error: 'Missing merchant address' }, { status: 400 });
    }

    // The actual registration happens on-chain via registerMerchantByAdmin.
    // This endpoint is a no-op confirmation hook; extend here if you need
    // to persist merchant records in the DB in future.
    return Response.json({ ok: true, merchant }, { status: 200 });
};
