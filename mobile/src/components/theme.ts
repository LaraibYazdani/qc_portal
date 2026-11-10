/** PackVision colours, the same scale as the web app (frontend/tailwind.config.js). */
export const ink = {
  50: '#F5F6FA', 100: '#E9ECF3', 200: '#D3D8E4', 300: '#AEB6CA', 400: '#7F8AA6',
  500: '#5B6683', 600: '#434D68', 700: '#323A52', 800: '#222940', 900: '#151A2C', 950: '#0C1020',
} as const;

export const brand = {
  50: '#EEF3FF', 100: '#DCE6FF', 200: '#BCCDFF', 300: '#8FAAFF', 400: '#5F7DFA',
  500: '#3F5AF0', 600: '#2F45D6', 700: '#2737AD', 800: '#23308A', 900: '#212C6E',
} as const;

export const colors = {
  canvas: '#F5F6F8',
  card: '#FFFFFF',
  success: '#059669', successBg: '#ECFDF5', successText: '#065F46',
  danger: '#DC2626', dangerBg: '#FEF2F2', dangerText: '#991B1B',
  warning: '#F59E0B', warningBg: '#FFFBEB', warningText: '#92400E',
  info: brand[600], infoBg: brand[50], infoText: brand[900],
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 } as const;

export const shadow = {
  shadowColor: '#101828',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

/** Job numbers read best in a fixed-width face. */
export const mono = { fontFamily: 'monospace', letterSpacing: 0.5 } as const;
