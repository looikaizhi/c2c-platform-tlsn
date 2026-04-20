/**
 * EIP-6963 multi-wallet discovery.
 * Allows users to choose which wallet to connect (MetaMask, OKX, etc.)
 */

export interface EIP6963ProviderInfo {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
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
    if (listening || typeof window === 'undefined') return;
    listening = true;

    window.addEventListener('eip6963:announceProvider', ((event: EIP6963AnnounceProviderEvent) => {
        const { info } = event.detail;
        if (!discovered.some((d) => d.info.uuid === info.uuid)) {
            discovered.push(event.detail);
        }
    }) as EventListener);

    window.dispatchEvent(new Event('eip6963:requestProvider'));
}

export function discoverWallets(): EIP6963ProviderDetail[] {
    startListening();
    return [...discovered];
}

export function getWalletByRdns(rdns: string): EIP6963ProviderDetail | undefined {
    startListening();
    return discovered.find((d) => d.info.rdns === rdns);
}

export function getProvider(selected?: EIP6963ProviderDetail): any {
    if (selected) return selected.provider;

    const wallets = discoverWallets();
    if (wallets.length > 0) {
        const mm = wallets.find((w) => w.info.rdns === 'io.metamask');
        return mm ? mm.provider : wallets[0].provider;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) throw new Error('No Web3 wallet found. Please install MetaMask.');
    return ethereum;
}
