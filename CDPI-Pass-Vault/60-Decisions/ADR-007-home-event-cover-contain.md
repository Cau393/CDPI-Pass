# ADR-007: Home hero uses a compact landscape ticket card

- **Date**: 2026-09-02
- **Status**: accepted

## Context
Event covers are uploaded without a required aspect ratio (JPEG/PNG/WebP, 5MB cap). Real files include 1:1, 4:5, and 16:9 (e.g. 1920×1080). The home-page main card put the image in a column whose height was driven by the text beside it. `object-fill` distorted the artwork; stacking the full-width image above all details then made the homepage hero excessively tall.

Eventbrite recommends 2:1 landscape covers (2160×1080); Sympla recommends 1600×838 (about 1.91:1). Both prioritize a consistent landscape media frame and concise discovery information, leaving full copy for the event page.

## Decision
Use `EventCoverImage` (`client/src/components/EventCoverImage.tsx`) on the home main card only:

- Render one image only, with no duplicate, blur, or overlay.
- Use an `aspect-video` frame and `object-contain`, preserving the uploaded artwork without cropping or distortion.
- Stack only on phones; from the `md` breakpoint, use a compact 55/45 image-details card.
- Convert the homepage description to plain text, cap it at 90 characters on a word boundary with `…`, and retain a two-line CSS clamp as a visual safeguard (hidden at constrained tablet/desktop widths). Clamp the title and truncate long locations. The full rich description remains on `/event/:id`.
- Hero loads `eager` with `fetchpriority="high"` (LCP).

## Alternatives considered
- `object-cover` in a fixed-ratio box (detail-page pattern): crops edges; posters with logos/dates lose content.
- Side-by-side `object-contain` with a blurred backdrop: preserves content but creates excessive empty/blurred space for wide banners.
- Full-width image stacked above full details: visually clear but too tall for the home discovery surface.

## Consequences
- A 1920×1080 upload fills the frame exactly. Browser verification produced compact cards of 720×223 at 768px, 629×196 at 1024px, and 800×248 at 1280px, with one image and CSS filter `none`.
- Non-16:9 uploads remain fully visible via `object-contain`, with a plain dark letterbox where necessary.
- 2026-09-02 update: `/event/:id` now uses the same `EventCoverImage` + `aspect-video` frame (posters were losing the sponsor row at desktop widths and their sides on phones: a 1408x768 cover lost 86px vertically at 1280px). Sidebar thumbnail and `/eventos` cards still use `object-cover` thumbnails.
- Cover ratios in the DB span 0.80 (portrait 1024x1280), 1.00, 1.78 and 1.83 (1408x768, the most common). Landscape covers now fill the frame with ~7px bars; a portrait cover is fully visible but small, with wide dark side bars. That trade-off is accepted: nothing is cropped.
