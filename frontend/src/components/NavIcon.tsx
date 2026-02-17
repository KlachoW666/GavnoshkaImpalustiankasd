/**
 * Navigation icon component — renders SVG icons for navigation items.
 * Extracted from App.tsx for reusability.
 */

import { NAV_ICONS } from '../router/routes';

interface NavIconProps {
  name: string;
  className?: string;
}

export function NavIcon({ name, className }: NavIconProps) {
  const d = NAV_ICONS[name];
  if (!d) return null;
  return (
    <svg
      className={className || 'w-5 h-5 shrink-0'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export default NavIcon;
