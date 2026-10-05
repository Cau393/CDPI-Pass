# Print Coordinator (WebSocket badge printing)

`server/print/printCoordinator.ts` — coordinates Zebra badge printing between the server and browser-based print terminals (`/admin/print-terminal`, WebUSB).

## Flow
```mermaid
sequenceDiagram
  participant Scanner as QR Scanner (admin)
  participant API as Express API
  participant DB as print_jobs table
  participant Coord as printCoordinator (ws)
  participant Term as Print Terminal (WebUSB Zebra)

  Scanner->>API: POST /api/verify-ticket (check-in)
  API->>DB: insert print_job (if event_print_settings.is_enabled)
  API->>Coord: notifyNewPrintJob(eventId)
  Coord->>Term: print_job {displayName, companyLine}
  Term->>Term: print via WebUSB
  Term->>Coord: print_ack SUCCESS/FAILED
  Coord->>DB: update status / attempts
  Coord->>Term: print_queue_notify (history refresh)
```

## Protocol
- Terminal connects with `?token=<JWT>&eventId=<id>` query params; token verified with `JWT_SECRET`.
- Client state per socket: `ready`, `busy`, `currentJobId`.
- Incoming messages: `printer_ready`, `printer_offline`, `print_ack {job_id, status, error_code?, message?}`.
- Jobs are **claimed** (locked by `locked_by_socket_id`) so multiple terminals don't double-print.
- Failure: attempts incremented, max 3; `last_error_code`/`last_error_message` stored.
- Guarantee: `print_job` message is dispatched **before** `print_queue_notify` so the browser sees the job before the history refresh ping.

## Related tables
`print_jobs`, `event_print_settings` — see [[40-Database/Schema-Overview]].
