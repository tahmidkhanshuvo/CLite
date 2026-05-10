(function () {
  "use strict";

  const terminalEl = document.getElementById("terminal");
  const statusEl = document.getElementById("status");
  const modeLabel = document.getElementById("modeLabel");
  const timerEl = document.getElementById("timer");
  const params = new URLSearchParams(window.location.search);
  const mode = window.location.pathname.startsWith("/team") ? "team" : "demo";

  modeLabel.textContent = mode === "team" ? "Team Mode" : "Public Demo Mode";

  const term = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: '"Cascadia Mono", Consolas, "Liberation Mono", monospace',
    fontSize: window.innerWidth <= 480 ? 12 : 14,
    theme: {
      background: "#050805",
      foreground: "#d7ffd7",
      cursor: "#40ff7a",
      selectionBackground: "#174d2c",
      black: "#050805",
      green: "#40ff7a",
      brightGreen: "#8dffb0",
      cyan: "#65e8ff",
      brightCyan: "#a4f3ff",
      yellow: "#ffe66d",
      brightYellow: "#fff0a3"
    }
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(terminalEl);

  let socket = null;

  let fitFrame = 0;
  function fit() {
    fitFrame = 0;
    fitAddon.fit();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    }
  }

  function queueFit() {
    if (fitFrame) return;
    fitFrame = window.requestAnimationFrame(fit);
  }

  queueFit();

  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const qs = new URLSearchParams({ cols: String(term.cols), rows: String(term.rows) });
  if (mode === "team") qs.set("key", params.get("key") || "");
  socket = new WebSocket(`${scheme}://${window.location.host}/ws/${mode}?${qs.toString()}`);

  let expiresAt = 0;
  let timerHandle = null;

  function setStatus(text, connected) {
    statusEl.textContent = text;
    statusEl.classList.toggle("connected", connected);
  }

  function startTimer(timeoutMs) {
    expiresAt = Date.now() + timeoutMs;
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      const totalSeconds = Math.ceil(remaining / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      timerEl.textContent = hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
      if (remaining <= 0) clearInterval(timerHandle);
    }, 1000);
  }

  socket.addEventListener("open", () => {
    setStatus("Connected", true);
    queueFit();
  });

  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string" && event.data.startsWith("{")) {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "session") {
          startTimer(message.timeoutMs);
          return;
        }
        if (message.type === "error") {
          term.writeln(`\r\n${message.message}`);
          return;
        }
        if (message.type === "notice") {
          term.writeln(`\r\n${message.message}`);
          return;
        }
        if (message.type === "disconnect") {
          term.writeln(`\r\nSession closed: ${message.reason}`);
          return;
        }
      } catch {
        // Terminal output may legitimately start with a brace.
      }
    }
    term.write(event.data);
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected", false);
    term.writeln("\r\nDisconnected.");
    if (timerHandle) clearInterval(timerHandle);
  });

  socket.addEventListener("error", () => {
    setStatus("Error", false);
  });

  term.onData((data) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(queueFit).observe(terminalEl);
  }

  window.addEventListener("resize", queueFit);
})();
