import * as vscode from "vscode";
import { MissionBarisalManager } from "./missionBarisalManager";

export class MissionBarisalPanel {
  private _panel: vscode.WebviewPanel | undefined;
  private _context: vscode.ExtensionContext;
  private _manager: MissionBarisalManager;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    context: vscode.ExtensionContext,
    manager: MissionBarisalManager,
  ) {
    this._context = context;
    this._manager = manager;
  }

  show(): void {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      "mission-barisal-panel",
      "Mission Barisal",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    this._panel.iconPath = vscode.Uri.parse(
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🧟</text></svg>',
    );

    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(
      () => {
        this._panel = undefined;
      },
      null,
      this._disposables,
    );

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message: any) => {
        switch (message.command) {
          case "send":
            await this._handleSend(message.text);
            break;
          case "connect":
            await this._manager.connect();
            this._postMessage("connection", {
              connected: this._manager.isConnected(),
              url: this._manager.getServerUrl(),
            });
            break;
          case "disconnect":
            this._manager.disconnect();
            this._postMessage("connection", {
              connected: false,
              url: this._manager.getServerUrl(),
            });
            break;
          case "listTools":
            await this._handleListTools();
            break;
          case "health":
            await this._handleHealth();
            break;
        }
      },
      null,
      this._disposables,
    );

    // Send initial connection status
    setTimeout(() => {
      this._postMessage("connection", {
        connected: this._manager.isConnected(),
        url: this._manager.getServerUrl(),
      });
    }, 500);
  }

  dispose(): void {
    this._panel?.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }

  private _postMessage(type: string, data: any): void {
    this._panel?.webview.postMessage({ type, data });
  }

  private async _handleSend(text: string): Promise<void> {
    if (!text.trim()) return;

    if (!this._manager.isConnected()) {
      this._postMessage("error", {
        message: "Not connected to server. Click Connect first.",
      });
      return;
    }

    // Start SSE streaming
    this._postMessage("mission_start", { input: text });

    this._manager.startMissionSSE(text, {
      onEvent: (event, data) => {
        this._postMessage("sse_event", { event, data });
      },
      onError: (error) => {
        this._postMessage("error", { message: error.message });
      },
      onDone: () => {
        this._postMessage("mission_done", {});
      },
    });
  }

  private async _handleListTools(): Promise<void> {
    try {
      const tools = await this._manager.listTools();
      this._postMessage("tools", { tools });
    } catch (err: any) {
      this._postMessage("error", { message: err.message });
    }
  }

  private async _handleHealth(): Promise<void> {
    try {
      const result = await this._manager["_httpPost"]("/health", {});
      this._postMessage("health_result", { result });
    } catch (err: any) {
      this._postMessage("error", { message: err.message });
    }
  }

  // ─── HTML ──────────────────────────────────────────────────────

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mission Barisal</title>
    <style>
        :root {
            --bg: #0a0e17;
            --bg2: #111827;
            --bg3: #1a2332;
            --border: #2d3748;
            --text: #e2e8f0;
            --text2: #94a3b8;
            --green: #22c55e;
            --blue: #3b82f6;
            --purple: #8b5cf6;
            --orange: #f59e0b;
            --red: #ef4444;
            --cyan: #06b6d4;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

        /* Header */
        .header { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 12px 16px; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .header h1 { font-size: 16px; font-weight: 700; flex: 1; }
        .header h1 span { background: linear-gradient(135deg, var(--green), var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .status { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; }
        .status-dot.connected { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .status-dot.disconnected { background: var(--muted); }
        .btn { padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg3); color: var(--text); cursor: pointer; font-size: 12px; transition: all 0.2s; }
        .btn:hover { background: var(--border); }
        .btn.primary { background: var(--green); color: #000; border-color: var(--green); }
        .btn.primary:hover { background: #16a34a; }
        .btn.danger { background: var(--red); color: #fff; border-color: var(--red); }
        .btn.danger:hover { background: #dc2626; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Connection bar */
        .conn-bar { background: var(--bg3); padding: 8px 16px; display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .conn-bar .url { color: var(--cyan); font-family: monospace; }

        /* Main content */
        .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

        /* Agent status */
        .agent-bar { display: flex; gap: 6px; padding: 8px 16px; background: var(--bg2); border-bottom: 1px solid var(--border); flex-wrap: wrap; flex-shrink: 0; }
        .agent-chip { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 500; border: 1px solid var(--border); display: flex; align-items: center; gap: 4px; }
        .agent-chip.idle { background: rgba(100,116,139,0.1); color: var(--text2); }
        .agent-chip.working { background: rgba(59,130,246,0.15); color: var(--blue); border-color: var(--blue); }
        .agent-chip.done { background: rgba(34,197,94,0.15); color: var(--green); border-color: var(--green); }

        /* Messages area */
        .messages { flex: 1; overflow-y: auto; padding: 16px; }
        .message { margin-bottom: 12px; padding: 12px; border-radius: 8px; background: var(--bg3); border: 1px solid var(--border); }
        .message .msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
        .message .msg-header .tag { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .message .msg-header .tag.system { background: rgba(139,92,246,0.2); color: var(--purple); }
        .message .msg-header .tag.agent { background: rgba(59,130,246,0.2); color: var(--blue); }
        .message .msg-header .tag.output { background: rgba(34,197,94,0.2); color: var(--green); }
        .message .msg-header .tag.error { background: rgba(239,68,68,0.2); color: var(--red); }
        .message .msg-header .tag.log { background: rgba(245,158,11,0.2); color: var(--orange); }
        .message .msg-content { font-size: 13px; line-height: 1.6; color: var(--text2); white-space: pre-wrap; word-break: break-word; }
        .message .msg-content strong { color: var(--text); }

        /* Input area */
        .input-area { display: flex; gap: 8px; padding: 12px 16px; background: var(--bg2); border-top: 1px solid var(--border); flex-shrink: 0; }
        .input-area textarea { flex: 1; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 10px; color: var(--text); font-size: 13px; resize: none; min-height: 40px; max-height: 120px; outline: none; }
        .input-area textarea:focus { border-color: var(--blue); }
        .input-area textarea::placeholder { color: var(--muted); }
        .input-area .send-btn { padding: 8px 20px; border: none; border-radius: 8px; background: var(--green); color: #000; font-weight: 600; cursor: pointer; font-size: 13px; }
        .input-area .send-btn:hover { background: #16a34a; }
        .input-area .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Progress */
        .progress-bar { height: 3px; background: var(--bg3); border-radius: 2px; overflow: hidden; margin: 0 16px 8px; flex-shrink: 0; }
        .progress-bar .fill { height: 100%; background: linear-gradient(90deg, var(--green), var(--blue)); transition: width 0.5s; width: 0%; }

        /* Scroll */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--muted); }
    </style>
</head>
<body>

    <!-- Header -->
    <div class="header">
        <h1><span>🧟 Mission Barisal</span></h1>
        <div class="status">
            <span class="status-dot disconnected" id="statusDot"></span>
            <span id="statusText">Disconnected</span>
        </div>
        <button class="btn primary" id="connectBtn" onclick="toggleConnect()">Connect</button>
        <button class="btn" id="toolsBtn" onclick="listTools()" disabled>🔧 Tools</button>
    </div>

    <!-- Connection bar -->
    <div class="conn-bar">
        <span>🎯 Server:</span>
        <span class="url" id="serverUrl">http://localhost:3000</span>
        <span id="healthBadge" style="margin-left:auto;">—</span>
    </div>

    <!-- Agent status bar -->
    <div class="agent-bar" id="agentBar">
        <span style="color:var(--muted); font-size:11px;">Agents waiting...</span>
    </div>

    <!-- Progress -->
    <div class="progress-bar"><div class="fill" id="progressFill"></div></div>

    <!-- Messages -->
    <div class="main">
        <div class="messages" id="messages">
            <div class="message">
                <div class="msg-header"><span class="tag system">SYSTEM</span></div>
                <div class="msg-content">🚀 Welcome to <strong>Mission Barisal</strong>! Connect to the server, then type a question to start a multi-agent debate.</div>
            </div>
        </div>
    </div>

    <!-- Input -->
    <div class="input-area">
        <textarea id="inputBox" placeholder="Ask the agents something..." rows="1" disabled></textarea>
        <button class="send-btn" id="sendBtn" onclick="sendMessage()" disabled>➤</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let connected = false;
        let missionActive = false;

        // Agent definitions
        const AGENTS = [
            { id: 'code-guru', emoji: '🧠', label: 'Code Guru' },
            { id: 'bug-hunter', emoji: '🐛', label: 'Bug Hunter' },
            { id: 'security-hero', emoji: '🛡️', label: 'Security Hero' },
            { id: 'perf-wizard', emoji: '⚡', label: 'Perf Wizard' },
            { id: 'doc-king', emoji: '📖', label: 'Doc King' },
            { id: 'qa-tyrant', emoji: '👑', label: 'QA Tyrant' }
        ];

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const { type, data } = event.data;

            switch (type) {
                case 'connection':
                    updateConnection(data.connected, data.url);
                    break;

                case 'sse_event':
                    handleSSEEvent(data.event, data.data);
                    break;

                case 'mission_start':
                    missionActive = true;
                    updateSendButton();
                    addMessage('system', '🚀 Mission started...');
                    updateProgress(10);
                    break;

                case 'mission_done':
                    missionActive = false;
                    updateSendButton();
                    updateProgress(100);
                    setTimeout(() => updateProgress(0), 2000);
                    break;

                case 'error':
                    addMessage('error', '❌ ' + data.message);
                    missionActive = false;
                    updateSendButton();
                    break;

                case 'tools':
                    const toolList = data.tools.map(t => '• ' + t.name + (t.description ? ': ' + t.description : '')).join('\\n');
                    addMessage('system', '🔧 Available Tools:\\n' + toolList);
                    break;
            }
        });

        function updateConnection(conn, url) {
            connected = conn;
            document.getElementById('statusDot').className = 'status-dot ' + (conn ? 'connected' : 'disconnected');
            document.getElementById('statusText').textContent = conn ? 'Connected ✓' : 'Disconnected';
            document.getElementById('connectBtn').textContent = conn ? 'Disconnect' : 'Connect';
            document.getElementById('connectBtn').className = 'btn ' + (conn ? 'danger' : 'primary');
            document.getElementById('serverUrl').textContent = url || 'http://localhost:3000';
            document.getElementById('inputBox').disabled = !conn;
            document.getElementById('sendBtn').disabled = !conn;
            document.getElementById('toolsBtn').disabled = !conn;
            if (conn) {
                document.getElementById('healthBadge').textContent = '✅ Connected';
                document.getElementById('healthBadge').style.color = '#22c55e';
            } else {
                document.getElementById('healthBadge').textContent = '❌ Disconnected';
                document.getElementById('healthBadge').style.color = '#ef4444';
            }
            updateAgentBar(conn ? 'idle' : null);
        }

        function toggleConnect() {
            if (connected) {
                vscode.postMessage({ command: 'disconnect' });
            } else {
                vscode.postMessage({ command: 'connect' });
            }
        }

        function sendMessage() {
            const input = document.getElementById('inputBox');
            const text = input.value.trim();
            if (!text || !connected || missionActive) return;

            addMessage('user', '🧑 ' + text);
            input.value = '';
            vscode.postMessage({ command: 'send', text });
        }

        function listTools() {
            vscode.postMessage({ command: 'listTools' });
        }

        function updateSendButton() {
            const btn = document.getElementById('sendBtn');
            btn.disabled = !connected || missionActive;
            btn.textContent = missionActive ? '⏳' : '➤';
        }

        function updateProgress(pct) {
            document.getElementById('progressFill').style.width = pct + '%';
        }

        // Agent bar management
        function updateAgentBar(state) {
            const bar = document.getElementById('agentBar');
            if (!state) {
                bar.innerHTML = '<span style="color:var(--muted); font-size:11px;">Agents waiting...</span>';
                return;
            }
            bar.innerHTML = AGENTS.map(a => {
                const statusClass = state === 'idle' ? 'idle' : 'idle';
                return '<span class="agent-chip ' + statusClass + '" id="agent-' + a.id + '">' + a.emoji + ' ' + a.label + '</span>';
            }).join('');
        }

        function setAgentStatus(agentId, status) {
            const el = document.getElementById('agent-' + agentId);
            if (el) {
                el.className = 'agent-chip ' + status;
            }
        }

        // SSE event handler
        function handleSSEEvent(event, data) {
            switch (event) {
                case 'mission_start':
                    addMessage('system', '🎯 Mission ID: ' + (data.id || 'N/A'));
                    const count = data.totalAgents || AGENTS.length;
                    updateProgress(5);
                    break;

                case 'log':
                    addMessage('log', '📝 ' + (data.message || data.text || JSON.stringify(data)));
                    break;

                case 'agent_status':
                    if (data.agent_id) {
                        const status = data.status || 'working';
                        setAgentStatus(data.agent_id, status === 'done' ? 'done' : 'working');
                        const name = AGENTS.find(a => a.id === data.agent_id)?.label || data.agent_id;
                        addMessage('agent', (status === 'done' ? '✅ ' : '🔄 ') + name + (status === 'done' ? ' completed' : ' is working...'));
                    }
                    break;

                case 'output':
                    addMessage('output', '📄 ' + (data.content || data.text || JSON.stringify(data)));
                    break;

                case 'progress':
                    if (data.percent) updateProgress(data.percent);
                    if (data.info) addMessage('log', '📊 ' + data.info);
                    break;

                case 'mission_done':
                    addMessage('output', '🏁 **Mission Complete!**\\n\\n' + (data.combined || data.output || JSON.stringify(data)));
                    updateProgress(100);
                    // Reset agent bar
                    AGENTS.forEach(a => setAgentStatus(a.id, 'idle'));
                    missionActive = false;
                    updateSendButton();
                    setTimeout(() => updateProgress(0), 3000);
                    break;

                default:
                    addMessage('log', '📨 Event: ' + event + ' → ' + JSON.stringify(data).slice(0, 200));
            }
        }

        // Add message to UI
        function addMessage(type, content) {
            const container = document.getElementById('messages');
            const msg = document.createElement('div');
            msg.className = 'message';

            const tags = {
                system: { class: 'system', label: 'SYSTEM' },
                user: { class: 'system', label: 'YOU' },
                agent: { class: 'agent', label: 'AGENT' },
                output: { class: 'output', label: 'OUTPUT' },
                error: { class: 'error', label: 'ERROR' },
                log: { class: 'log', label: 'LOG' }
            };
            const tag = tags[type] || tags.log;

            msg.innerHTML = '<div class="msg-header"><span class="tag ' + tag.class + '">' + tag.label + '</span></div><div class="msg-content">' + content.replace(/\\n/g, '<br>') + '</div>';
            container.appendChild(msg);
            container.scrollTop = container.scrollHeight;
        }

        // Enter to send
        document.getElementById('inputBox').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    </script>
</body>
</html>`;
  }
}
