# UX and branding specification

Implements R04. Target parents and busy nursery staff; simplicity is a product requirement.

## Reference interpretation

The supplied desktop references use a short sidebar, a clear page title, spacious cards, and grouped recent activity. The mobile reference uses large cards, a short bottom navigation, and clear primary actions. Reuse these layout principles with nursery content. Do not reproduce the hotel/parking imagery, tiny secondary text, or icon-only navigation.

Reference filenames: cb981921-4eef-456c-a1a8-32e2a261ad0d.png; 2e1e749d-b733-4008-8060-863db11876d5.png; 1fc0eed2-c207-4088-808b-cc3b04315e3f.png. Palette reference: 440905a2-184c-49fa-91fe-4c9e347b9903.png. This document includes sufficient written direction if those attachments are unavailable in a later Codex session.

## Navigation

| Persona | Main destinations |
|---|---|
| Parent | Home; My children; Payments when permitted/enabled; Notifications; More |
| Teacher | Today; My classrooms; Learning; Notifications; More |
| Nursery administration | Overview; Children; Classrooms; Finance; Staff; More |
| Superadmin | Nursery administration plus a clearly separate Support & setup area |

Use at most five primary destinations on narrow screens. Label every icon. Group trips, safety, reports, and settings under their parent section/More; avoid a strip of many top-level tabs. Hide inaccessible destinations, and enforce the same rules on their routes.

Parent home: child switcher, important notices, today's updates bar, compact upcoming obligations, and relevant activity notices. Avoid a financial-management dashboard filled with charts for parents. Stable child details and finance stay on their own screens.

Teacher Today: selected permitted classroom, date, attendance task, exams/results, homework due, and custom checkpoints. Classroom-wide actions are prominent; individual exceptions use a roster. Do not ask for repeated identical notes.

## Layout and readability

Design targets: 360/390px mobile, 768px tablet, 1280/1440px desktop. Body text starts at 18px on parent-facing pages; staff dense tables may use 16px with adequate row spacing. Use clear 24–32px headings, 1.5 line height, and controls around 44px minimum touch size. Treat these as design defaults, not a mandate to cram every screen into identical dimensions.

Use one main action per form stage, visible back navigation, simple language, persistent field labels, inline validation, and an error summary. Keep onboarding to enabled logical steps and show a review before final submission. Repeated child forms are grouped within the parent onboarding flow.

Tables become readable cards or controlled horizontally scrollable data tables on mobile; page itself must not overflow. Keep monetary values/dates in LTR spans inside RTL layouts.

## Tokens and customization

| Token role | Initial value/use |
|---|---|
| Brand pink | #F13E93, accents and highlighted surfaces |
| Soft pink | #F891BB, selected backgrounds |
| Peach | #F9D0CD, gentle supporting surfaces |
| Pale yellow | #FAFFCB, notice surfaces |
| Text | #111827 for readable default content |
| Main surface | #FFFFFF |
| App background | A near-white neutral, with restrained tinted panels |
| Strong pink button | A derived dark pink such as #BE185D when using white text |
| Success/warning/error | Independent accessible semantic tokens |

Superadmin changes named semantic colors, logo, nursery name, and support branding. Derive hover/focus/pressed/disabled variants and choose readable foregrounds. Validate resulting pairs before saving; a four-color limit is not imposed. Changes are nursery-wide and audit logged. Only safe color values and approved icon identifiers are accepted.

Normal text target is at least 4.5:1 contrast; large text and essential nontext states need applicable accessibility checks. [W3C text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Calculated examples: white on #F13E93 ≈3.59:1; #111827 on that pink ≈4.94:1; white on #BE185D ≈6.04:1. Use the matching foreground/background pair rather than a blanket white-label rule.

Never communicate status by color alone. Include text/icon state, visible keyboard focus, and screen-reader labels.

## Motion and progress

Icons must have short purposeful animation on completion, interaction, or navigation. Typical durations 150–250ms; use opacity/transform and avoid continuous bouncing or distracting loops. Respect reduced-motion preferences.

Daily bar displays labeled steps and states: pending, recorded, N/A. A child's absence or a poor grade can still represent a completed reporting action. Homework pending completion must be visible distinctly from an unpublished assignment. Use calm language such as Today's updates; avoid achievement percentages that could be read as the child's academic grade.

Announce live changes accessibly without stealing focus, jumping the page, or repeatedly reading unchanged information.

## Language and examples

English and Egyptian Arabic dictionaries are maintained together. Use everyday Egyptian wording, e.g. Paid / تم السداد, Remaining / المتبقي, Contact the nursery / كلم إدارة الحضانة, Record attendance / سجل الحضور. Have the tech lead review nuanced copy in final manual QA. Avoid formal legalistic language in routine workflows.

Use a dedicated date control that guarantees dd/MM/yyyy display; do not assume browser-native date inputs guarantee it. Persist ISO date-only values. Use Latin digits and EGP with consistent separators.

## Mandatory UI states

Loading, empty, no permission, blocked parent, paused child, expired license, connection failure, uncertain payment outcome, validation failure, stale edit, successful publication, correction history, and disabled feature. Show relevant contact information without exposing internal reasons.

Financial submit buttons remain disabled during an operation and offer status recovery after uncertainty. Client disabling supplements server idempotency.

Keep authenticated data out of PWA caches. On blocking/logout/scope loss clear in-memory child queries and close live subscriptions before showing the access message.
