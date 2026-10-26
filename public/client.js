(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const mode = location.pathname.startsWith("/team") ? "team" : "demo";
  $("modeLabel").textContent = mode === "team" ? "Team Mode" : "Public Practice";
  // Tokens belong to this tab; shared cookies authenticate the browser, not a specific shell.
  const storageKey = `clite-session-${mode}`;
  let token = sessionStorage.getItem(storageKey) || "";
  let socket;
  let stopped = false;
  let retryTimer;
  let retries = 0;
  let expiresAt = 0;
  let idleExpiresAt = 0;
  let clockOffset = 0;
  let transcript = "";
  let maxUploadBytes = 10 * 1024 * 1024;
  const term = new Terminal({
    cursorBlink: true, convertEol: true, scrollback: 5000,
    fontFamily: '"Cascadia Mono", Consolas, "Liberation Mono", monospace',
    fontSize: innerWidth <= 480 ? 12 : 14,
    theme: { background: "#050805", foreground: "#d7ffd7", cursor: "#40ff7a",
      selectionBackground: "#174d2c", black: "#050805", green: "#40ff7a",
      brightGreen: "#8dffb0", cyan: "#65e8ff", brightCyan: "#a4f3ff",
      yellow: "#ffe66d", brightYellow: "#fff0a3" }
  });
  const addon = new FitAddon.FitAddon();
  term.loadAddon(addon);
  term.open($("terminal"));
  let frame;
  function send(message) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
  function fit() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      addon.fit();
      send({ type: "resize", cols: term.cols, rows: term.rows });
    });
  }
  function status(text, connected) {
    $("status").textContent = text;
    $("status").classList.toggle("connected", connected);
    for (const id of ["keepAlive", "uploadButton", "exportButton", "endSession"]) $(id).disabled = !connected;
    $("reconnect").hidden = connected || stopped;
    $("newSession").hidden = !stopped;
  }
  function notice(text) { $("sessionMessage").textContent = text; }
  function state(message) {
    clockOffset = message.serverNow - Date.now();
    expiresAt = message.expiresAt;
    idleExpiresAt = message.idleExpiresAt;
    updateTimer();
  }
  function duration(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function updateTimer() {
    if (!expiresAt) return;
    const now = Date.now() + clockOffset;
    $("timer").textContent = `Idle ${duration(idleExpiresAt - now)} / session ${duration(expiresAt - now)}`;
    $("timer").classList.toggle("warning", Math.min(idleExpiresAt, expiresAt) - now < 120000);
  }
  setInterval(updateTimer, 1000);
  function connect() {
    clearTimeout(retryTimer);
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
    status(retries ? `Reconnecting (${retries}/10)` : "Connecting", false);
    socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${mode}`);
    socket.addEventListener("open", () => {
      addon.fit();
      send({ type: "hello", token, cols: term.cols, rows: term.rows });
    });
    socket.addEventListener("message", event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "output") {
        transcript = (transcript + message.data).slice(-2 * 1024 * 1024);
        term.write(message.data);
      } else if (message.type === "session") {
        token = message.token;
        sessionStorage.setItem(storageKey, token);
        retries = 0;
        if (message.resumed) term.reset();
        status(message.resumed ? "Resumed" : "Connected", true);
        state(message);
        notice(mode === "demo" ? "Start with challenges or help. Practice files and notes can be downloaded." : "Use clite help. Download workspaces before expiry or server restarts.");
        fit();
        term.focus();
      } else if (message.type === "state") {
        state(message);
      } else if (message.type === "warning") {
        state(message);
        notice(message.message);
      } else if (["disconnect", "expired", "error"].includes(message.type)) {
        notice(message.reason || message.message);
        term.writeln(`\r\n${message.reason || message.message}`);
        stopped = true;
        sessionStorage.removeItem(storageKey);
        token = "";
        status("Session ended", false);
      }
    });
    socket.addEventListener("close", event => {
      if (event.code === 4001) { stopped = true; notice("This session is open in another connection."); }
      status(stopped ? "Session ended" : "Disconnected", false);
      if (!stopped && token && retries < 10) {
        retries++;
        notice("Connection interrupted. Your workspace is held briefly; reconnecting automatically.");
        retryTimer = setTimeout(connect, Math.min(15000, 1000 * 2 ** (retries - 1)));
      } else if (!stopped) {
        notice("Could not connect. Retry, or return home to sign in. Capacity may be full.");
      }
    });
    socket.addEventListener("error", () => status("Connection error", false));
  }
  term.onData(data => send({ type: "input", data }));
  $("keepAlive").addEventListener("click", () => {
    send({ type: "keepalive" });
    notice("Idle deadline refreshed. The session lifetime is unchanged.");
    term.focus();
  });
  $("endSession").addEventListener("click", () => send({ type: "end" }));
  $("newSession").addEventListener("click", () => { sessionStorage.removeItem(storageKey); location.reload(); });
  $("reconnect").addEventListener("click", () => { retries = 0; connect(); });
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function headers() { return { Authorization: `Bearer ${token}`, "X-Clite-Mode": mode }; }
  $("saveTranscript").addEventListener("click", () => {
    const plain = transcript.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
    download(new Blob([plain], { type: "text/plain" }), "clite-transcript.txt");
  });
  $("exportButton").addEventListener("click", async () => {
    $("exportButton").disabled = true;
    try {
      const result = await fetch("/api/workspace/export", { headers: headers() });
      if (!result.ok) throw new Error((await result.json()).error || "Session unavailable.");
      download(await result.blob(), "clite-workspace.zip");
      notice("Workspace downloaded. Venvs, package caches and SSH keys are excluded. Run clite snapshot before exporting team dependencies.");
    } catch (error) { notice(error.message); }
    finally { $("exportButton").disabled = socket?.readyState !== WebSocket.OPEN; }
  });
  $("uploadButton").addEventListener("click", () => $("uploadFile").click());
  $("uploadFile").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > maxUploadBytes) throw new Error(`Upload limit is ${maxUploadBytes / 1024 / 1024} MiB.`);
      const result = await fetch(`/api/workspace/upload?name=${encodeURIComponent(file.name)}`, {
        method: "POST", headers: { ...headers(), "Content-Type": "application/octet-stream" }, body: file
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error || "Upload failed.");
      notice(`Uploaded ${payload.name} into your home directory (${payload.bytes} bytes).`);
    } catch (error) { notice(error.message); }
    finally { event.target.value = ""; term.focus(); }
  });
  fetch("/api/capabilities").then(r => r.json()).then(c => { maxUploadBytes = c.maxUploadBytes; }).catch(() => {});
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe($("terminal"));
  addEventListener("resize", fit);
  addEventListener("online", () => { if (!stopped) connect(); });
  fit();
  connect();
})();
