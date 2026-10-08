# Review: ui-polish

Verdict: APPROVE
Gates: typecheck ok, lint ok, tests 751 passed / 0 failed (`pnpm test`, 44 files, incl.
Testcontainers); also format:check ok, `pnpm e2e` 2 passed. Responsive check against the running
dev stack: list page at 830 px and 400 px has no page or table overflow
(`scrollWidth == clientWidth`), which supports the Phase 4 deviation.

Base: `80bea1e` (parent of `e7f9f6a`). Reviewed `80bea1e...HEAD` plus the uncommitted Phase 4
changes (`CreatePage.tsx`, `ListPage.tsx`, `plan.md`).

## Plan vs diff
| File | Status | Note |
|------|--------|------|
| `apps/web/src/index.css` | done | `@theme` colours, radii, `sm` 35rem / `md` 51.25rem, base layer, focus ring, reduced motion. |
| `apps/web/src/components/icons.tsx` | done | House, Plus, Trash; `aria-hidden`, `focusable=false`. |
| `apps/web/src/app/Layout.tsx` | done | `nav[aria-label=Main]` with `NavLink end`; "New property" outside the nav. |
| `apps/web/src/app/routes.test.tsx` | done | Two cases for `aria-current` on `/` and its absence on `/properties/new`. |
| `apps/web/src/components/DeletePropertyDialog.tsx` | done | Classes only; texts and behaviour unchanged. |
| `apps/web/src/pages/NotFoundPage.tsx` | done | Card plus ghost-button link; texts unchanged. |
| `apps/web/src/hooks/useProperties.ts` | done | Query adds the three weather fields; `toFilter` and variables unchanged. |
| `apps/web/src/graphql/gql.ts`, `graphql.ts` | done | Codegen output; only the `Properties` document and type changed. |
| `apps/web/src/test/fixtures.ts` | done | `listItem` copies the three weather fields. |
| `apps/web/src/pages/ListPage.tsx` | done | Per *Design / List*. The `sm` → `md` column switch and the wrapping Address cell are logged under *Deviations* (Phase 2, Phase 4). |
| `apps/web/src/pages/ListPage.test.tsx` | done | `rowStreets()` reads the link; AC1 row cells, headers and icon `src`/empty alt; new empty-weather row case. |
| `apps/web/src/lib/format.ts` | done | `epaIndexTone` (D-9); `epaIndexLabel` unchanged. |
| `apps/web/src/lib/format.test.ts` | done | Table for 0, 1, 2, 3, 4, 6, 7. |
| `apps/web/src/pages/DetailsPage.tsx` | done | Breadcrumb, hero with tiles, Location panel, three cards, footnote; D-1 renames match. |
| `apps/web/src/pages/DetailsPage.test.tsx` | done | Rewritten per region; I checked every AC1/AC2/AC5/AC6 value against the D-1 list and found none dropped or weakened. |
| `e2e/property-journey.spec.ts` | done | Latitude and longitude in the Location region; nav click scoped to "Main" (D-11). |
| `apps/web/src/pages/CreatePage.tsx` | done | Uncommitted. Card, labels, `aria-invalid` border, alert box; ids, `aria-describedby`, focus and texts unchanged. The centred column is logged under *Deviations*. |
| `context/test-plan.md` | done | The `format.ts` target row is extended to cover `epaIndexTone` (mutation D-9 reconciliation). |
| `context/lessons.md` | done | New lesson from the mutation check. |
| `context/roadmap.md`, `context/changes/ui-polish/{plan,plan-review,mutation}.md`, `sketch.html` | done | Workflow artifacts. |

## Areas
| Area | Result | One-line reason |
|------|--------|-----------------|
| Correctness | ok | List, details and create keep their roles, names, texts and omission rules; all tests and e2e pass. |
| Design | ok | Changes stay in `apps/web`; the one new pure rule sits in `lib/format.ts`; the query adds only existing fields. |
| Safety | ok | No new input paths, secrets or dependencies; icon URLs come from stored API data as before. |
| Tests | ok | Assertions read by role and region and keep every value; `mutation.md` decisions (2 equivalent trims, the same as S-08) are plausible. |
| Simplicity | concern | Shared control, button and chip class strings are copied across four files and have already drifted (R1). |
| Plan fidelity | concern | Phase 4 and the Phase 3 progress hash are still uncommitted (R2). |

## Findings

### R1: Shared UI class strings are copied across pages and already drift
- Severity: minor
- Where: `apps/web/src/pages/ListPage.tsx:21-24,226`, `apps/web/src/pages/CreatePage.tsx:10-12`,
  `apps/web/src/pages/DetailsPage.tsx:26-29,216`, `apps/web/src/pages/NotFoundPage.tsx:9`,
  `apps/web/src/components/DeletePropertyDialog.tsx:83`
- Problem: the field label string (`text-xs font-semibold tracking-[.06em] text-muted uppercase`)
  appears 3 times, and the 38 px control string twice. The state chip is defined as
  `STATE_CHIP` in DetailsPage but written out inline in ListPage. The ghost button is written
  4 times, and the copies already differ: ListPage adds `text-ink`, DetailsPage adds
  `gap-1.5 whitespace-nowrap`, NotFoundPage and the dialog Cancel have neither. Radii also mix
  tokens with ad hoc values (`rounded-[7px]` in Layout and ListPage, `rounded-[5px]` for the
  chip), although the plan says radii come from `@theme` tokens. A later restyle has to find
  every copy.
- Fix: put the shared strings in one module (for example `apps/web/src/lib/ui.ts` exporting
  `FIELD_LABEL`, `CONTROL`, `GHOST_BUTTON`, `STATE_CHIP`), or use Tailwind 4 `@utility`
  classes in `index.css`. Add a radius token for the 7 px / 5 px values or switch to
  `rounded-control`.
- Effort: small
- Decision: fix. `apps/web/src/lib/ui.ts` holds `CARD`, `FIELD_LABEL`, `CONTROL`,
  `GHOST_BUTTON`, `DANGER_GHOST_BUTTON` and `STATE_CHIP`; the five files import them (the table
  header and CreatePage's invalid-border control compose them). The ghost variants set their own
  text colour and hover background, which also removes the old `text-ink`/`text-danger` overlap
  on the details Delete button. New `@theme` radii `--radius-item` (7px) and `--radius-chip`
  (5px); the 6px sunrise bar uses `rounded-full`. No `rounded-[…]` values remain. Rendered values
  checked in the browser are unchanged.

### R2: Phase 4 is not committed and Progress is not ticked
- Severity: minor
- Where: working tree: `apps/web/src/pages/CreatePage.tsx`, `apps/web/src/pages/ListPage.tsx`,
  `context/changes/ui-polish/plan.md:350-351`
- Problem: CLAUDE.md requires one Conventional Commit per implemented phase. The Phase 4 code,
  its two *Deviations* entries and the Phase 3 hash `(48e1bf6)` exist only as uncommitted
  edits, and `- [ ] Phase 4` is still open. As things stand, HEAD has the `md` breakpoint
  rationale missing and the old `sm` list layout that the deviation says scrolled sideways
  between 560 and ~880 px.
- Fix: commit Phase 4, for example `feat(ui-polish): restyle the create page and fix the
  responsive breakpoints` with `Refs #25`. Then tick Phase 4 with its hash.
- Effort: small
- Decision: fix. Phase 4 committed as `022ae18` and ticked in Progress.
