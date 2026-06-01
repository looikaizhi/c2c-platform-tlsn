"use client";
import { useCallback, useEffect, useState } from 'react';
import { useRiskManager, type RiskConfig } from '@/hooks/useRiskManager';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

const FIELDS: Array<{ key: keyof RiskConfig; label: string; suffix?: string }> = [
    { key: 'min',         label: 'Min bond',         suffix: 'bps' },
    { key: 'base',        label: 'Base bond',        suffix: 'bps' },
    { key: 'max',         label: 'Max bond',         suffix: 'bps' },
    { key: 'step',        label: 'Step',             suffix: 'bps' },
    { key: 'reset',       label: 'Reset threshold' },
    { key: 'freezeThr',   label: 'Freeze threshold' },
    { key: 'rewardThr',   label: 'Reward threshold' },
    { key: 'decayDays',   label: 'Decay interval',   suffix: 'days' },
];

export default function RiskConfigPanel() {
    const rm = useRiskManager();
    const [cfg, setCfg] = useState<RiskConfig | null>(null);
    const [draft, setDraft] = useState<RiskConfig | null>(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        const v = await rm.readConfig();
        setCfg(v);
        setDraft(v);
    }, [rm]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleSave = async () => {
        if (!draft) return;
        setError(null);
        setSaving(true);
        try {
            await rm.setConfig(draft);
            setEditing(false);
            await refresh();
        } catch (e: any) {
            setError(e?.message ?? 'save failed');
        } finally {
            setSaving(false);
        }
    };

    if (!cfg || !draft) {
        return (
            <Card padding="none" className="p-6">
                <h3 className="mb-3 text-lg font-semibold text-white">Risk config</h3>
                <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
            </Card>
        );
    }

    return (
        <Card padding="none" className="p-6">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Risk config</h3>
                {!editing && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {FIELDS.map((f) => (
                    <div key={f.key} className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3">
                        <div className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">{f.label}</div>
                        {editing ? (
                            <input
                                type="number"
                                value={draft[f.key]}
                                onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
                                className="terminal-input mt-1 h-10 w-full px-2 font-mono text-sm"
                            />
                        ) : (
                            <div className="mt-1 font-mono text-sm">
                                {cfg[f.key]}
                                {f.suffix && <span className="ml-1 text-[var(--text-muted)]">{f.suffix}</span>}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {editing && (
                <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost"   size="sm" onClick={() => { setEditing(false); setDraft(cfg); }}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>Save</Button>
                </div>
            )}
            {(error || rm.error) && <p className="mt-2 text-xs text-red-400">{error || rm.error}</p>}
        </Card>
    );
}
