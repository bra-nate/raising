import { useTheme } from '../context/ThemeContext';
import { IconMoon, IconSun } from './ui/icons';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className="flex h-8 w-8 items-center justify-center rounded-pill text-muted transition hover:bg-wash hover:text-ink-2 focus:outline-none focus-visible:shadow-focus"
    >
      {isDark ? <IconSun className={className} /> : <IconMoon className={className} />}
    </button>
  );
}
