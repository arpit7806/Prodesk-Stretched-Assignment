// Game Waitlist Console — frontend logic
// Talks to the Express API defined in server.js (ENG-96576).

const API_BASE = "/api/waitlist";

const els = {
  form: document.getElementById("waitlistForm"),
  submitBtn: document.getElementById("submitBtn"),
  formStatus: document.getElementById("formStatus"),
  listRegion: document.getElementById("listRegion"),
  loadingState: document.getElementById("loadingState"),
  emptyState: document.getElementById("emptyState"),
  ticketGrid: document.getElementById("ticketGrid"),
  statusFilter: document.getElementById("statusFilter"),
  gameFilter: document.getElementById("gameFilter"),
  refreshBtn: document.getElementById("refreshBtn"),
  connectionStatus: document.getElementById("connectionStatus"),
  toast: document.getElementById("toast"),
};

let debounceHandle = null;

// -----------------------------------------------------------------------
// Telemetry simulation (per TRD NFR #2)
// -----------------------------------------------------------------------
function logAnalytics(action) {
  console.log(`[Analytics] User interacted with Game Waitlist CRUD API with Route Parameters — ${action}`);
}

// -----------------------------------------------------------------------
// Toast helper
// -----------------------------------------------------------------------
let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
}

// -----------------------------------------------------------------------
// Connection status indicator
// -----------------------------------------------------------------------
function setConnectionState(isUp) {
  els.connectionStatus.innerHTML = isUp
    ? '<span class="dot dot--ok" aria-hidden="true"></span> API connected'
    : '<span class="dot dot--down" aria-hidden="true"></span> Connection issue — retrying';
}

// -----------------------------------------------------------------------
// Field-level validation UI helpers
// -----------------------------------------------------------------------
function clearFieldErrors() {
  ["playerName", "gameTitle", "partySize", "contactPhone"].forEach((name) => {
    const input = document.getElementById(name);
    const errorEl = document.getElementById(`${name}Error`);
    input.removeAttribute("aria-invalid");
    errorEl.textContent = "";
  });
}

function applyFieldErrors(fieldErrors = {}) {
  Object.entries(fieldErrors).forEach(([name, message]) => {
    const input = document.getElementById(name);
    const errorEl = document.getElementById(`${name}Error`);
    if (!input || !errorEl) return;
    input.setAttribute("aria-invalid", "true");
    errorEl.textContent = message;
  });
  const firstBadField = Object.keys(fieldErrors)[0];
  if (firstBadField) document.getElementById(firstBadField).focus();
}

// Lightweight client-side pre-check so users get instant feedback before
// the request even round-trips (server is still the source of truth).
function clientValidate(payload) {
  const errors = {};
  if (!payload.playerName || payload.playerName.trim().length < 2) {
    errors.playerName = "Player name is required (min 2 characters).";
  }
  if (!payload.gameTitle || payload.gameTitle.trim().length < 2) {
    errors.gameTitle = "Game title is required (min 2 characters).";
  }
  const size = Number(payload.partySize);
  if (!Number.isInteger(size) || size < 1 || size > 8) {
    errors.partySize = "Party size must be a whole number between 1 and 8.";
  }
  if (payload.contactPhone && !/^\d{7,15}$/.test(payload.contactPhone)) {
    errors.contactPhone = "Phone number must be 7-15 digits, numbers only.";
  }
  return errors;
}

// -----------------------------------------------------------------------
// API calls
// -----------------------------------------------------------------------
async function apiRequest(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!body) throw new Error("Malformed response from server.");
  if (!res.ok || !body.success) {
    const err = new Error(body.error || "Request failed.");
    err.fieldErrors = body.fieldErrors;
    err.status = res.status;
    throw err;
  }
  return body;
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
}

function renderTicket(entry) {
  const li = document.createElement("li");
  li.className = "ticket";
  li.innerHTML = `
    <p class="ticket__number">#${entry.id.replace("wl_", "").toUpperCase()}</p>
    <p class="ticket__name">${entry.playerName}</p>
    <p class="ticket__game">${entry.gameTitle}</p>
    <div class="ticket__meta">
      <span>Party of ${entry.partySize}</span>
      <span>${relativeTime(entry.joinedAt)}</span>
      ${entry.contactPhone ? `<span>${entry.contactPhone}</span>` : ""}
    </div>
    <span class="badge">${entry.status}</span>
    <div class="ticket__actions">
      <label class="visually-hidden" for="status-${entry.id}">Update status for ${entry.playerName}</label>
      <select id="status-${entry.id}" data-action="status" data-id="${entry.id}" aria-label="Update status for ${entry.playerName}">
        <option value="waiting" ${entry.status === "waiting" ? "selected" : ""}>Waiting</option>
        <option value="called" ${entry.status === "called" ? "selected" : ""}>Called</option>
        <option value="seated" ${entry.status === "seated" ? "selected" : ""}>Seated</option>
        <option value="cancelled" ${entry.status === "cancelled" ? "selected" : ""}>Cancelled</option>
      </select>
      <button type="button" class="btn btn--icon" data-action="delete" data-id="${entry.id}"
              aria-label="Remove ${entry.playerName} from waitlist">
        Remove
      </button>
    </div>
  `;
  return li;
}

