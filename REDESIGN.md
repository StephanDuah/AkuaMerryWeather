# The redesign, and how to undo it

A visual upgrade to the public website. **Your live site has not changed** —
the redesign is on a branch, and `main` still points at the version that was
running before.

---

## Where everything is

| | |
| --- | --- |
| **Your original site** | tag `baseline-before-redesign`, and branch `design/original-baseline` |
| **The redesign** | branch `design/redesign` |
| **What is live right now** | `main` — still the original |

All three are on GitHub, so the original cannot be lost from this machine.

## How to switch

**To look at the redesign locally**

```
git checkout design/redesign
npm run dev
```

**To go back to the original**

```
git checkout main
```

Nothing to undo — `main` was never touched.

**To publish the redesign, once you are happy with it**

```
git checkout main
git merge design/redesign
git push
```

**To publish it and then change your mind**

```
git reset --hard baseline-before-redesign
git push --force-with-lease
```

That returns the live site to exactly the version tagged before any design
work began.

---

## What changed

Five files. Nothing else was touched.

| File | Change |
| --- | --- |
| `src/app/globals.css` | The type system, spacing, hero, services index, chat widget styling, motion |
| `src/app/layout.tsx` | Added the monospace typeface; a small script that marks the page able to animate before it paints |
| `src/app/(site)/page.tsx` | Hero markup only — the headline now reveals a line at a time, plus a rule and a scroll cue |
| `src/components/Lines.tsx` | **New.** Splits a heading into revealable lines |
| `src/components/ScrollReveal.tsx` | Added a failsafe that reveals anything still hidden after 2.5 seconds |

## What did not change

- The AI chat assistant — **appearance only**. No logic, no prompts, no tools.
- Every form, route, link and navigation item.
- All business information: prices, services, phone numbers, address, hours,
  credentials, guarantees. Nothing was rewritten or invented.
- The admin dashboard, prospecting agent, database, security work.

Verified after the redesign: conversation 20, field errors 36, pricing 20,
agent 34, security 48, dependencies 56 — all passing.

---

## Two things still open

**Video.** The brief asked for cinematic cleaning footage. I did not ship any,
because I could not verify the licence terms of the free stock libraries from
here, and unverified footage on a commercial site is a claim waiting to
happen. Two honest routes:

1. **Your own footage would be better than any stock clip** — a phone video of
   a real turnaround, steady and well lit, is both more convincing and
   unambiguously yours.
2. A free Pexels API key (their licence does permit commercial use) would let
   me source and optimise clips properly.

Either way the page is built to take it: the hero is already a full-bleed
media slot with a poster frame and a mobile still.

**Narrow phones.** Verified by screenshot at 1440, 828 and 500 CSS pixels.
Below 500 could not be machine-verified — the headless browser I use enforces
a minimum window width and silently crops a wider layout instead, which
produced two false findings before I spotted it. Worth thirty seconds on your
own phone.
