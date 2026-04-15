import { useTheme, type ThemePref } from '../hooks/useTheme';

const LABELS: Record<ThemePref, string> = {
  light: '☀ light',
  dark: '☾ dark',
  system: '⚙ system',
};

const TITLES: Record<ThemePref, string> = {
  light: 'Theme: light — click for dark',
  dark: 'Theme: dark — click for system',
  system: 'Theme: follow system — click for light',
};

export function ThemeToggle() {
  const { pref, cycle } = useTheme();
  return (
    <button type="button" className="theme-toggle" onClick={cycle} title={TITLES[pref]}>
      {LABELS[pref]}
    </button>
  );
}
