/**
 * Sidebar icons as inline SVG.
 *
 * Inline rather than an icon library: seven small glyphs do not justify a
 * dependency, and inlining lets them inherit `currentColor` so the active and
 * hover states need no separate assets.
 */

const base = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

export const IconDashboard = () => (
  <svg {...base}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconSessions = () => (
  <svg {...base}>
    <rect x="2" y="5" width="14" height="14" rx="2.5" />
    <path d="M16 10.5 22 7v10l-6-3.5z" />
  </svg>
);

export const IconParticipants = () => (
  <svg {...base}>
    <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="3.5" />
    <path d="M22 20v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.5a4 4 0 0 1 0 7" />
  </svg>
);

export const IconRequests = () => (
  <svg {...base}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 14.5l2 2 4-4" />
  </svg>
);

export const IconUsers = () => (
  <svg {...base}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9.5" cy="7" r="3.5" />
    <path d="M19 8v6M22 11h-6" />
  </svg>
);

export const IconDataset = () => (
  <svg {...base}>
    <ellipse cx="12" cy="5.5" rx="8" ry="3" />
    <path d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    <path d="M4 11.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
  </svg>
);

export const IconModels = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="2.6" />
    <circle cx="5" cy="6" r="2" />
    <circle cx="19" cy="6" r="2" />
    <circle cx="5" cy="18" r="2" />
    <circle cx="19" cy="18" r="2" />
    <path d="M6.6 7.4 10 10.4M17.4 7.4 14 10.4M6.6 16.6 10 13.6M17.4 16.6 14 13.6" />
  </svg>
);

export const IconPrivacy = () => (
  <svg {...base}>
    <path d="M12 2.5 4 6v6c0 5 3.4 8.3 8 9.5 4.6-1.2 8-4.5 8-9.5V6z" />
    <path d="M9.5 12l1.8 1.8 3.5-3.6" />
  </svg>
);

export const IconLogout = () => (
  <svg {...base}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const IconLogo = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21c-1.5-2.2-5-4.2-5-8.5A5 5 0 0 1 12 7.5a5 5 0 0 1 5 5c0 4.3-3.5 6.3-5 8.5z" />
    <path d="M12 7.5V3.5" />
    <circle cx="12" cy="12.5" r="1.6" />
  </svg>
);
