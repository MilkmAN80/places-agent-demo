# Places Agent Demo

This is a functional demo of an Accenture Places-style room booking page with agent-callable APIs.

## Run locally

Install Node.js 18 or later, then run:

```bash
cd places-agent-demo
npm start
```

Open:

```text
http://localhost:3000
```

Default demo API key:

```text
demo-agent-key
```

For a custom key:

```bash
set PLACES_AGENT_API_KEY=your-test-key
npm start
```

## Put it online

Deploy the `places-agent-demo` folder to any Node host such as Render, Railway, Azure App Service, or a small VM.

For Render:

1. Create a new Web Service.
2. Use this folder as the project root.
3. Start command: `node server.js`
4. Add environment variable: `PLACES_AGENT_API_KEY=your-test-key`
5. Deploy and copy the public URL.

## Agent API

Use this header on protected requests:

```text
Authorization: Bearer your-test-key
```

Health check:

```http
GET /api/health
```

Find available rooms:

```http
GET /api/rooms?date=2026-06-22&from=11:30&to=12:30&seats=4
```

Book a specific room:

```http
POST /api/bookings
Content-Type: application/json
Authorization: Bearer your-test-key

{
  "roomId": "2.10",
  "date": "2026-06-22",
  "from": "11:30",
  "to": "12:30",
  "seats": 4,
  "title": "Client prep",
  "requestedBy": "copilot.agent"
}
```

Send a plain-English instruction:

```http
POST /api/agent-command
Content-Type: application/json
Authorization: Bearer your-test-key

{
  "command": "Book room 2.10 for 4 people on 2026-06-22 from 11:30 to 12:30"
}
```

List reservations:

```http
GET /api/bookings
Authorization: Bearer your-test-key
```

When a booking succeeds, it appears in the Reservations screen. Demo data is stored in `data/db.json`.
