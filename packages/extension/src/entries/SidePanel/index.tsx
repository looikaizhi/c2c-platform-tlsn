import React from 'react';
import { createRoot } from 'react-dom/client';
import SidePanel from './SidePanel';
import './index.scss';

const container = document.getElementById('app-container');
if (container) {
  const root = createRoot(container);
  root.render(<SidePanel />);
}
