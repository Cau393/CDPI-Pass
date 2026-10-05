# ADR-008: Mobile-safe downloads and file viewing

- **Date**: 2026-09-02
- **Status**: accepted

## Context
Attendees open cdpipass.com.br from WhatsApp/Instagram links, i.e. inside in-app browsers (WKWebView / Chrome Custom Tabs) and iOS Safari with pop-ups blocked. The ticket QR was saved by clicking a **detached** `<a download href="data:…">` and certificates were opened with `window.open(url, "_blank")`. Both are silently ignored in those browsers, so the buttons appeared to do nothing. The bug reports arrived over WhatsApp, which is exactly where the failure happens.

## Decision
- Data-URL files (the ticket QR PNG) are saved with `client/src/lib/downloadDataUrl.ts`: convert to a Blob, `URL.createObjectURL`, attach the anchor to the document, click, remove, revoke after 1s (revoking synchronously cancels the save in Safari).
- Anything the attendee must *see* gets an in-page fallback that needs neither a download nor a new tab: the ticket QR opens in a `Dialog` behind **Ver QR Code**.
- Links to S3 presigned files are real `<a href target="_blank" rel="noopener noreferrer">` elements via `<Button asChild>`, never `window.open`. This covers certificates (`CertificatesTab`, `NpsCertificateModal`) and the boleto (`PaymentModal`).

## Alternatives considered
- `navigator.share` with files: good on iOS 15+, unsupported on many Android webviews; can be layered on later.
- A server route streaming the file with `Content-Disposition: attachment`: works everywhere but adds a route and pushes private S3 objects through the app for no gain over a presigned link.

## Consequences
- iOS before 13 still cannot save the PNG but can read the QR from the dialog.
- Presigned certificate URLs expire after 1 h (`s3Service.getPresignedUrl` default), so a profile tab left open overnight yields an S3 403 page. Not addressed here.
- `grep -rn "window.open" client/src` must return only comments. Treat any new hit as a bug.
