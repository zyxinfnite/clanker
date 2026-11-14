# WatchBuddy

A starter watch-party app with synchronized YouTube playback, room chat, and a small MCP server.

## Run it locally

1. Install Node.js 20 or newer.
2. Unzip this folder.
3. In the folder, run:

   ```bash
   npm install
   npm start
   ```

4. Open `http://localhost:3000`.

For friends to join from other devices, deploy this project to a Node.js host that supports WebSockets (for example, Render or Railway). Share the deployed URL plus the room name. The server stores room state in memory, so rooms reset if the server restarts.

## MCP tools included

The same server exposes an MCP endpoint at `/mcp` with:
- `get_watch_room`
- `set_watch_video`
- `send_watch_chat`

Set `WATCHBUDDY_TOKEN` in the host environment to require a bearer token for `/mcp`. Use HTTPS in production.

## Connecting it to ChatGPT

This is a **custom MCP server starter**, not an already-installed ChatGPT connector. To add it, the ChatGPT account must expose custom MCP app/connector setup and accept the server's remote URL. The screenshots in this conversation show Plugins but not a custom connector creation control. If your account doesn't offer that control, use the web app directly or another MCP-compatible client.

## Important limitations

- This is a starter project, not a production service. It has no database, user accounts, moderation, or persistent room history.
- YouTube videos must allow embedding. Some videos cannot play inside an embedded player.
- Playback synchronization is best-effort and may drift slightly.
- The MCP tools expose room metadata and chat. They do **not** stream live video/audio to ChatGPT and do not make ChatGPT automatically watch the video.
- Do not publish a token in browser code or share it in a public repository.
