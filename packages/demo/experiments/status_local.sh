#!/bin/bash
IFACE="${IFACE:-eth3}"
VETH_MAIN="veth-main"
VETH_VERIFIER="veth-verifier"

echo "── Verifier process (host) ──────────────────────────────────"
pgrep -a tlsn-verifier-server 2>/dev/null || echo "  (not running)"

echo ""
echo "── Verifier process (verifier-ns) ──────────────────────────"
sudo ip netns exec verifier-ns pgrep -a tlsn-verifier-server 2>/dev/null || echo "  (not running or ns missing)"

echo ""
echo "── ws_router.py ─────────────────────────────────────────────"
pgrep -a -f "ws_router.py" 2>/dev/null || echo "  (not running)"

echo ""
echo "── verifier-ns namespace ────────────────────────────────────"
sudo ip netns list 2>/dev/null | grep verifier-ns || echo "  (not found)"

echo ""
echo "── Active tc rules on $IFACE ────────────────────────────────"
tc qdisc show dev "$IFACE" 2>/dev/null || echo "  (interface not found)"

echo ""
echo "── Active tc rules on $VETH_MAIN ───────────────────────────"
tc qdisc show dev "$VETH_MAIN" 2>/dev/null || echo "  (interface not found)"

echo ""
echo "── Active tc rules on $VETH_VERIFIER (verifier-ns) ─────────"
sudo ip netns exec verifier-ns tc qdisc show dev "$VETH_VERIFIER" 2>/dev/null || echo "  (interface or ns not found)"

echo ""
echo "── Port 7047 listeners ──────────────────────────────────────"
ss -tlnp 2>/dev/null | grep 7047 || echo "  (nothing on 7047)"
