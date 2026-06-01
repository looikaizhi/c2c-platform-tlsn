export const colors = {
  bgBase: '#0A1311',
  bgSurface: '#101A17',
  bgElevated: '#16221E',
  bgHover: '#1C2A25',
  primary: '#50D2C1',
  primaryHover: '#3FBFAE',
  primaryStrong: '#98FCE4',
  primaryText: '#06100D',
  buy: '#1FD8A4',
  buyBg: 'rgba(31,216,164,0.10)',
  sell: '#ED7088',
  sellBg: 'rgba(237,112,136,0.10)',
  textPrimary: '#E6F2EE',
  textSecondary: '#7E938C',
  textTertiary: '#52635C',
  borderDefault: 'rgba(255,255,255,0.06)',
  borderActive: '#50D2C1',
  statusSuccess: '#1FD8A4',
  statusDanger: '#ED7088',
  statusWarning: '#E8B339',
  statusInfo: '#50D2C1',
  statusMuted: '#7E938C',
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
  contentMaxWidth: '1280px',
  sidebarWidth: '240px',
} as const;
