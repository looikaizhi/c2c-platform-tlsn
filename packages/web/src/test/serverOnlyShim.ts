// Stand-in for the `server-only` package under vitest.
// The real package throws on import outside React Server Components; in unit
// tests we just want it to be a no-op marker.
export {};
