/**
 * Game Waitlist CRUD API with Route Parameters
 * Ticket: ENG-96576 | Epic: Core Infrastructure Overhaul
 *
 * REST resource: /api/waitlist
 *   GET    /api/waitlist          -> list all entries (supports ?status= & ?game= filters)
 * ​  GET    /api/waitlist/:id      -> get single entry by route param
 *   POST   /api/waitlist          -> create entry
 *   PUT    /api/waitlist/:id      -> update entry by route param
 *   DELETE /api/waitlist/:id      -> remove entry by route param
 *
 * All responses use a standardized envelope:
 *   { success: boolean, data: any, error: string|null, message: string|null }
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// In-memory "database". Swappable for a real DB later without touching routes.
// ---------------------------------------------------------------------------
const VALID_STATUSES = ["waiting", "called", "seated", "cancelled"];

let waitlist = [
  {
    id: "wl_1001",
    playerName: "Rahul Verma",
    gameTitle: "Valorant - Custom Lobby",
    partySize: 4,
    contactPhone: "9876543210",
    status: "waiting",
    notes: "Prefers 5v5, has own headset",
    joinedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "wl_1002",
    playerName: "Simran Kaur",
    gameTitle: "FIFA 26 - 1v1",
    partySize: 1,
    contactPhone: "9123456780",
    status: "called",
    notes: "",
    joinedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard success envelope */
function ok(res, data, message = null, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, error: null, message });
}

/** Standard error envelope */
function fail(res, statusCode, error, fieldErrors = null) {
  return res.status(statusCode).json({ success: false, data: null, error, fieldErrors });
}

/**
 * Strip anything that looks like HTML/script before it ever touches state.
 * Belt-and-suspenders: escape entities rather than just deleting tags, so
 * "5 < 6 games" style text still survives untouched.
 */
function sanitizeText(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
}

/**
 * Simulates a real network/DB round trip so the frontend's loading states
 * are exercised honestly instead of resolving instantly (spotty-3G scenario
 * from the ticket). Keep this small so local dev doesn't feel sluggish.
 */
function simulateLatency(req, res, next) {
  const delay = 150 + Math.floor(Math.random() * 250);
  setTimeout(next, delay);
}
app.use(simulateLatency);

/** Validates the create/update payload. Returns { valid, fieldErrors } */
function validateEntry(body, { partial = false } = {}) {
  const fieldErrors = {};

  if (!partial || body.playerName !== undefined) {
    if (typeof body.playerName !== "string" || body.playerName.trim().length < 2) {
      fieldErrors.playerName = "Player name is required (min 2 characters).";
    }
  }

  if (!partial || body.gameTitle !== undefined) {
    if (typeof body.gameTitle !== "string" || body.gameTitle.trim().length < 2) {
      fieldErrors.gameTitle = "Game title is required (min 2 characters).";
    }
  }

  if (!partial || body.partySize !== undefined) {
    const size = Number(body.partySize);
    if (!Number.isInteger(size) || size < 1 || size > 8) {
      fieldErrors.partySize = "Party size must be a whole number between 1 and 8.";
    }
  }

  if (body.contactPhone !== undefined && body.contactPhone !== "") {
    const phone = String(body.contactPhone).trim();
    if (!/^\d{7,15}$/.test(phone)) {
      fieldErrors.contactPhone = "Phone number must be 7-15 digits, numbers only.";
    }
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      fieldErrors.status = `Status must be one of: ${VALID_STATUSES.join(", ")}.`;
    }
  }

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/waitlist  (list, with optional ?status= and ?game= filters)
app.get("/api/waitlist", (req, res) => {
  const { status, game } = req.query;
  let results = [...waitlist];

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return fail(res, 400, `Invalid status filter. Use one of: ${VALID_STATUSES.join(", ")}.`);
    }
    results = results.filter((entry) => entry.status === status);
  }

  if (game) {
    const needle = String(game).toLowerCase();
    results = results.filter((entry) => entry.gameTitle.toLowerCase().includes(needle));
  }

  const message = results.length === 0 ? "No data found for the given filters." : null;
  return ok(res, results, message);
});

// GET /api/waitlist/:id  (route parameter lookup)
app.get("/api/waitlist/:id", (req, res) => {
  const entry = waitlist.find((e) => e.id === req.params.id);
  if (!entry) {
    return fail(res, 404, `No waitlist entry found with id "${req.params.id}".`);
  }
  return ok(res, entry);
});

// POST /api/waitlist  (create)
app.post("/api/waitlist", (req, res) => {
  const body = req.body || {};
  const { valid, fieldErrors } = validateEntry(body);

  if (!valid) {
    return fail(res, 400, "Validation failed. Please fix the highlighted fields.", fieldErrors);
  }

  const entry = {
    id: `wl_${crypto.randomBytes(4).toString("hex")}`,
    playerName: sanitizeText(body.playerName),
    gameTitle: sanitizeText(body.gameTitle),
    partySize: Number(body.partySize),
    contactPhone: body.contactPhone ? sanitizeText(String(body.contactPhone)) : "",
    status: "waiting",
    notes: body.notes ? sanitizeText(body.notes) : "",
    joinedAt: new Date().toISOString(),
  };

  waitlist.push(entry);
  return ok(res, entry, "Added to waitlist.", 201);
});

// PUT /api/waitlist/:id  (update by route parameter — supports partial updates)
app.put("/api/waitlist/:id", (req, res) => {
  const index = waitlist.findIndex((e) => e.id === req.params.id);
  if (index === -1) {
    return fail(res, 404, `No waitlist entry found with id "${req.params.id}".`);
  }

  const body = req.body || {};
  const { valid, fieldErrors } = validateEntry(body, { partial: true });
  if (!valid) {
    return fail(res, 400, "Validation failed. Please fix the highlighted fields.", fieldErrors);
  }

  const current = waitlist[index];
  const updated = {
    ...current,
    ...(body.playerName !== undefined && { playerName: sanitizeText(body.playerName) }),
    ...(body.gameTitle !== undefined && { gameTitle: sanitizeText(body.gameTitle) }),
    ...(body.partySize !== undefined && { partySize: Number(body.partySize) }),
    ...(body.contactPhone !== undefined && { contactPhone: sanitizeText(String(body.contactPhone)) }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.notes !== undefined && { notes: sanitizeText(body.notes) }),
  };

  waitlist[index] = updated;
  return ok(res, updated, "Waitlist entry updated.");
});

// DELETE /api/waitlist/:id  (remove by route parameter)
app.delete("/api/waitlist/:id", (req, res) => {
  const index = waitlist.findIndex((e) => e.id === req.params.id);
  if (index === -1) {
    return fail(res, 404, `No waitlist entry found with id "${req.params.id}".`);
  }

  const [removed] = waitlist.splice(index, 1);
  return ok(res, removed, "Removed from waitlist.");
});

// Fallback 404 for unknown API routes
app.use("/api", (req, res) => {
  return fail(res, 404, "Route not found.");
});

// Centralized error handler (catches thrown/async errors so the process
// never crashes on a bad request — satisfies the spotty-connection edge case)
app.use((err, req, res, next) => {
  console.error("[Unhandled Error]", err);
  return fail(res, 500, "Something went wrong on our end. Please try again.");
});

app.listen(PORT, () => {
  console.log(`Game Waitlist API running on http://localhost:${PORT}`);
});
