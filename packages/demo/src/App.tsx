import { useState, useEffect, useCallback } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { DeployPanel }   from './components/DeployPanel';
import { AdminPanel }    from './components/AdminPanel';
import { MerchantPanel } from './components/MerchantPanel';
import { UserPanel }     from './components/UserPanel';
import { TradingHall }   from './components/TradingHall';
import { StatusBar }     from './components/StatusBar';
import { SystemChecks }  from './components/SystemChecks';
import { ConsoleOutput } from './components/ConsoleOutput';
import { CollapsibleSection } from './components/CollapsibleSection';
import { PluginButtons } from './components/PluginButtons';
import { HowItWorks }    from './components/HowItWorks';
import { WhyPlugins }    from './components/WhyPlugins';
import { BuildYourOwn }  from './components/BuildYourOwn';
import { plugins }       from './plugins';
import { checkBrowserCompatibility, checkExtension, checkVerifier } from './utils';
import { CheckStatus, PluginResult as PluginResultType } from './types';
import { queryClient } from './utils/hooks';
import { useConsoleStore } from './utils/store';
import './App.css';

export function App() {
    const append = useConsoleStore((s) => s.append);

    const [browserCheck, setBrowserCheck]   = useState<{ status: CheckStatus; message: string }>({ status: 'checking', message: 'Checking…' });
    const [extensionCheck, setExtensionCheck] = useState<{ status: CheckStatus; message: string }>({ status: 'checking', message: 'Checking…' });
    const [verifierCheck, setVerifierCheck]  = useState<{ status: CheckStatus; message: string; showInstructions: boolean }>({ status: 'checking', message: 'Checking…', showInstructions: false });
    const [showBrowserWarning, setShowBrowserWarning] = useState(false);
    const [allChecksPass, setAllChecksPass]   = useState(false);
    const [runningPlugins, setRunningPlugins] = useState<Set<string>>(new Set());
    const [pluginResults, setPluginResults]   = useState<Record<string, { resultHtml: string; debugJson: string }>>({});
    const [consoleExpanded, setConsoleExpanded] = useState(false);

    const runAllChecks = useCallback(async () => {
        const browserOk = checkBrowserCompatibility();
        if (browserOk) {
            setBrowserCheck({ status: 'success', message: '✅ Chrome-based browser detected' });
            setShowBrowserWarning(false);
        } else {
            setBrowserCheck({ status: 'error', message: '❌ Unsupported browser' });
            setShowBrowserWarning(true);
        }

        const extensionOk = await checkExtension();
        setExtensionCheck({ status: extensionOk ? 'success' : 'error', message: extensionOk ? '✅ Extension installed' : '❌ Extension not found' });

        const verifierOk = await checkVerifier();
        setVerifierCheck({ status: verifierOk ? 'success' : 'error', message: verifierOk ? '✅ Verifier running' : '❌ Verifier not running', showInstructions: !verifierOk });

        setAllChecksPass(extensionOk && verifierOk);
    }, []);

    const handleRecheck = useCallback(async () => {
        setExtensionCheck({ status: 'checking', message: 'Checking…' });
        setVerifierCheck({ status: 'checking', message: 'Checking…', showInstructions: false });
        const [extOk, verOk] = await Promise.all([checkExtension(), checkVerifier()]);
        setExtensionCheck({ status: extOk ? 'success' : 'error', message: extOk ? '✅ Extension installed' : '❌ Extension not found' });
        setVerifierCheck({ status: verOk ? 'success' : 'error', message: verOk ? '✅ Verifier running' : '❌ Verifier not running', showInstructions: !verOk });
        setAllChecksPass(extOk && verOk);
    }, []);

    const handleRunPlugin = useCallback(async (pluginKey: string) => {
        const plugin = plugins[pluginKey];
        if (!plugin) return;

        setRunningPlugins((prev) => new Set(prev).add(pluginKey));
        setConsoleExpanded(true);

        try {
            const startTime = performance.now();
            const pluginCode = await fetch(plugin.file).then((r) => r.text());

            append('🔧 Executing plugin code...', 'info');
            const result = await window.tlsn!.execCode(pluginCode);
            const executionTime = (performance.now() - startTime).toFixed(2);

            const json: PluginResultType = JSON.parse(result);

            const debugData = (json as any).results
                ?? (json as any).displayResults
                ?? json;

            setPluginResults((prev) => ({
                ...prev,
                [pluginKey]: {
                    resultHtml: plugin.parseResult(json),
                    debugJson: JSON.stringify(debugData, null, 2),
                },
            }));

            append(`✅ ${plugin.name} completed successfully in ${executionTime}ms`, 'success');
        } catch (err) {
            console.error(err);
            append(`❌ Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
        } finally {
            setRunningPlugins((prev) => {
                const newSet = new Set(prev);
                newSet.delete(pluginKey);
                return newSet;
            });
        }
    }, [append]);

    useEffect(() => {
        append('TLSNotary C2C Demo initialized', 'success');
        const handleTlsnLoaded = () => append('TLSNotary extension loaded', 'success');
        window.addEventListener('tlsn_loaded', handleTlsnLoaded);

        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type === 'TLSN_OFFSCREEN_LOG') append(event.data.message, event.data.level);
        };
        window.addEventListener('message', handleMessage);

        setTimeout(runAllChecks, 500);

        return () => {
            window.removeEventListener('tlsn_loaded', handleTlsnLoaded);
            window.removeEventListener('message', handleMessage);
        };
    }, [runAllChecks, append]);

    return (
      <QueryClientProvider client={queryClient}>
        <div className="app-container">
            <div className="hero-section">
                <h1 className="hero-title">TLSNotary C2C Demo</h1>
                <p className="hero-subtitle">
                    4-flow C2C exchange demo: Wise-Crypto, Wise-Fiat, Alipay-Crypto, Alipay-Fiat
                </p>
            </div>

            {/* Deploy */}
            <div className="content-card">
                <DeployPanel />
            </div>

            {/* Admin overview */}
            <div className="content-card">
                <AdminPanel />
            </div>

            {/* Merchant state */}
            <div className="content-card">
                <MerchantPanel />
            </div>

            {/* User balances & orders */}
            <div className="content-card">
                <UserPanel />
            </div>

            {/* Trading hall — place orders */}
            <div className="content-card">
                <TradingHall />
            </div>

            {/* How It Works */}
            <HowItWorks />

            {/* Status bar */}
            <StatusBar
                browserOk={browserCheck.status === 'success'}
                extensionOk={extensionCheck.status === 'success'}
                verifierOk={verifierCheck.status === 'success'}
                onRecheck={handleRecheck}
                detailsContent={
                    <div className="checks-section">
                        <div className="checks-title">System Status Details</div>
                        <SystemChecks
                            checks={{ browser: browserCheck, extension: extensionCheck, verifier: verifierCheck }}
                            onRecheck={handleRecheck}
                            showBrowserWarning={showBrowserWarning}
                        />
                    </div>
                }
            />

            {/* Plugin Demo */}
            <div className="content-card">
                <h2 className="section-title">Try It: Demo Plugins</h2>
                <p className="section-subtitle">
                    Run a plugin to see TLSNotary in action. Click "View Source" to see how each plugin works.
                </p>

                {!allChecksPass && (
                    <div className="alert-box">
                        <span className="alert-icon">ℹ️</span>
                        <span>Complete system setup above to run plugins</span>
                    </div>
                )}

                <PluginButtons
                    plugins={plugins}
                    runningPlugins={runningPlugins}
                    pluginResults={pluginResults}
                    allChecksPass={allChecksPass}
                    onRunPlugin={handleRunPlugin}
                />
            </div>

            <WhyPlugins />

            <BuildYourOwn />

            {/* Console */}
            <CollapsibleSection title="Console Output" expanded={consoleExpanded}>
                <ConsoleOutput />
            </CollapsibleSection>

            <footer className="app-footer">
                <a
                    href="https://github.com/tlsnotary/tlsn-extension/tree/main/packages/demo"
                    target="_blank" rel="noopener noreferrer"
                    className="footer-link"
                >
                    View source on GitHub
                </a>
                <span className="footer-version">{__GIT_COMMIT_HASH__}</span>
            </footer>
        </div>
      </QueryClientProvider>
    );
}

declare const __GIT_COMMIT_HASH__: string;
