# The petition, as a social post

The petition from the website, rebuilt as a carousel that can be posted directly.
Built to `08-GRAPHICS-BRIEFS.md`: warm off-white ground, charcoal text, slate blue
accent, clay for the alert figures, Archivo and Source Sans 3, a source line on
every factual card, and the wordmark on the last slide only.

| File | Use |
|---|---|
| `images/01-08` | 1080 x 1350, the carousel in order, for Facebook and Instagram |
| `images/09-wide` | 1200 x 675, single card for Bluesky, X, and LinkedIn |
| `captions.txt` | Post copy for each platform, with the Facebook first comment |
| `alt-text.txt` | Alt text for every image. Paste it on upload |
| `petition-full-text.txt` | The petition verbatim, for posting as text |

The six numbered asks on slides 6 and 7 are condensed from the petition's prayer
clauses. `petition-full-text.txt` carries the full wording, extracted from the
live page so the two cannot drift.

To change a card, edit `build.py` and re-render:

    python3 build.py                 # writes slides.html
    node shoot.mjs                   # writes images/

`shoot.mjs` drives headless Chromium and screenshots each `.slide` element at its
exact pixel size. It also reports any card whose text overflows its bounds, which
is the failure worth catching before anything is posted.
