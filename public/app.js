const state = {
  rooms: [],
  bookings: [],
  apiKey: localStorage.getItem("placesAgentDemoKey") || "demo-agent-key"
};

const screens = [...document.querySelectorAll(".screen")];
const toastBox = document.querySelector("#toast");

function toast(message) {
  toastBox.textContent = message;
  toastBox.style.display = "block";
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toastBox.style.display = "none", 4200);
}

function showScreen(id) {
  screens.forEach(screen => screen.classList.toggle("active", screen.id === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (id === "search") loadRooms();
  if (id === "reservations") loadBookings();
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${state.apiKey}`
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

function currentSearch() {
  return {
    date: document.querySelector("#date-filter").value,
    from: document.querySelector("#from-filter").value,
    to: document.querySelector("#to-filter").value
  };
}

async function loadRooms() {
  const { date, from, to } = currentSearch();
  const params = new URLSearchParams({ date, from, to, seats: "1" });
  const data = await api(`/api/rooms?${params}`);
  state.rooms = data.rooms;
  renderRooms();
}

async function loadBookings() {
  const data = await api("/api/bookings");
  state.bookings = data.bookings;
  renderBookings();
}

function renderRooms() {
  const floor = document.querySelector("#floor-filter").value;
  const building = document.querySelector("#building-filter").value.toLowerCase();
  const rooms = state.rooms.filter(room =>
    (!floor || room.floor === floor) &&
    (!building || room.building.toLowerCase().includes(building))
  );

  document.querySelector("#result-count").textContent = `Showing ${rooms.length} available results`;
  document.querySelector("#room-cards").innerHTML = rooms.map((room, index) => `
    <article class="room-card">
      <div class="heart">♡</div>
      <div class="room-body ${room.image ? "" : "no-image"}">
        ${room.image ? `<div class="thumb" style="filter:hue-rotate(${index * 24}deg)"></div>` : ""}
        <div>
          <div class="room-title">${room.name}</div>
          <p>${room.building}</p>
          <div class="seats">👥 Seats ${room.seats}</div>
          ${room.amenities.length ? `<div class="amenity">${room.amenities.join(", ")}</div>` : ""}
        </div>
      </div>
      <button class="add" data-room-id="${room.id}">Add</button>
    </article>
  `).join("");

  document.querySelectorAll(".add").forEach(button => {
    button.addEventListener("click", () => bookRoom(button.dataset.roomId));
  });
}

function renderBookings() {
  const list = document.querySelector("#booking-list");
  list.innerHTML = state.bookings.map(booking => `
    <div class="reservation-item">
      <div>
        <span class="pill">Reserved for ${booking.requestedBy}</span>
        <h3>${booking.title}</h3>
        <p><strong>${booking.roomName}</strong><br>${booking.building}</p>
      </div>
      <div>
        <div class="time">${booking.from} - ${booking.to}</div>
        <p>${booking.timezone}</p>
      </div>
      <div>
        <div class="small-title">Reservation For</div>
        <strong>${booking.requestedBy}</strong>
      </div>
      <div>
        <div class="small-title">${booking.status}</div>
      </div>
      <div class="menu">⋮</div>
    </div>
  `).join("");
}

async function bookRoom(roomId) {
  const search = currentSearch();
  try {
    const data = await api("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        roomId,
        ...search,
        seats: 1,
        title: "Agent room booking",
        requestedBy: "demo.user"
      })
    });
    toast(`Room ${data.booking.roomName} is booked.`);
    await loadRooms();
    await loadBookings();
    showScreen("reservations");
  } catch (error) {
    toast(error.message);
  }
}

async function runAgentCommand() {
  const command = document.querySelector("#agent-command").value.trim();
  const result = document.querySelector("#agent-result");
  if (!command) {
    toast("Type an instruction first.");
    return;
  }
  result.textContent = "Running instruction...";
  try {
    const data = await api("/api/agent-command", {
      method: "POST",
      body: JSON.stringify({ command })
    });
    result.textContent = data.message;
    toast(data.message);
    await loadBookings();
  } catch (error) {
    result.textContent = error.message;
    toast(error.message);
  }
}

function copyEndpoints() {
  const origin = window.location.origin;
  const text = [
    `API base: ${origin}`,
    "Header: Authorization: Bearer demo-agent-key",
    "GET /api/rooms?date=2026-06-22&from=11:30&to=12:30&seats=4",
    "POST /api/bookings",
    "POST /api/agent-command",
    'Example body: {"command":"Book a room for 4 people on 2026-06-22 from 11:30 to 12:30"}'
  ].join("\n");
  navigator.clipboard.writeText(text).then(() => toast("Agent endpoints copied."));
}

document.querySelectorAll("[data-screen]").forEach(button => {
  button.addEventListener("click", () => showScreen(button.dataset.screen));
});

document.querySelector("#save-key").addEventListener("click", () => {
  state.apiKey = document.querySelector("#api-key").value.trim() || "demo-agent-key";
  localStorage.setItem("placesAgentDemoKey", state.apiKey);
  document.querySelector("#key-status").textContent = "Saved in this browser.";
  toast("Demo API key saved.");
});

document.querySelector("#copy-endpoints").addEventListener("click", copyEndpoints);
document.querySelector("#send-agent-command").addEventListener("click", runAgentCommand);
document.querySelector("#refresh-bookings").addEventListener("click", loadBookings);
["#floor-filter", "#building-filter"].forEach(selector => document.querySelector(selector).addEventListener("input", renderRooms));
["#date-filter", "#from-filter", "#to-filter"].forEach(selector => document.querySelector(selector).addEventListener("change", loadRooms));

document.querySelector("#api-key").value = state.apiKey;
document.querySelector("#key-status").textContent = state.apiKey ? "Key ready for demo calls." : "No key saved yet.";
loadBookings().catch(error => toast(error.message));
