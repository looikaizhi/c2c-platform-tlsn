// packages/demo/src/components/ConsoleOutput.tsx
//
// Subscribes to useConsoleStore directly; takes no props. App.tsx renders
// <ConsoleOutput /> bare. "View Extension Logs" navigation lives here now
// (it has no parent-supplied state).

import { useConsoleStore } from '../utils/store';

interface ConsoleEntryRowProps {
    timestamp: string;
    message:   string;
    type:      'info' | 'success' | 'error' | 'warning';
}

function ConsoleEntryRow({ timestamp, message, type }: ConsoleEntryRowProps) {
    return (
        <div className={`console-entry ${type}`}>
            <span className="console-timestamp">[{timestamp}]</span>
            <span className="console-message">{message}</span>
        </div>
    );
}

function openExtensionLogs() {
    window.open('chrome://extensions/', '_blank');
}

export function ConsoleOutput() {
    const entries = useConsoleStore((s) => s.entries);
    const clear   = useConsoleStore((s) => s.clear);

    return (
        <div className="console-section">
            <div className="console-header">
                <div className="console-title">Console Output</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-console" onClick={openExtensionLogs} style={{ background: '#6c757d' }}>
                        View Extension Logs
                    </button>
                    <button className="btn-console" onClick={clear}>
                        Clear
                    </button>
                </div>
            </div>
            <div className="console-output" id="consoleOutput">
                {entries.map((entry, index) => (
                    <ConsoleEntryRow key={index} {...entry} />
                ))}
            </div>
        </div>
    );
}
