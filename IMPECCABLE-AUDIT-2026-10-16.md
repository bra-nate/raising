# raising — Impeccable end-to-end product audit

Date: 16 October 2026  
Scope: login, shared shell, pastor, leader, follow-up, and superadmin routes; accessibility, responsive behavior, theming, performance, visual design, and interface resilience.

## Audit method and limits

- Reviewed all client routes and shared components in `client/src`.
- Built the full server and client successfully with `pnpm build`.
- Inspected the live login experience at desktop and 390×844 mobile viewports in light/dark-aware code, including keyboard behavior and measured target sizes.
- Calculated contrast against the actual semantic token values.
- Attempted the server test suite. All 135 tests were blocked before meaningful assertions because PostgreSQL was unavailable at `localhost:5432`. This is a test-environment gap, not evidence of 135 product failures.
- Protected authenticated screens could not be exercised against live data without the database, so those flows were audited from their rendered component logic and API/error paths.

## Anti-pattern verdict

**Fail — the interface has several recognizable 2024–2025 AI-product tells.** The clearest are Inter everywhere, blue-on-dark as the default dark-mode personality, repeated rounded cards, repeated metric-card grids, and a gradient primary button. The product is not chaotic or poorly assembled; its restraint, pastoral copy, and semantic color tokens give it more coherence than a generic generated dashboard. But the visual system currently feels borrowed rather than particular to pastoral care.

The most obvious tells are:

- 29 explicit `<Card>` uses plus additional hand-built card containers.
- Hero-metric layouts on the pastor dashboard, follow-up dashboard, and insights page.
- One universal rounded-rectangle vocabulary for filters, list panels, data groups, calls to action, and navigation.
- Inter as the primary typeface and Roboto Mono for data accents.
- A blue gradient primary action in both light and dark themes.
- Small gray captions used extensively to create hierarchy instead of stronger spatial and typographic decisions.

## Executive summary

**Overall quality score: 66/100**

| Dimension | Score | Summary |
|---|---:|---|
| Accessibility | 48 | Strong semantic start, but systemic contrast, modal, keyboard, motion, and announcement failures. |
| Responsive design | 67 | Layouts reflow, but essential data tables remain desktop-first and controls are frequently too small. |
| Performance | 78 | Healthy build size for an early SPA, but all routes and login imagery load eagerly. |
| Theming | 86 | Semantic tokens and class-based dark mode are a genuine strength; status and faint colors need correction. |
| Visual design | 62 | Calm and consistent, but overly card-driven and visually generic. |
| Resilience and feedback | 63 | Loading and empty states exist; errors are often passive, non-announced, and unrecoverable in place. |

**Issue count: 0 critical, 7 high, 9 medium, 3 low (19 total).**

Top priorities:

1. Repair the two systemic contrast failures before shipping.
2. Replace the shared modal implementation with a standards-complete dialog primitive.
3. Make the mobile drawer and repeated navigation keyboard-safe.
4. Stop or make controllable all automatic motion and honor reduced-motion preferences.
5. Adapt table-heavy workflows for narrow screens rather than relying on horizontal scrolling.

## High-severity findings

### H1. Tertiary text fails contrast across the entire product

- **Location:** `client/src/index.css:17`, `client/src/index.css:39`; 140 `text-faint` uses across the client.
- **Category:** Accessibility / Theming
- **Evidence:** Light `#95959b` on `#fcfcfc` is **2.90:1**. Dark `#626a80` on `#05060f` is **3.75:1**. The token is frequently rendered at 10px.
- **Impact:** Metadata, timestamps, help text, field hints, role labels, empty-state copy, and table headings are difficult or impossible to read for low-vision users and in glare.
- **Standard:** WCAG 2.2 SC 1.4.3 Contrast (Minimum), AA.
- **Recommendation:** Raise `--faint` to at least 4.5:1 on every surface it appears on; use 12px as the minimum for meaningful UI text. Reserve lower contrast only for disabled/decorative content.
- **Suggested command:** `/normalize`, then `/audit`.

### H2. Semantic status colors fail contrast in their most common use

- **Location:** `client/tailwind.config.ts:25-28`, `client/src/components/ui/index.tsx:106-116`, plus status values throughout dashboards and insights.
- **Category:** Accessibility / Theming
- **Evidence:** On white, green is **2.21:1**, amber **1.94:1**, coral **3.20:1**, and cyan **3.00:1**. These colors are commonly used for 10px badge text and small metrics.
- **Impact:** The most important care signals—good, needs attention, concern, safety, and informational state—are among the least legible content.
- **Standard:** WCAG 2.2 SC 1.4.3; SC 1.4.11 where color is used for non-text indicators.
- **Recommendation:** Define separate semantic foreground and background tokens per theme; keep the current hues for fills/dots, but use darker text variants on light surfaces and lighter variants in dark mode.
- **Suggested command:** `/colorize` plus `/normalize`.

