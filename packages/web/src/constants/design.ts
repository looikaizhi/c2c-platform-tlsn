export const colors = {
  bgBase: '#0B0E11',
  bgSurface: '#1E2329',
  bgElevated: '#2B3139',
  bgHover: '#363D45',
  primary: '#F0B90B',
  primaryHover: '#D9A808',
  primaryText: '#0B0E11',
  buy: '#0ECB81',
  buyBg: 'rgba(14,203,129,0.1)',
  sell: '#F6465D',
  sellBg: 'rgba(246,70,93,0.1)',
  textPrimary: '#EAECEF',
  textSecondary: '#848E9C',
  textTertiary: '#5E6673',
  borderDefault: '#2B3139',
  borderActive: '#F0B90B',
  statusSuccess: '#0ECB81',
  statusDanger: '#F6465D',
  statusWarning: '#F0B90B',
  statusInfo: '#2196F3',
  statusMuted: '#848E9C',
} as const;

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const;

export const radii = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
} as const;

export const layout = {
  headerHeight: '56px',
  tabBarHeight: '44px',
  contentMaxWidth: '1440px',
  sidebarWidth: '240px',
} as const;
