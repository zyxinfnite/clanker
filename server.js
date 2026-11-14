import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const rooms = new Map();

function roomFor(id) {
  if (!rooms.has(id)) rooms.set(id, { videoId: "", title: "Waiting for a video", time: 0, playing: false, chat: [] });
  return rooms.get(id);
}
function sendRoom(roomId, payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.roomId === roomId) client.send(data);
  }
}
function safeVideoId(value) {
  const s = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1, 12);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || "";
  } catch {}
  return "";
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const roomId = String(msg.roomId || "lobby").slice(0, 32);
    ws.roomId = roomId;
    const room = roomFor(roomId);

    if (msg.type === "join") {
      ws.send(JSON.stringify({ type: "state", room }));
      sendRoom(roomId, { type: "notice", text: "Someone joined the room." });
    } else if (msg.type === "video") {
      const videoId = safeVideoId(msg.video);
      if (!videoId) return ws.send(JSON.stringify({ type: "error", text: "That doesn't look like a valid YouTube link or video ID." }));
      room.videoId = videoId;
      room.title = "YouTube video";
      room.time = 0;
      room.playing = false;
      sendRoom(roomId, { type: "state", room });
    } else if (msg.type === "sync") {
      room.time = Math.max(0, Number(msg.time) || 0);
      room.playing = Boolean(msg.playing);
      sendRoom(roomId, { type: "sync", time: room.time, playing: room.playing, from: ws.id });
    } else if (msg.type === "chat") {
      const entry = { id: randomUUID(), name: String(msg.name || "Guest").slice(0, 24), text: String(msg.text || "").slice(0, 500), at: Date.now() };
      if (!entry.text.trim()) return;
      room.chat.push(entry);
      room.chat = room.chat.slice(-100);
      sendRoom(roomId, { type: "chat", entry });
    }
  });
  ws.id = randomUUID();
});

app.get("/health", (_req, res) => res.json({ ok: true, app: "WatchBuddy" }));

// MCP server: tools let a connected assistant inspect and update a WatchBuddy room.
// This starter uses a simple bearer token. Set WATCHBUDDY_TOKEN in the hosting environment.
const mcp = new McpServer({ name: "watchbuddy", version: "1.0.0" });
mcp.tool("get_watch_room", "Get the current video, playback timestamp, and recent chat for a WatchBuddy room.",
  { room_id: z.string().min(1).max(32) },
  async ({ room_id }) => {
    const r = roomFor(room_id);
    return { content: [{ type: "text", text: JSON.stringify({ videoId: r.videoId, title: r.title, time: r.time, playing: r.playing, chat: r.chat.slice(-30) }) }] };
  }
);
mcp.tool("set_watch_video", "Set the YouTube video in a WatchBuddy room.",
  { room_id: z.string().min(1).max(32), youtube_url_or_id: z.string() },
  async ({ room_id, youtube_url_or_id }) => {
    const videoId = safeVideoId(youtube_url_or_id);
    if (!videoId) return { isError: true, content: [{ type: "text", text: "Invalid YouTube URL or video ID." }] };
    const r = roomFor(room_id);
    r.videoId = videoId; r.title = "YouTube video"; r.time = 0; r.playing = false;
    sendRoom(room_id, { type: "state", room: r });
    return { content: [{ type: "text", text: `Set room ${room_id} to https://www.youtube.com/watch?v=${videoId}` }] };
  }
);
mcp.tool("send_watch_chat", "Post a chat message to a WatchBuddy room.",
  { room_id: z.string().min(1).max(32), name: z.string().max(24).optional(), message: z.string().min(1).max(500) },
  async ({ room_id, name, message }) => {
    const entry = { id: randomUUID(), name: name || "ChatGPT", text: message, at: Date.now() };
    const r = roomFor(room_id); r.chat.push(entry); r.chat = r.chat.slice(-100);
    sendRoom(room_id, { type: "chat", entry });
    return { content: [{ type: "text", text: "Message posted to WatchBuddy room." }] };
  }
);

app.post("/mcp", async (req, res) => {
  const expected = process.env.WATCHBUDDY_TOKEN;
  if (expected && req.headers.authorization !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await mcp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`WatchBuddy running on port ${port}`));