async function loadQueue() {
  els.loadingState.hidden = false;
  els.emptyState.hidden = true;
  els.ticketGrid.hidden = true;
  els.listRegion.setAttribute("aria-busy", "true");

  const params = new URLSearchParams();
  if (els.statusFilter.value) params.set("status", els.statusFilter.value);
  if (els.gameFilter.value.trim()) params.set("game", els.gameFilter.value.trim());

  try {
    const { data } = await apiRequest(`${API_BASE}?${params.toString()}`);
    setConnectionState(true);
    els.ticketGrid.innerHTML = "";

    if (!data || data.length === 0) {
      els.emptyState.hidden = false;
      els.ticketGrid.hidden = true;
    } else {
      data
        .slice()
        .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))
        .forEach((entry) => els.ticketGrid.appendChild(renderTicket(entry)));
      els.ticketGrid.hidden = false;
      els.emptyState.hidden = true;
    }
  } catch (err) {
    setConnectionState(false);
    showToast(err.message || "Couldn't load the queue. Retrying shortly.");
    els.emptyState.hidden = false;
    els.emptyState.querySelector(".empty-state__title").textContent = "Couldn't load the queue";
    els.emptyState.querySelector(".empty-state__body").textContent =
      "Check your connection — this will refresh automatically.";
  } finally {
    els.loadingState.hidden = true;
    els.listRegion.setAttribute("aria-busy", "false");
  }
}

async function handleStatusChange(id, status) {
  try {
    await apiRequest(`${API_BASE}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    logAnalytics("status updated");
    showToast("Status updated.");
    loadQueue();
  } catch (err) {
    showToast(err.message || "Couldn't update status.");
    loadQueue();
  }
}

async function handleDelete(id) {
  try {
    await apiRequest(`${API_BASE}/${id}`, { method: "DELETE" });
    logAnalytics("ticket removed");
    showToast("Removed from waitlist.");
    loadQueue();
  } catch (err) {
    showToast(err.message || "Couldn't remove ticket.");
  }
}

async function handleSubmit(evt) {
  evt.preventDefault();
  clearFieldErrors();
  els.formStatus.textContent = "";

  const payload = {
    playerName: document.getElementById("playerName").value.trim(),
    gameTitle: document.getElementById("gameTitle").value.trim(),
    partySize: document.getElementById("partySize").value,
    contactPhone: document.getElementById("contactPhone").value.trim(),
    notes: document.getElementById("notes").value.trim(),
  };

  const clientErrors = clientValidate(payload);
  if (Object.keys(clientErrors).length > 0) {
    applyFieldErrors(clientErrors);
    els.formStatus.textContent = "Please fix the highlighted fields.";
    return;
  }

  els.submitBtn.disabled = true;
  els.submitBtn.querySelector(".spinner--btn").hidden = false;

  try {
    await apiRequest(API_BASE, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    logAnalytics("ticket created");
    els.form.reset();
    document.getElementById("partySize").value = 1;
    els.formStatus.textContent = "Added to the queue.";
    showToast("Ticket added.");
    loadQueue();
  } catch (err) {
    if (err.fieldErrors) {
      applyFieldErrors(err.fieldErrors);
      els.formStatus.textContent = "Please fix the highlighted fields.";
    } else {
      els.formStatus.textContent = err.message || "Couldn't add ticket. Please try again.";
    }
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.querySelector(".spinner--btn").hidden = true;
  }
}

// -----------------------------------------------------------------------
// Event wiring
// -----------------------------------------------------------------------
els.form.addEventListener("submit", handleSubmit);
els.refreshBtn.addEventListener("click", () => {
  logAnalytics("manual refresh");
  loadQueue();
});
els.statusFilter.addEventListener("change", loadQueue);
els.gameFilter.addEventListener("input", () => {
  clearTimeout(debounceHandle);
  debounceHandle = setTimeout(loadQueue, 300);
});

els.ticketGrid.addEventListener("change", (evt) => {
  const target = evt.target.closest('[data-action="status"]');
  if (target) handleStatusChange(target.dataset.id, target.value);
});

els.ticketGrid.addEventListener("click", (evt) => {
  const target = evt.target.closest('[data-action="delete"]');
  if (target) handleDelete(target.dataset.id);
});

// Initial load
loadQueue();
