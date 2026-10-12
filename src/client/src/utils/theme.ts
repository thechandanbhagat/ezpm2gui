// @group Constants : Theme storage and supported values
export const THEME_STORAGE_KEY = 'ezpm2gui-theme';
export const ACCENT_STORAGE_KEY = 'theme';
export const ACCENT_CHANGED_EVENT = 'ezpm2gui-accent-changed';
export type AppTheme = 'dark' | 'light';
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange';

export interface AccentPalette {
  main: string;
  hover: string;
  muted: string;
  soft: string;
  strongBg: string;
  border: string;
}

// @group Constants : Accent color palettes
const ACCENT_PALETTES: Record<AccentColor, AccentPalette> = {
  blue: {
    main: '#22d3ee',
    hover: '#67e8f9',
    muted: '#0891b2',
    soft: 'rgba(34, 211, 238, 0.10)',
    strongBg: '#001a1f',
    border: 'rgba(34, 211, 238, 0.35)',
  },
  purple: {
    main: '#a78bfa',
    hover: '#c4b5fd',
    muted: '#7c3aed',
    soft: 'rgba(167, 139, 250, 0.12)',
    strongBg: '#16003a',
    border: 'rgba(167, 139, 250, 0.35)',
  },
  green: {
    main: '#22c55e',
    hover: '#4ade80',
    muted: '#16a34a',
    soft: 'rgba(34, 197, 94, 0.10)',
    strongBg: '#022c00',
    border: 'rgba(34, 197, 94, 0.35)',
  },
  orange: {
    main: '#f59e0b',
    hover: '#fbbf24',
    muted: '#d97706',
    soft: 'rgba(245, 158, 11, 0.12)',
    strongBg: '#1a0e00',
    border: 'rgba(245, 158, 11, 0.35)',
  },
};

// Darker foregrounds and pale surfaces keep accent text readable in light mode.
const LIGHT_ACCENT_PALETTES: Record<AccentColor, AccentPalette> = {
  blue: {
    main: '#155e75', hover: '#164e63', muted: '#155e75',
    soft: 'rgba(21, 94, 117, 0.08)', strongBg: '#ecfeff',
    border: 'rgba(21, 94, 117, 0.35)',
  },
  purple: {
    main: '#6d28d9', hover: '#5b21b6', muted: '#6d28d9',
    soft: 'rgba(109, 40, 217, 0.08)', strongBg: '#f5f3ff',
    border: 'rgba(109, 40, 217, 0.35)',
  },
  green: {
    main: '#166534', hover: '#14532d', muted: '#166534',
    soft: 'rgba(22, 101, 52, 0.08)', strongBg: '#f0fdf4',
    border: 'rgba(22, 101, 52, 0.35)',
  },
  orange: {
    main: '#92400e', hover: '#78350f', muted: '#92400e',
    soft: 'rgba(146, 64, 14, 0.08)', strongBg: '#fffbeb',
    border: 'rgba(146, 64, 14, 0.35)',
  },
};

// @group Utilities : Theme preference normalization
export function normalizeThemePreference(value: string | null | undefined): AppTheme {
  return value === 'light' ? 'light' : 'dark';
}

export function isDarkTheme(theme: AppTheme): boolean {
  return theme === 'dark';
}

export function getThemePreference(isDarkMode: boolean): AppTheme {
  return isDarkMode ? 'dark' : 'light';
}

// @group Utilities : Accent preference normalization
export function normalizeAccentColor(value: string | null | undefined): AccentColor {
  if (value === 'purple' || value === 'green' || value === 'orange') return value;
  return 'blue';
}

export function getAccentPalette(accentColor: AccentColor, theme: AppTheme = 'dark'): AccentPalette {
  return (theme === 'light' ? LIGHT_ACCENT_PALETTES : ACCENT_PALETTES)[accentColor];
}