### H3. All 13 dialogs inherit incomplete keyboard and screen-reader behavior

- **Location:** `client/src/components/ui/index.tsx:143-178`.
- **Category:** Accessibility
- **Evidence:** The shared modal has no `aria-labelledby`, no close control, no initial focus placement, no focus trap, no Escape handler, no focus restoration, and does not make the background inert. Live keyboard testing showed Shift+Tab from the first dialog control moved focus back to the underlying “Use a demo account” trigger, and Escape did nothing.
- **Impact:** Keyboard and screen-reader users can accidentally operate content behind a modal or lose context during sensitive actions such as reporting, redaction, password changes, conversion, and case resolution.
- **Standard:** WCAG 2.2 SC 2.1.1, 2.4.3, 4.1.2; WAI-ARIA Authoring Practices dialog pattern.
- **Recommendation:** Replace the primitive with an accessible dialog implementation that owns focus lifecycle, labels itself from the title, supports Escape, includes a visible close control, and applies inert/aria-hidden to background content.
- **Suggested command:** `/harden`.

### H4. The login carousel cannot be paused and disregards motion preferences

- **Location:** `client/src/pages/Login.tsx:22-65`, `client/src/pages/Login.tsx:101-139`, `client/tailwind.config.ts:69-76`.
- **Category:** Accessibility / Performance
- **Evidence:** Five images rotate every seven seconds indefinitely. There is no pause/stop control, no `prefers-reduced-motion` behavior, and the progress indicator animates `width`, a layout property.
- **Impact:** Moving content can distract users with cognitive or vestibular sensitivities, and the interface fails a Level A timing requirement.
- **Standard:** WCAG 2.2 SC 2.2.2 Pause, Stop, Hide; SC 2.3.3 Animation from Interactions (AAA guidance).
- **Recommendation:** Prefer a static image. If the carousel remains, add pause/play, stop rotation after one cycle, suspend when the page is hidden, honor reduced motion, and animate with transform rather than width.
- **Suggested command:** `/animate` plus `/distill`.

### H5. The mobile navigation drawer is visually hidden but not managed as a disclosure

- **Location:** `client/src/components/layout/AppShell.tsx:15-27`, `client/src/components/layout/Sidebar.tsx:28-32`.
- **Category:** Accessibility / Responsive
- **Evidence:** The menu button has no `aria-expanded` or `aria-controls`; the drawer has no close button, Escape behavior, focus transfer, focus containment, or focus restoration. Closing depends on tapping the visual overlay or selecting a route.
- **Impact:** Keyboard and assistive-technology users cannot reliably understand, enter, or dismiss navigation on mobile.
- **Standard:** WCAG 2.2 SC 2.1.1, 2.4.3, 4.1.2.
- **Recommendation:** Implement it as a labelled disclosure/dialog hybrid: explicit close button, expansion state, inert background, Escape, and deterministic focus lifecycle.
- **Suggested command:** `/adapt` plus `/harden`.

### H6. Repeated navigation has no bypass mechanism

- **Location:** `client/src/components/layout/AppShell.tsx:18-64`.
- **Category:** Accessibility
- **Evidence:** Every protected page renders the full sidebar before `<main>`, but there is no skip link. The sidebar can contain several navigation groups and footer controls.
- **Impact:** Keyboard users must traverse the same navigation on every route before reaching page content.
- **Standard:** WCAG 2.2 SC 2.4.1 Bypass Blocks, Level A.
- **Recommendation:** Add a first-focus “Skip to main content” link and a stable `id` on `<main>`. Keep focus visible after the jump.
- **Suggested command:** `/harden`.

### H7. Errors and validation feedback are not announced

- **Location:** Login, forms, dashboards, lists, and modal flows; no `role="alert"`, `aria-live`, `aria-invalid`, or `aria-describedby` use was found.
- **Category:** Accessibility / Resilience
- **Evidence:** Errors are inserted as ordinary paragraphs. Most load failures replace content with text but offer no retry. Several mutation failures use native `alert()` instead.
- **Impact:** Screen-reader users may not know a submission failed; all users can be stranded after transient network failures.
- **Standard:** WCAG 2.2 SC 3.3.1 Error Identification, 3.3.3 Error Suggestion, 4.1.3 Status Messages.
- **Recommendation:** Centralize an inline alert/status component, bind field errors with `aria-describedby`, mark invalid controls, preserve user input, and include retry for recoverable reads.
- **Suggested command:** `/harden` plus `/clarify`.

## Medium-severity findings

