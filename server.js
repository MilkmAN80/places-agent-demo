const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.PLACES_AGENT_API_KEY || "demo-agent-key";
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(__dirname, "data", "db.json");

const rooms = [
  { id: "2.1", name: "2.1", building: "02, Copenhagen, Harald hus, Copenhagen", floor: "2", seats: 4, amenities: ["HDMI Cable", "In-room Audio", "Widescreen Monitor"], favorite: true },
  { id: "2.10", name: "2.10", building: "02, Copenhagen, Harald hus, Copenhagen", floor: "2", seats: 4, amenities: ["HDMI Cable", "In-room Audio", "Widescreen Monitor"], favorite: true, image: true },
  { id: "2.11", name: "2.11", building: "02, Copenhagen, Harald hus, Copenhagen", floor: "2", seats: 4, amenities: ["Round Table"], image: true },
  { id: "2.3", name: "2.3", building: "02, Copenhagen, Harald hus, Copenhagen", floor: "2", seats: 4, amenities: [], image: true },
  { id: "2.5", name: "2.5", building: "02, Copenhagen, Harald hus, Copenhagen", floor: "2", seats: 4, amenities: ["HDMI Cable", "In-room Audio", "Widescreen Monitor"], image: true },
  { id: "2.6", name: "2.6", building: "02, Copenhagen, Harald hus, Copenhagen", floor: "2", seats: 4, amenities: ["Whiteboard"], image: true },
  { id: "2.9", name: "2.9", building: "02, Copenhagen, Harald hus, Copenhagen", floor: "2", seats: 4, amenities: ["HDMI Cable", "In-room Audio", "Webcam", "Whiteboard", "Widescreen Monitor"], image: true },
  { id: "4.12", name: "4.12", building: "04, Copenhagen, Harald hus, Copenhagen", floor: "4", seats: 24, amenities: ["HDMI Cable", "In-room Audio", "Webcam", "Whiteboard", "Widescreen Monitor"], image: true },
  { id: "4.3", name: "4.3", building: "04, Copenhagen, Harald hus, Copenhagen", floor: "4", seats: 4, amenities: ["HDMI Cable", "Widescreen Monitor"], image: true },
  { id: "4.9", name: "4.9", building: "04, Copenhagen, Harald hus, Copenhagen", floor: "4", seats: 8, amenities: ["Monitor", "Whiteboard"], image: true }
];

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const type = ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function isAuthorized(req) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const key = req.headers["x-api-key"] || bearer;
  return key === API_KEY;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function toMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function overlaps(aFrom, aTo, bFrom, bTo) {
  return toMinutes(aFrom) < toMinutes(bTo) && toMinutes(bFrom) < toMinutes(aTo);
}

function availableRooms({ date, from, to, seats = 1, building = "" }) {
  const db = readDb();
  return rooms.filter(room => {
    const enoughSeats = room.seats >= Number(seats || 1);
    const buildingMatches = !building || room.building.toLowerCase().includes(String(building).toLowerCase());
    const booked = db.bookings.some(booking =>
      booking.roomId === room.id &&
      booking.date === date &&
      booking.status !== "Cancelled" &&
      overlaps(booking.from, booking.to, from, to)
    );
    return enoughSeats && buildingMatches && !booked;
  });
}

function createBooking(input) {
  const date = input.date || new Date().toISOString().slice(0, 10);
  const from = input.from || "11:30";
  const to = input.to || "12:30";
  const seats = Number(input.seats || 1);
  const candidates = availableRooms({ date, from, to, seats, building: input.building });
  const selectedRoom = rooms.find(room => room.id === input.roomId) || candidates[0];

  if (!selectedRoom) {
    const error = new Error("No available room matched the request.");
    error.status = 409;
    throw error;
  }

  const stillAvailable = availableRooms({ date, from, to, seats, building: input.building }).some(room => room.id === selectedRoom.id);
  if (!stillAvailable) {
    const error = new Error(`Room ${selectedRoom.name} is not available for that time.`);
    error.status = 409;
    throw error;
  }

  const booking = {
    id: crypto.randomUUID(),
    roomId: selectedRoom.id,
    roomName: selectedRoom.name,
    building: selectedRoom.building,
    title: input.title || "Agent room booking",
    date,
    from,
    to,
    requestedBy: input.requestedBy || input.user || "copilot.agent",
    status: input.status || "Confirmed",
    timezone: input.timezone || "Europe/Copenhagen",
    createdAt: new Date().toISOString()
  };

  const db = readDb();
  db.bookings.unshift(booking);
  writeDb(db);
  return booking;
}

function parseAgentCommand(command) {
  const text = String(command || "").toLowerCase();
  const dateMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const timeRange = text.match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?\s*(?:-|to|until)\s*([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?/i);
  const seatsMatch = text.match(/(\d+)\s*(people|persons|attendees|seats|seat)/);
  const roomMatch = text.match(/\broom\s*([0-9]+(?:\.[0-9]+)?)\b/i);

  function normalizeTime(hour, minute, meridiem) {
    let h = Number(hour);
    const m = minute || "00";
    if (meridiem === "pm" && h < 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }

  return {
    date: dateMatch ? dateMatch[1] : "2026-06-22",
    from: timeRange ? normalizeTime(timeRange[1], timeRange[2], timeRange[3]) : "11:30",
    to: timeRange ? normalizeTime(timeRange[4], timeRange[5], timeRange[6] || timeRange[3]) : "12:30",
    seats: seatsMatch ? Number(seatsMatch[1]) : 4,
    roomId: roomMatch ? roomMatch[1] : undefined,
    title: text.includes("client") ? "Client prep" : "Agent room booking",
    requestedBy: "copilot.agent"
  };
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, auth: "Use Authorization: Bearer <PLACES_AGENT_API_KEY>" });
    return;
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: "Unauthorized. Send Authorization: Bearer <your demo key> or x-api-key." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/rooms") {
    const date = url.searchParams.get("date") || "2026-06-22";
    const from = url.searchParams.get("from") || "11:30";
    const to = url.searchParams.get("to") || "12:30";
    const seats = Number(url.searchParams.get("seats") || 1);
    sendJson(res, 200, { rooms: availableRooms({ date, from, to, seats }) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    sendJson(res, 200, { bookings: readDb().bookings });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const body = await readBody(req);
    sendJson(res, 201, { booking: createBooking(body), message: "Room booked" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/agent-command") {
    const body = await readBody(req);
    const parsed = parseAgentCommand(body.command);
    const booking = createBooking({ ...parsed, ...body.defaults });
    sendJson(res, 201, {
      message: `Booked room ${booking.roomName} for ${booking.date} ${booking.from}-${booking.to}.`,
      parsed,
      booking
    });
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    sendStatic(req, res);
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Places agent demo running on http://localhost:${PORT}`);
  console.log(`Demo API key: ${API_KEY}`);
});
