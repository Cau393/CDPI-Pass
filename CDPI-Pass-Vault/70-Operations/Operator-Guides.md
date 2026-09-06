# Operator Guides Index

PT-BR end-user/admin guides live in `/Users/cauecasonato/Envs/CDPI-Pass/Documentation/` (docx + pdf pairs). They document the admin UI workflows, not the code.

| Guide | Covers (related page) |
|---|---|
| Como ajustar o template de cortesias | Courtesy email template editor (`/admin/templates`) |
| Como atualizar o template dos certificados | Certificate .docx template upload (`/admin/events/certificate-template`) |
| Como Editar uma Cortesia | Editing courtesy links (`/admin/cortesias`) |
| Como enviar cortesias em massa | Courtesy mass send via CSV (`/admin/cortesias/envio-em-massa`) |
| Como Escanear QR | Check-in scanner (`/admin/verificar`) |
| Como gerar um link promocional | Promotional link generation |
| Como gerar uma cortesia | Creating a courtesy link |
| Como imprimir nomes manualmente na impressora | Manual badge printing (`/admin/print-terminal`) |
| Como utilizar a página de participantes | Participants page (`/admin/participants`) |
| Como utilizar a página de vendas do comercial | Commercial sales page (`/admin/comercial/vendas`) |

> When an admin workflow changes, update the corresponding guide (docx + regenerate pdf) and this index.

## Vestigial `backend/` folder
`/Users/cauecasonato/Envs/CDPI-Pass/backend/` (`events/`, `orders/`, `tickets/`, `users/` with only `__pycache__`) is a leftover from an earlier Python (Django-style) backend. **It is not used.** The real backend is `frontend/server/`. Safe to ignore; deletion is a candidate cleanup (confirm nothing references it first).
- [[70-Operations/Verifying-UI-Fixes|Verifying UI fixes (measure in a real browser, not jsdom)]]
- [[70-Operations/Security-Backlog|Security backlog (P1-P3 items, each with the read-only command that proves it)]]