### M1. Ten data tables remain desktop-first on narrow screens

- **Location:** Members, users, leaders, first-timers, logs, insights, and leader profile tables; examples at `client/src/pages/pastor/Members.tsx:102-103` and `client/src/pages/pastor/Leaders.tsx:108-109`.
- **Category:** Responsive
- **Evidence:** Tables use fixed minimum widths from 420px to 860px inside horizontal scrollers.
- **Impact:** Names and row actions become separated off-screen; comparison is difficult and horizontal scrolling is easy to miss.
- **Recommendation:** At small container widths, render prioritized row summaries/cards with disclosure for secondary fields; retain the table at larger widths.
- **Suggested command:** `/adapt`.

### M2. Mobile touch targets are frequently smaller than 44×44px

- **Location:** Shared shell, sidebar, notification bell, theme toggle, inline row actions, carousel controls.
- **Evidence:** Live measurement found a 32×32 theme toggle, 40px primary button height, a 40px password toggle width, and a 12px-high demo action. Source also uses repeated `h-8 w-8` and `h-9 w-9` controls.
- **Impact:** Increased mistaps for users with limited dexterity, especially in mobile pastoral use.
- **Standard:** WCAG 2.2 SC 2.5.8 requires at least 24×24 CSS px at AA; 44×44 is the stronger WCAG 2.5.5 target and platform norm.
- **Recommendation:** Make primary mobile controls at least 44px high and give compact text actions a larger invisible hit area.
- **Suggested command:** `/adapt` plus `/polish`.

### M3. Global motion has no reduced-motion fallback

- **Location:** `client/src/index.css`, `client/tailwind.config.ts:59-76`, page-level `animate-rise`, modal scale/fade, and skeleton pulses.
- **Category:** Accessibility
- **Impact:** Users requesting reduced motion still receive page entrances, modal transforms, pulsing placeholders, and carousel motion.
- **Recommendation:** Add a global `prefers-reduced-motion: reduce` policy, then selectively retain state-essential opacity changes.
- **Suggested command:** `/animate`.

### M4. Every role and route ships in the initial JavaScript bundle

- **Location:** Static imports in `client/src/App.tsx:7-29`.
- **Category:** Performance
- **Evidence:** Production JS is 359.61 kB (103.68 kB gzip) and all 23 page modules are eagerly imported.
- **Impact:** Users download pastor, superadmin, leader, and follow-up code regardless of role; this will worsen as features grow.
- **Recommendation:** Lazy-load route groups and large secondary tools with `React.lazy`/route-level boundaries.
- **Suggested command:** `/optimize`.

### M5. Login media is eager and larger than necessary for mobile

- **Location:** `client/src/pages/Login.tsx:101-110`; five images total roughly 664 kB.
- **Category:** Performance / Responsive
- **Evidence:** All slides are mounted. `fetchPriority="low"` is not lazy loading, and the entire visual panel is hidden below `lg`.
- **Impact:** Mobile users may download imagery they never see; desktop users load all future slides immediately.
- **Recommendation:** Render only current/next slides, add responsive sources, and avoid requesting the desktop carousel below its breakpoint.
- **Suggested command:** `/optimize`.

### M6. The notification popover lacks disclosure semantics and keyboard dismissal

- **Location:** `client/src/components/layout/NotificationBell.tsx:21-75`.
- **Category:** Accessibility
- **Evidence:** No `aria-expanded`, `aria-controls`, menu/list region label, initial focus, or Escape behavior. It closes only on pointer `mousedown` outside.
- **Impact:** Screen-reader and keyboard users cannot reliably perceive or dismiss the open state.
- **Recommendation:** Add disclosure semantics and keyboard lifecycle; use a labelled popover region rather than a visual-only absolute panel.
- **Suggested command:** `/harden`.

### M7. `h-screen` can clip the app shell on mobile browsers

- **Location:** `client/src/components/layout/AppShell.tsx:19` and loading screens.
- **Category:** Responsive
- **Impact:** Dynamic mobile browser chrome and on-screen keyboards can reduce the usable viewport while the shell remains locked to legacy `100vh`, hiding footer/content or creating nested scroll problems.
- **Recommendation:** Use `min-h-dvh`/`h-dvh` with a safe fallback and test with the keyboard open.
- **Suggested command:** `/adapt`.

### M8. High-stakes actions use inconsistent browser-native dialogs

- **Location:** 11 `alert()` calls and 4 `confirm()` calls, including deletion, deactivation, retention redaction, case operations, exports, and reassignment.
- **Category:** Resilience / UX writing
- **Impact:** Native dialogs interrupt flow, cannot match the product’s severity hierarchy, provide limited recovery detail, and behave inconsistently beside custom modals.
- **Recommendation:** Use one accessible confirmation/feedback pattern with explicit consequences, object name, progress state, and success/failure result.
- **Suggested command:** `/clarify` plus `/harden`.

