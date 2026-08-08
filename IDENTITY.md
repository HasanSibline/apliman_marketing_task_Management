# Aura Operations: brand identity

The identity is defined by the code, not by this document. Every value here maps to a
token, class or component that already exists. Where the two disagree, the code wins
and this file is wrong.

| What | Where it lives |
| --- | --- |
| Mark and wordmark | `frontend/src/components/brand/AuraMark.tsx` |
| Colour tokens | `frontend/src/index.css` (`--color-primary-*`), `tailwind.config.js` |
| Per-company theming | `frontend/src/theme/brandTheme.ts` (`applyBrandColor`) |
| Type and surface classes | `frontend/src/index.css` (`.page-title`, `.surface`, `.eyebrow`, …) |
| Icons | `frontend/public/favicon.*`, `icon-192.png`, `icon-512.png` |

---

## 1. What Aura is

An operations platform for teams who run work in cycles: tasks move through workflow
phases, inside quarters, against objectives, with tickets and an assistant alongside.

**One sentence:** Aura Operations is where work moves, and where you can see it move.

**Audience.** Marketing and operations teams inside a company, plus the platform
operator who provisions those companies. Three roles see three different products:
an employee lives in tasks, an admin shapes workflows and people, a super admin runs
the platform. The identity has to hold across all three.

**What it is not.** Not a chat app with tasks bolted on, not a Kanban board, not an AI
product. AI is a capability inside the product, not the product.

---

## 2. The mark

Three arcs sweeping around a single point.

The point is a unit of work. The arcs are the phases it travels through, growing
outward and fading as they go, which is where the name comes from. The ring is open,
not closed: work is in motion, not finished.

**Why this and not a letter.** An "A" in a rounded square is the default answer and
says nothing about the product. The arcs encode the one idea the whole system is built
on, so the mark stays true even as features change.

### Construction

Authored on a 32-unit grid with 2.5-unit strokes and round caps. Do not redraw it by
eye: import the component.

```tsx
import { AuraLogo, AuraMark } from '@/components/brand/AuraMark';

<AuraLogo size="lg" subtitle="Operations" />   // mark + wordmark
<AuraMark className="h-8 w-8" />               // mark alone
<AuraMark monochrome />                        // single colour, for dark headers
```

**Detail scales with size.** Below 32px the three arcs blur into a smudge, so the
icons drop to one open ring plus the dot and thicken the stroke. A favicon needs a
recognisable silhouette, not fidelity. This is already handled in the generated
`.ico`; if you regenerate icons, preserve that behaviour.

### Rules

- Clear space on all sides: at least the height of the dot.
- Never stretch, rotate, add a gradient, or outline it.
- Never re-colour it by hand. It reads `--color-primary-*`, so it follows the company
  brand automatically.
- On photography or a busy background, use `monochrome` on a solid tile.

---

## 3. Colour

### Brand

Primary is a **token, not a value**. The default is blue, but `applyBrandColor` rewrites
`--color-primary-50` through `--color-primary-950` at runtime from the company's own
colour, so a company that picks terracotta gets a terracotta product, mark included.

Because of that: **never hardcode a brand colour.** Use `primary-*`. A literal
`blue-600` will not follow the company and will look wrong in half of them.

### Status colour is not brand colour

This is the distinction the codebase most often gets wrong, so it is worth stating
plainly:

| Meaning | Use |
| --- | --- |
| Anything you can act on: buttons, links, focus, active nav | `primary-*` |
| Success, completed, active | `green-*` |
| Warning, at risk, due soon | `amber-*` |
| Error, overdue, destructive | `red-*` |
| Informational status: in progress, approved, closed | `blue-*` |

`blue-*` is a **status** colour and must not be swapped to `primary-*` in bulk. Doing so
turns "Completed" badges into the brand colour and breaks the status palette. Around 460
such uses exist deliberately.

### Neutrals

Grey carries the interface; colour is reserved for meaning. On white, `gray-400` fails
contrast at 2.8:1, so secondary text is `text-gray-500 dark:text-gray-400` or the
`.text-muted` class.

### Both themes, always

Every colour decision defines light and dark together. A class with no `dark:`
counterpart is a bug, not a shortcut. The dark surface tile is `#0B1220`.

---

## 4. Typography

Inter, one family, throughout. Emphasis comes from weight and size, never from case or
letter-spacing.

| Role | Class |
| --- | --- |
| Page title | `.page-title` (`text-2xl font-semibold tracking-tight`) |
| Section title | `.section-title` (`text-lg font-semibold`) |
| Body | `text-sm` |
| Secondary | `.text-muted` |
| Small label | `.eyebrow` (`text-xs font-medium`) |
| Form label | `.form-label` |

**Do not** use `font-black`, `uppercase` with wide tracking, italic labels, or anything
below `text-xs`. That combination reads as shouting, and at 11px it stops being legible.
The product previously used it in about 700 places; it was removed deliberately.

Sentence case everywhere. `uppercase` survives only on short status chips.

---

## 5. Surfaces and space

One radius: `rounded-xl`. One container: `.surface`. Elevation is restraint, not depth:
`shadow-sm` for resting, `shadow-md` for raised, `shadow-lg` only for modals.

Spacing follows Tailwind's 4px scale. Prefer more space over more lines and boxes.

---

## 6. Voice

Plain, direct, and on the user's side of the screen.

- **Name things by what people control**, not how the system is built. "AI key", not
  "provider credential record".
- **Active voice, and the same word throughout a flow.** A button that says "Save"
  produces "Saved".
- **Errors say what happened and what to do.** Never apologise, never be vague. "The
  Anthropic API key is invalid or has been revoked. Update it in the admin panel."
- **Empty screens invite action.** "No activity yet. Activity appears here as your team
  creates tasks." Not "No results".
- **No em dashes or en dashes anywhere.** Comma, colon, or full stop. "to" for ranges.
- Sentence case in UI. Numerals for numbers. No exclamation marks.

### Naming

- The product is **Aura Operations**; **Aura** on second reference.
- The assistant is **Aura Assist**. Never "the AI" or "the bot" in UI copy.
- The platform-operator area is the **admin console**, not "super admin panel".
- A customer organisation is a **company**.

---

## 7. Applying it

**Adding a screen.** Compose from `.surface`, `.page-title`, `.eyebrow`, `.form-label`,
`btn-primary`, `input-field`. If you need a class that does not exist, add it to
`index.css` rather than inventing a one-off, so the next screen can reuse it.

**Adding an empty state.** Use `EmptyState`. Distinguish "nothing exists yet" (offer the
action that creates the first one) from "nothing matched a filter" (say so, and offer to
clear it).

**Checklist before merging UI**

- Both themes defined on every colour
- No hardcoded brand colour
- Text at `text-xs` or larger; secondary text passes contrast
- Icon-only buttons carry `aria-label`; buttons with visible text do not
- Focus is visible; `focus:outline-none` always has a replacement ring
- Loading, empty and error states all exist
- No em dashes
