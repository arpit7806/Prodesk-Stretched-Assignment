# Game Waitlist CRUD API with Route Parameters
**Ticket:** ENG-96576 · **Epic:** Core Infrastructure Overhaul · **Priority:** P1

Digital replacement for the paper/Excel game waitlist. Floor staff add players
to a queue, update their status as they get called/seated, and remove them
when done — all through a small Express REST API with a lightweight console
UI on top.

## Stack
- **Backend:** Node.js + Express, in-memory data store (swap for a real DB
  later without touching route handlers — see `waitlist` array in `server.js`)
- **Frontend:** Static HTML/CSS/vanilla JS served from `/public`, talks to the
  API over `fetch`

## Running it
```bash
npm install
npm start        # http://localhost:4000
```
Open `http://localhost:4000` in a browser for the floor-staff console, or hit
the API directly (see below).

## API Reference

All responses share one envelope:
```json
{ "success": true, "data": {}, "error": null, "message": null }
```
On failure, `success` is `false`, `data` is `null`, and `error` is a
human-readable string. Validation failures also include a `fieldErrors`
object keyed by field name.

| Method | Route                | Description                                   |
|--------|-----------------------|------------------------------------------------|
| GET    | `/api/waitlist`        | List all entries. Supports `?status=` and `?game=` query filters. |
| GET    | `/api/waitlist/:id`     | Get a single entry by route parameter.        |
| POST   | `/api/waitlist`         | Create a new entry.                           |
| PUT    | `/api/waitlist/:id`     | Update an entry (partial update supported).   |
| DELETE | `/api/waitlist/:id`     | Remove an entry.                              |

### Entry shape
```json
{
  "id": "wl_27a8322d",
  "playerName": "Rahul Verma",
  "gameTitle": "Valorant - Custom Lobby",
  "partySize": 4,
  "contactPhone": "9876543210",
  "status": "waiting",
  "notes": "Prefers 5v5, has own headset",
  "joinedAt": "2026-07-24T03:30:37.952Z"
}
```
`status` is one of `waiting | called | seated | cancelled`.

## Edge cases handled (per TRD)
- **Empty states:** empty list responses return `data: []` with a
  `"No data found"` message; the UI shows a dedicated empty-state panel
  instead of a blank screen.
- **Bad connectivity:** every request has a simulated 150–400ms network
  delay (`simulateLatency` middleware) so loading spinners are exercised
  honestly, not just on paper. The UI shows a spinner during fetch and a
  "Connection issue — retrying" indicator on failure, and the API's central
  error handler prevents the process from crashing on a bad request.
- **Invalid inputs:** server-side validation runs on every POST/PUT and
  returns per-field errors; the UI mirrors this with instant client-side
  checks, marks bad fields with `aria-invalid="true"` (rendered in red),
  and moves focus to the first offending field.

## Non-functional requirements
- **Accessibility:** every input has a `<label>`, required fields use
  `aria-required`, errors are announced via `role="alert"`, the queue list
  is an `aria-live` region, all controls are reachable and operable by
  keyboard alone, and focus states are visible (`:focus-visible`).
- **Telemetry:** a `console.log("[Analytics] User interacted with Game
  Waitlist CRUD API with Route Parameters — <action>")` fires on ticket
  creation, status change, deletion, and manual refresh.
- **Security:** all free-text fields (`playerName`, `gameTitle`,
  `contactPhone`, `notes`) are HTML-entity-escaped server-side before being
  stored, so injected `<script>` tags are stored as inert text, never as
  markup.
- **Design system:** monochromatic corporate palette (grays + near-black,
  red reserved only for validation errors), 8/16/24/32px spacing scale,
  IBM Plex Sans/Mono type pairing. No inline styles — all rules live in
  `style.css`.

## Manual test log (before PR)
```
GET  /api/waitlist                     -> 200, 2 seed entries
GET  /api/waitlist/wl_1001              -> 200, single entry
GET  /api/waitlist/wl_nope              -> 404, "No waitlist entry found..."
POST /api/waitlist  {missing fields}    -> 400, fieldErrors for each
POST /api/waitlist  {<script> payload}  -> 201, stored HTML-escaped
GET  /api/waitlist?status=cancelled     -> 200, data: [], "No data found..."
DELETE /api/waitlist/:id                -> 200, removed entry returned
```

## Known follow-ups (not in scope for this stretch ticket)
- Swap in-memory array for a persistent store (Postgres/SQLite) before
  production rollout.
- Add auth/session handling once this moves off the internal floor-staff
  network.