### M9. A temporary password is deliberately rendered as plain text

- **Location:** `client/src/pages/pastor/Users.tsx:188-189`.
- **Category:** Privacy / Resilience
- **Impact:** Sensitive credentials are exposed to shoulder surfing and screen sharing in an administrator workflow.
- **Recommendation:** Use the password component with an explicit reveal button, correct autocomplete metadata, and a copy affordance after creation if operationally necessary.
- **Suggested command:** `/harden`.

## Low-severity findings

### L1. Route titles do not identify the current view

- **Location:** `client/index.html:6`; no route-level document title updates.
- **Category:** Accessibility / Navigation
- **Impact:** Every page is announced and appears in browser history as only “raising,” making tabs and history harder to distinguish.
- **Recommendation:** Set titles such as “Members · raising” and “Privacy · raising.”
- **Suggested command:** `/clarify`.

### L2. Unknown routes silently redirect

- **Location:** `client/src/App.tsx:270-272`.
- **Category:** Resilience
- **Impact:** A mistyped or stale link appears to work but drops the user at a dashboard/login page without explaining what happened.
- **Recommendation:** Add a role-aware not-found view with a clear route back.
- **Suggested command:** `/onboard`.

### L3. Core typography depends on Google Fonts at runtime

- **Location:** `client/index.html:7-11`.
- **Category:** Performance / Privacy
- **Impact:** Font rendering depends on a third party and may be delayed or blocked in restricted ministry networks.
- **Recommendation:** Self-host the two font families or adopt a carefully tuned local stack.
- **Suggested command:** `/optimize`.

## Patterns and systemic issues

- **Small + faint is the default metadata recipe:** 140 caption-size uses and 140 `text-faint` uses create a consistent but inaccessible hierarchy.
- **Shared primitives multiply defects:** one incomplete modal affects 13 workflows; shared faint/status tokens affect nearly every page.
- **Desktop data density is being shrunk, not adapted:** 10 tables depend on horizontal scrolling.
- **Feedback is fragmented:** inline text, native alert/confirm, and modal states do not share announcement or recovery behavior.
- **The system is card-saturated:** cards provide order but flatten emphasis; high-risk care cases, routine metrics, filters, and navigation often have similar visual weight.

## Positive findings

- Semantic color tokens and dark-mode overrides are centralized and consistently consumed.
- The build is clean, compact enough for the current feature set, and free of obvious dependency bloat.
- Native form elements are used extensively; most visible icon-only buttons have accessible names.
- Loading skeletons, empty states, disabled submission states, and role-based navigation are present across major flows.
- Security-sensitive login errors are intentionally generic.
- The interface copy is generally concise, humane, and specific to pastoral care.
- Responsive grids collapse sensibly, and the mobile login form itself fits cleanly at 390px.
- The visual tone is calm and appropriately restrained for sensitive care records.

## Recommended plan

### Immediate

1. Correct faint and semantic foreground contrast tokens.
2. Replace the shared modal and mobile drawer interaction primitives.
3. Add skip navigation and announce all errors/status changes.
4. Remove or make the login carousel controllable; add reduced-motion support.

### Short term — this sprint

1. Adapt the ten tables for narrow containers.
2. Raise mobile touch targets and test all role shells at 320, 390, 768, and 1280px.
3. Replace native alert/confirm flows with the shared accessible feedback system.
4. Add route-aware titles and a not-found experience.

### Medium term — next sprint

1. Route-split by role and lazy-load secondary tools.
2. Optimize login imagery and self-host fonts.
3. Reduce card repetition: flatten filters and routine sections; reserve strong containers for care risk and sensitive actions.
4. Re-run the complete product audit with PostgreSQL available and add automated axe checks to representative routes.

### Long term

Develop a more ownable pastoral-care visual language: warmer neutrals, stronger editorial hierarchy, and a distinctive care-status treatment that does not depend on generic dashboard cards or blue gradients.

## Suggested Impeccable commands

- `/normalize` — contrast-safe semantic tokens and consistent control states.
- `/harden` — dialogs, drawer, popover, errors, retry, and sensitive password handling.
- `/adapt` — mobile tables, touch targets, and dynamic viewport behavior.
- `/animate` — reduced motion and carousel behavior.
- `/optimize` — route splitting, image loading, and font delivery.
- `/distill` — remove the carousel and reduce card saturation.
- `/clarify` — confirmations, errors, and route titles.
- `/polish` — final spacing and target-size pass after structural fixes.
- `/audit` — regression audit after the above changes.
