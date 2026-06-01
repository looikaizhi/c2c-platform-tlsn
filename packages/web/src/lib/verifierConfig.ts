// Small helper to derive the verifier base URL from env on both client and server.

export function getVerifierUrl(): string {
    const host = process.env.NEXT_PUBLIC_VERIFIER_HOST || 'localhost:7047';
    const proto = process.env.NEXT_PUBLIC_VERIFIER_SSL === 'true' ? 'https' : 'http';
    return `${proto}://${host}`;
}
