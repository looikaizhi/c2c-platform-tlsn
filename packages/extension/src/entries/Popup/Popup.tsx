import React from 'react';
import browser from 'webextension-polyfill';
import { logger, LogLevel } from '@tlsn/common';

logger.init(LogLevel.DEBUG);

const chrome = global.chrome as any;

const Popup: React.FC = () => {
  const openSidePanel = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch (err) {
      logger.error('Failed to open side panel:', err);
    }
    window.close();
  };

  return (
    <div className="w-[480px] bg-white p-4 font-sans text-sm">
      <h1 className="text-lg font-bold text-gray-800 mb-3">TLSN Extension</h1>

      <button
        onClick={openSidePanel}
        className="button button--primary w-full py-2 mb-2"
      >
        Open Benchmark Panel
      </button>

      <button
        onClick={async () => {
          const r = await browser.runtime.sendMessage({ type: 'PING' });
          logger.debug('PING response:', r);
        }}
        className="button w-full py-1"
      >
        Test Background Script
      </button>
    </div>
  );
};

export default Popup;
