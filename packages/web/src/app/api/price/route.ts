import { PriceOracle } from '@/lib/priceModel';
import { NextRequest } from 'next/server';

const oracle = new PriceOracle();

export const GET = async (req: NextRequest) => {
    const { searchParams } = req.nextUrl;
    const money = searchParams.get('money');
    const crypto = searchParams.get('crypto');

    if (!money || !crypto) {
        return Response.json({ error: 'Missing money or crypto parameter' }, { status: 400 });
    }

    try {
        const rate = await oracle.getRate(money, crypto);
        return Response.json({ rate, money, crypto });
    } catch (error) {
        console.error('Price API error:', error);
        return Response.json({ error: 'Failed to fetch rate' }, { status: 500 });
    }
};
