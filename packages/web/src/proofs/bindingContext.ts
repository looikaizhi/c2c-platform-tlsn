import type { Address, Hex } from 'viem';
import type { OrderBindingContext } from './transformer';
import type { NetworkConfig } from '@/chain/networkRegistry';

export type OrderDirection = 'crypto' | 'fiat';

/**
 * Inputs for `makeBindingContext`. CRYPTO direction omits buyer-side hashes
 * (payee = merchant); FIAT direction requires them (payee = buyer).
 */
export interface BindingContextInput {
    merchantAddr:     Address;
    buyerAddr:        Address;
    productId:        bigint;
    orderId:          bigint;
    amount:           bigint;
    rate:             bigint;
    rateVersion:      bigint;
    deadline:         bigint;
    merchantNameHash: Hex;
    merchantIdHash:   Hex;
    /** Required iff direction === 'fiat'. */
    buyerNameHash?:   Hex;
    buyerIdHash?:     Hex;
}

/**
 * Single builder replacing the four `makeWise/AlipayCrypto/FiatBindingContext`.
 *
 *   • `direction='crypto'` → assetType = 0, payee = merchant
 *   • `direction='fiat'`   → assetType = 1, payee = buyer
 */
export function makeBindingContext(
    direction: OrderDirection,
    input: BindingContextInput,
    network: NetworkConfig,
): OrderBindingContext {
    const base: Omit<OrderBindingContext, 'assetType' | 'payeeNameHash' | 'payeeIdHash'> = {
        escrowAddress:    network.contracts.c2cEscrow,
        chainId:          network.chainId,
        merchant:         input.merchantAddr,
        buyer:            input.buyerAddr,
        productId:        input.productId,
        orderId:          input.orderId,
        amount:           input.amount,
        rate:             input.rate,
        rateVersion:      input.rateVersion,
        deadline:         input.deadline,
        merchantNameHash: input.merchantNameHash,
        merchantIdHash:   input.merchantIdHash,
    };

    if (direction === 'crypto') {
        return {
            ...base,
            assetType:     0,
            payeeNameHash: input.merchantNameHash,
            payeeIdHash:   input.merchantIdHash,
        };
    }

    if (!input.buyerNameHash || !input.buyerIdHash) {
        throw new Error('FIAT direction requires buyerNameHash + buyerIdHash');
    }
    return {
        ...base,
        assetType:     1,
        payeeNameHash: input.buyerNameHash,
        payeeIdHash:   input.buyerIdHash,
    };
}
