/**
 * Illustrative icons for empty states.
 *
 * Larger and lighter-weight than the navigation icons in NavIcons: these sit
 * inside a tinted circle at 46px and are purely decorative, so they are drawn
 * to read at a glance rather than to be identified precisely. Every one is
 * marked aria-hidden by the EmptyState wrapper — the heading carries the
 * meaning, and an icon that needed describing would be doing too much work.
 */

const base = {
  viewBox: "0 0 24 24",
  width: 22,
  height: 22,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const IconSearch = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.6-3.6" />
  </svg>
);

export const IconSessionsLarge = () => (
  <svg {...base}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="M15.5 11.5 21.5 8v8l-6-3.5z" />
  </svg>
);

export const IconParticipants = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
    <path d="M16.5 8.2a3 3 0 0 1 0 5.6M18 19c0-2.4-.9-4-2.2-4.8" />
  </svg>
);

export const IconInbox = () => (
  <svg {...base}>
    <path d="M3.5 13h4l1.5 2.5h6L16.5 13h4" />
    <path d="M5.6 5h12.8l2.1 8v4.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V13z" />
  </svg>
);

export const IconChart = () => (
  <svg {...base}>
    <path d="M4 19.5V4" />
    <path d="M4 19.5h16" />
    <path d="M8 16v-4M12.5 16V7.5M17 16v-6" />
  </svg>
);
