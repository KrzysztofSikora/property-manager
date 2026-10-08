// Class strings shared by pages and components, so a restyle changes one place (S-11 review R1).

export const CARD = 'rounded-card border border-line bg-surface';

// Uppercase caption for form fields, table headers and detail tiles.
export const FIELD_LABEL = 'text-xs font-semibold tracking-[.06em] text-muted uppercase';

export const CONTROL = 'h-[38px] w-full rounded-control border border-line bg-surface px-2.5';

const GHOST_BASE =
  'inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 font-semibold whitespace-nowrap disabled:opacity-50';

// Text colour and hover background differ per variant, so no class overrides another.
export const GHOST_BUTTON = `${GHOST_BASE} text-ink hover:bg-ground`;
export const DANGER_GHOST_BUTTON = `${GHOST_BASE} text-danger hover:bg-danger-soft`;

export const STATE_CHIP =
  'inline-block rounded-chip bg-accent-soft px-[7px] py-px font-mono text-[12.5px] font-medium text-accent';
