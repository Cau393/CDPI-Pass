# Verifying UI fixes (what actually counts as proof)

Written 2026-09-02 after the mobile bug round. jsdom tests pin *intent* (a class is present); they cannot tell you whether a layout is broken, because **jsdom applies no CSS**. A UI fix is not verified until it has been measured in a real browser.

## The two layers, and what each one proves

| Layer | Proves | Cannot prove |
|---|---|---|
| Vitest + jsdom | the component renders the intended markup/classes, and pure functions behave | anything about size, overlap, cropping or wrapping |
| Real browser (Playwright MCP against `pnpm run dev`) | actual computed layout: cropping, overlap, tap targets, sideways scroll | nothing about future regressions — pair it with a test |

## Recipe: measure instead of eyeballing

Take a screenshot *and* return numbers. A screenshot alone hides a 9px crop; numbers make the before/after auditable and belong in the commit message.

**Is an image cropped?** Compare drawn size against the frame:
```js
const img = document.querySelector('[data-testid="img-event-cover"] img');
const r = img.getBoundingClientRect();
const contain = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
({ fit: getComputedStyle(img).objectFit,
   frame: [r.width, r.height],
   drawn: [img.naturalWidth * contain, img.naturalHeight * contain] })
```

**Do labels overlap?** `scrollWidth > clientWidth` on each child means the text does not fit its box:
```js
[...list.children].map(c => ({ label: c.textContent, fits: c.scrollWidth <= c.getBoundingClientRect().width + 1 }))
```

**Does a CSS change behave the same?** Render the old and the new class list side by side in a hidden host on a page served by the dev server (so real Tailwind applies) and compare measurements. This is how `min-h-[1lh]` → `min-h-[1.3em]` was shown to be identical, and how the tab overlap was proven at a 358px card.

## Fixtures worth reusing
- **Cover ratios in the DB span 0.80 to 1.83.** Landscape 1408x768 (the Peptídeos poster, `events/covers/90fab41c-…jpeg`) is the common case and the one the crop bug was reported against; 1024x1280 portrait is the worst case for letterboxing. Check both.
- **Phone widths:** 320, 360, 375, 390, 414, 430. The Peptídeos poster is fully visible at all six.
- **A long description** with paragraphs ending in `<br />` is the realistic description shape; a short one hides the blank-line bug.

## Checklist before calling a UI fix done
1. A failing jsdom test first, then the fix, then green.
2. Real-browser measurement at 320 and 390 px, numbers recorded.
3. `document.documentElement.scrollWidth <= window.innerWidth` (no sideways scroll).
4. Interactive targets at least 44px tall.
5. Production re-checked after deploy, because the branch auto-deploys ([[50-Infrastructure/Deployment]]).

## Trap: prod may already be fixed
The home-page cover in this round was already fixed in production before work started; only the user's photo was stale. **Check production before writing code** — `Playwright → cdpipass.com.br` and read the computed style. It saves a whole phase.
