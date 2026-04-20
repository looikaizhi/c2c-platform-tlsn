/**
 * EIP-6963 multi-wallet discovery.
 * Allows users to choose which wallet to connect (MetaMask, OKX, etc.)
 * instead of relying on window.ethereum which can be hijacked.
 */

export interface EIP6963ProviderInfo {
    uuid: string;
    name: string;
    icon: string; // data URI
    rdns: string; // reverse domain name, e.g. "io.metamask"
}

export interface EIP6963ProviderDetail {
    info: EIP6963ProviderInfo;
    provider: any; // EIP-1193 provider
}

interface EIP6963AnnounceProviderEvent extends Event {
    detail: EIP6963ProviderDetail;
}

const discovered: EIP6963ProviderDetail[] = [];
let listening = false;

function startListening() {
    if (listening) return;
    listening = true;

    window.addEventListener('eip6963:announceProvider', ((event: EIP6963AnnounceProviderEvent) => {
        const { info } = event.detail;
        // Deduplicate by uuid
        if (!discovered.some((d) => d.info.uuid === info.uuid)) {
            discovered.push(event.detail);
        }
    }) as EventListener);

    // Ask all installed wallets to announce themselves
    window.dispatchEvent(new Event('eip6963:requestProvider'));
}

export function discoverWallets(): EIP6963ProviderDetail[] {
    startListening();
    return [...discovered];
}

/**
 * Get a specific wallet's provider by rdns pattern.
 * e.g. getWalletByRdns('io.metamask') for MetaMask
 */
export function getWalletByRdns(rdns: string): EIP6963ProviderDetail | undefined {
    startListening();
    return discovered.find((d) => d.info.rdns === rdns);
}

/**
 * Fallback: returns window.ethereum if no EIP-6963 wallets found.
 */
export function getProvider(selected?: EIP6963ProviderDetail): any {
    if (selected) return selected.provider;

    const wallets = discoverWallets();
    if (wallets.length > 0) {
        // Prefer MetaMask if available
        const mm = wallets.find((w) => w.info.rdns === 'io.metamask');
        return mm ? mm.provider : wallets[0].provider;
    }

    // Final fallback
    const ethereum = (window as any).ethereum;
    if (!ethereum) throw new Error('No Web3 wallet found. Please install MetaMask.');
    return ethereum;
}
