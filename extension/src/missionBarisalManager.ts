import * as vscode from "vscode";
import * as http from "http";
import * as https from "https";
import { URL } from "url";

interface SSECallback {
  onEvent?: (event: string, data: any) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export class MissionBarisalManager {
  private _serverUrl: string;
  private _connected: boolean = false;
  private _pingTimer: ReturnType<typeof setInterval> | null = null;
  private _currentSSE: {
    req: http.ClientRequest;
    res: http.IncomingMessage;
  } | null = null;
  private _context: vscode.ExtensionContext;
  private _statusBarItem: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    const config = vscode.workspace.getConfiguration("mission-barisal");
    this._serverUrl = config.get<string>("serverUrl", "http://localhost:3000");

    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99,
    );
    this._statusBarItem.text = "$(circle-slash) MB: Disconnected";
    this._statusBarItem.tooltip = "Mission Barisal — Click to connect";
    this._statusBarItem.command = "mission-barisal.connect";
    this._statusBarItem.show();
    context.subscriptions.push(this._statusBarItem);

    // Watch config changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("mission-barisal.serverUrl")) {
          const cfg = vscode.workspace.getConfiguration("mission-barisal");
          this._serverUrl = cfg.get<string>(
            "serverUrl",
            "http://localhost:3000",
          );
        }
      }),
    );
  }

  // ─── Connection ────────────────────────────────────────────────

  async connect(): Promise<boolean> {
    try {
      const healthy = await this._healthCheck();
      if (!healthy) {
        this._connected = false;
        this._updateStatus(false);
        vscode.window.showWarningMessage(
          "Mission Barisal: Server not reachable at " + this._serverUrl,
        );
        return false;
      }
      this._connected = true;
      this._updateStatus(true);
      this._startPing();
      this._statusBarItem.command = "mission-barisal.disconnect";
      vscode.commands.executeCommand(
        "setContext",
        "mission-barisal.connected",
        true,
      );
      return true;
    } catch (err: any) {
      this._connected = false;
      this._updateStatus(false);
      return false;
    }
  }

  disconnect(): void {
    this._connected = false;
    this._stopPing();
    this._closeSSE();
    this._updateStatus(false);
    this._statusBarItem.command = "mission-barisal.connect";
    vscode.commands.executeCommand(
      "setContext",
      "mission-barisal.connected",
      false,
    );
  }

  isConnected(): boolean {
    return this._connected;
  }

  getServerUrl(): string {
    return this._serverUrl;
  }

  // ─── Health Check ──────────────────────────────────────────────

  private _healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      const url = new URL("/health", this._serverUrl);
      const mod = url.protocol === "https:" ? https : http;
      const req = mod.get(url.href, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  // ─── Ping / Heartbeat ──────────────────────────────────────────

  private _startPing(): void {
    this._stopPing();
    const config = vscode.workspace.getConfiguration("mission-barisal");
    const interval = config.get<number>("pingInterval", 30) * 1000;
    this._pingTimer = setInterval(() => {
      this._healthCheck().then((ok) => {
        if (!ok && this._connected) {
          this.disconnect();
          vscode.window.showWarningMessage(
            "Mission Barisal: Server connection lost.",
          );
        }
      });
    }, interval);
  }

  private _stopPing(): void {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  private _updateStatus(connected: boolean): void {
    if (connected) {
      this._statusBarItem.text = "$(robot) MB: Connected ✓";
      this._statusBarItem.color = "#22c55e";
    } else {
      this._statusBarItem.text = "$(circle-slash) MB: Disconnected";
      this._statusBarItem.color = undefined;
    }
  }

  // ─── SSE Streaming ─────────────────────────────────────────────

  startMissionSSE(input: string, callbacks: SSECallback): void {
    if (!this._connected) {
      callbacks.onError?.(new Error("Not connected"));
      return;
    }

    const url = new URL("/api/mission", this._serverUrl);
    const body = JSON.stringify({ input });
    const mod = url.protocol === "https:" ? https : http;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = mod.request(options, (res) => {
      if (res.statusCode !== 200) {
        callbacks.onError?.(
          new Error(`Server returned status ${res.statusCode}`),
        );
        return;
      }

      this._currentSSE = { req, res };
      let buffer = "";

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const eventName = line.slice(7).trim();
            // Next line with "data:" will contain the payload
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            try {
              const data = JSON.parse(dataStr);
              // Determine event type from context
              if (data.type === "mission_start") {
                callbacks.onEvent?.("mission_start", data);
              } else if (data.type === "agent_status") {
                callbacks.onEvent?.("agent_status", data);
              } else if (data.type === "output") {
                callbacks.onEvent?.("output", data);
              } else if (data.type === "log") {
                callbacks.onEvent?.("log", data);
              } else if (data.type === "progress") {
                callbacks.onEvent?.("progress", data);
              } else if (data.type === "mission_done") {
                callbacks.onEvent?.("mission_done", data);
                callbacks.onDone?.();
              } else {
                // Generic event
                callbacks.onEvent?.("data", data);
              }
            } catch {
              // Non-JSON data lines
            }
          }
        }
      });

      res.on("end", () => {
        this._currentSSE = null;
        callbacks.onDone?.();
      });

      res.on("error", (err) => {
        this._currentSSE = null;
        callbacks.onError?.(err);
      });
    });

    req.on("error", (err) => {
      this._currentSSE = null;
      callbacks.onError?.(err);
    });

    req.write(body);
    req.end();
  }

  private _closeSSE(): void {
    if (this._currentSSE) {
      this._currentSSE.res.destroy();
      this._currentSSE.req.destroy();
      this._currentSSE = null;
    }
  }

  // ─── Chat (OpenAI-compatible) ──────────────────────────────────

  sendChatMessage(input: string): Promise<any> {
    return this._httpPost("/v1/chat/completions", {
      messages: [{ role: "user", content: input }],
      stream: false,
    });
  }

  // ─── MCP (JSON-RPC 2.0) ────────────────────────────────────────

  async listTools(): Promise<MCPTool[]> {
    const result = await this._mcpRequest("tools/list", {});
    return result?.tools || [];
  }

  async callTool(name: string, args: any): Promise<any> {
    return this._mcpRequest("tools/call", { name, arguments: args });
  }

  private async _mcpRequest(method: string, params: any): Promise<any> {
    const response = await this._httpPost("/mcp", {
      jsonrpc: "2.0",
      id: Date.now().toString(),
      method,
      params,
    });
    if (response.error) {
      throw new Error(
        `MCP error: ${response.error.message || JSON.stringify(response.error)}`,
      );
    }
    return response.result;
  }

  // ─── HTTP Helper ───────────────────────────────────────────────

  private _httpPost(path: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(path, this._serverUrl);
        const mod = url.protocol === "https:" ? https : http;
        const data = JSON.stringify(body);

        const options: http.RequestOptions = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
          },
          timeout: 30000,
        };

        const req = mod.request(options, (res) => {
          let responseData = "";
          res.on("data", (chunk: Buffer) => {
            responseData += chunk.toString();
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(responseData));
            } catch {
              resolve(responseData);
            }
          });
        });

        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timeout"));
        });
        req.write(data);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // ─── Chat Completions (OpenAI-compatible, full history) ─────

  async sendChatCompletions(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
    tools?: any[];
  }): Promise<any> {
    return this._httpPost("/v1/chat/completions", params);
  }

  // ─── SSOT: Scan workspace & auto-generate ─────────────────────

  async scanWorkspaceForSSOT(workspacePath: string): Promise<any> {
    if (!this._connected) {
      console.log("[Mission Barisal] Not connected, skipping SSOT scan");
      return null;
    }
    try {
      // Step 1: Set working directory (triggers SSOT generation on server)
      const wdResult = await this._mcpRequest("tools/call", {
        name: "set_working_dir",
        arguments: { directory: workspacePath },
      });
      // Step 2: Read the generated SSOT
      const ssotResult = await this._mcpRequest("tools/call", {
        name: "read_ssot",
        arguments: {},
      });
      const ssotContent = ssotResult?.content?.[0]?.text || "SSOT generated";
      console.log(
        `[Mission Barisal] SSOT generated for ${workspacePath}: ${ssotContent.slice(0, 100)}...`,
      );
      return { ssot: ssotContent, workingDir: wdResult };
    } catch (err: any) {
      console.log(`[Mission Barisal] SSOT scan failed: ${err.message}`);
      return null;
    }
  }

  // ─── Quick agent query (single agent) ─────────────────────────

  async queryAgent(agentId: string, input: string): Promise<any> {
    return this._httpPost("/api/mission", {
      input,
      agent: agentId,
    });
  }

  // ─── Anti-Dote ────────────────────────────────────────────────

  async checkAntiDote(input: string): Promise<any> {
    return this._httpPost("/api/v1/anti-dote", { input });
  }
}
