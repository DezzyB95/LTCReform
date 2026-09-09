# The Care Floor Petition — dashboard

`index.html` is a single-file petition dashboard for the Indiana Nursing Home Direct Care
Staffing and Accountability Act and the Care Floor Coalition. It has no backend and no
build step: open it in a browser, host it on GitHub Pages, or publish it as a Claude
artifact. It works on a phone, in light and dark mode, and prints as a paper petition.

## What is on the page

| Section | What it holds |
|---|---|
| Status strip | Verified signature tally, goal, live countdown to Organization Day (Nov 17, 2026) and to sine die (Apr 29, 2027) |
| The case | Five sourced numbers, the hours-per-resident-day chart (Indiana law vs. the Act vs. benchmarks), and the $5.6B / $2.6B money bar |
| The window | Federal repeal timeline and the Indiana 2026–27 legislative calendar |
| The bill | The four parts of the Act with section cites, and the worker-right → resident-safety table |
| The coalition | Care Floor Coalition charter (five rights on the floor), who joins, what it does, what it is not, the 30-day IOSHA fact |
| The petition | Formal petition text (WHEREAS / NOW THEREFORE) addressed to the 125th General Assembly, signature table, online sign form |
| How it works | Art. 1 § 31, how a petition enters a chamber, sheet format conventions (IC 3-8-6-6), what a petition cannot do in Indiana |
| Deliver it | Six delivery steps, find-your-legislator link, print buttons |

## How signing works

There is no server. The online form validates the signer's details, builds a plain-text
signature record, and offers three ways to send it: email it to the organizer (mailto),
copy it, or print a sheet with the signer's line pre-filled. Paper sheets are what get
delivered; online records are compiled onto the printed petition as a schedule.

## Organizer settings

Edit the `CONFIG` block at the top of the `<script>`:

```js
verifiedSignatures: 0,        // update after each verification pass
goal: 1000,
tallyUpdated: "2026-09-09",   // ISO date of the last count
organizerEmail: "",           // personal intake address; "" hides the email button
```

Set `organizerEmail` to a **personal** address before circulating the link. Never use a
work email. Republish after every change.

## Rules that apply here, same as the rest of the repo

- No facility named as a wrongdoer. No resident information. Nothing from inside a building.
- Every number on the page has a source in the footer; re-verify anything older than six months.
- Current staff who sign publicly are warned on the form. Do not ask a current employee to be the face of delivery.
- The signature records signers send you are contact data. Keep them out of this repo
  (`contacts*`, `contact-log*`, `*intake*`, `*private*` are already git-ignored).

Facts verified September 9, 2026. Legal and policy information, not legal advice.
