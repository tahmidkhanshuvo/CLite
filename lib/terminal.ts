export interface TerminalHandle {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: () => void): void;
}

/** Bun's native PTY avoids an extra Node runtime and a compiled node-pty addon. */
export function spawnTerminal(command: string[], cwd: string, env: Record<string, string | undefined>, cols: number, rows: number): TerminalHandle {
  const listeners: Array<(data: string) => void> = [];
  const exits: Array<() => void> = [];
  const decoder = new TextDecoder();
  let pending = "";
  let finished = false;
  const proc = Bun.spawn(command, {
    cwd, env, windowsHide: true,
    terminal: {
      cols, rows, name: "xterm-256color",
      data(_terminal, bytes) {
        const data = decoder.decode(bytes, { stream: true });
        if (listeners.length) listeners.forEach(listener => listener(data));
        else pending = (pending + data).slice(-128 * 1024);
      }
    }
  });
  void proc.exited.then(() => {
    finished = true;
    proc.terminal?.close();
    exits.forEach(listener => listener());
  });
  return {
    pid: proc.pid,
    write: data => { proc.terminal?.write(data); },
    resize: (cols, rows) => { proc.terminal?.resize(cols, rows); },
    kill: () => { proc.kill("SIGKILL"); proc.terminal?.close(); },
    onData(listener) {
      listeners.push(listener);
      if (pending) { listener(pending); pending = ""; }
    },
    onExit(listener) { exits.push(listener); if (finished) queueMicrotask(listener); }
  };
}
