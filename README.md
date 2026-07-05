# 🧟 Mission Barisal v3

> **Multi-Agent AI Platform — 6 agents debate, cross-verify, and produce consensus answers via SSE + MCP**

---

## 📋 Overview

**Mission Barisal** is a zero-dependency, single-file Node.js server that orchestrates **6 AI agents** with distinct Bengali personas. Each agent has unique expertise — architecture, debugging, security, performance, documentation, and quality assurance. The agents debate your questions, cross-verify each other's answers, and produce a consensus response.

| Component     | Technology                                              | Location         |
| ------------- | ------------------------------------------------------- | ---------------- |
| **Server**    | Zero-dependency Node.js (native `http`, `crypto`, `fs`) | `server/z.js`    |
| **Extension** | VS Code Extension (TypeScript)                          | `extension/src/` |
| **API**       | REST + SSE + JSON-RPC 2.0 (MCP)                         | Port 3000        |

---

## 📁 Project Structure

```
mission-barisal/                     # Monorepo root
├── server/                          # Backend server
│   ├── z.js                         # Main server (~6000 lines, zero npm deps)
│   ├── PERSONAS.md                  # 6 agent definitions (Bengali personas)
│   ├── test_integration.js          # Integration tests
│   ├── test_masking.js              # Masking tests
│   └── doc/
│       ├── index.html               # API documentation
│       ├── mission-barisal-proof.html  # Mathematical proof of system
│       ├── SERVER-API-REFERENCE.md  # API reference
│       └── generate-audio.py        # Audio generation script
│
├── extension/                       # VS Code extension
│   ├── package.json                 # Extension manifest
│   ├── tsconfig.json                # TypeScript config
│   └── src/
│       ├── extension.ts             # Extension activation + ChatProvider
│       ├── missionBarisalManager.ts # HTTP/SSE/MCP connection manager
│       ├── missionBarisalPanel.ts   # Webview chat panel
│       └── missionBarisalAgentsProvider.ts  # Tree view provider
│
├── README.md                        # This file
└── .gitignore                       # Git ignore rules
```

---

## 🧠 Architecture

### 6 Agents (Bengali Personas)

| Agent             | Bengali Name     | Expertise                                            |
| ----------------- | ---------------- | ---------------------------------------------------- |
| **Code Guru**     | মনু (Monu)       | System architecture, design patterns, best practices |
| **Bug Hunter**    | জারিন (Jarin)    | Debugging, error analysis, stack trace reading       |
| **Security Hero** | বৃষ্টি (Brishti) | Vulnerability assessment, penetration testing, OWASP |
| **Perf Wizard**   | রাশেদ (Rashed)   | Performance optimization, caching, profiling         |
| **Doc King**      | হালিম (Halim)    | Documentation, API specs, README generation          |
| **QA Tyrant**     | মজনু (Majnu)     | Quality assurance, edge cases, test coverage         |

### Competition Router

The system supports **4 provider competition** with automatic failover:

| Provider     | Priority     | Base URL                     |
| ------------ | ------------ | ---------------------------- |
| **opencode** | 1 (highest)  | `https://opencode.ai/zen/v1` |
| **ustad**    | 2            | `ustad` provider             |
| **groq**     | 3            | `groq` provider              |
| **gemini**   | 4 (fallback) | `gemini` provider            |

### Anti-Dote Type Safety

6-step deterministic chain with mathematical proof:

1. **Validate** — Input validation
2. **Proof** — Logical proof construction
3. **Consent** — Agent consensus
4. **Contract** — Formal agreement
5. **Execute** — Execution (P(success) ≥ 0.95)
6. **Verify** — Cross-verification

### SSOT (Single Source of Truth)

Auto-generated project knowledge via `scanProject()` that detects:

- `package.json` (Node.js)
- `composer.json` (PHP)
- `requirements.txt` (Python)
- Any project descriptor

Written to `.zombiecoder/SSOT.md` and injected into agent context.

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version  | Notes                               |
| ----------- | -------- | ----------------------------------- |
| **Node.js** | ≥ 18.x   | Required for native `fetch` support |
| **npm**     | ≥ 9.x    | For extension development only      |
| **VS Code** | ≥ 1.90.0 | For extension usage                 |
| **Git**     | ≥ 2.30   | For version control                 |

---

## 🖥️ Server Setup

### Linux (Ubuntu/Debian/CentOS)

```bash
# 1. Clone the repository
git clone https://github.com/zombiecoderbd/mission-barisal-.git
cd mission-barisal-/server

# 2. Run the server
node z.js

# 3. Verify it's running
curl http://localhost:3000/health
# Expected: {"status":"ok","agents":6,"models":17,"uptime":"..."}
```

### Windows (PowerShell)

```powershell
# 1. Clone the repository
git clone https://github.com/zombiecoderbd/mission-barisal-.git
cd mission-barisal-/server

# 2. Run the server
node z.js

# 3. Verify it's running
Invoke-RestMethod -Uri http://localhost:3000/health
# Expected: {"status":"ok","agents":6,"models":17,"uptime":"..."}
```

### Windows (CMD)

```cmd
REM 1. Clone the repository
git clone https://github.com/zombiecoderbd/mission-barisal-.git
cd mission-barisal-/server

REM 2. Run the server
node z.js

REM 3. Verify in browser
REM Open http://localhost:3000/health in your browser
```

> **Note:** The server has **zero npm dependencies**. It uses only Node.js native modules (`http`, `https`, `crypto`, `fs`, `path`, `url`). Just `node z.js` and it runs!

---

## 🔌 VS Code Extension Setup

### Installation (All Platforms)

```bash
# Option 1: Install from VSIX
# In VS Code: Ctrl+Shift+P → "Extensions: Install from VSIX..."
# Select: mission-barisal/extension/mission-barisal-1.0.0.vsix

# Option 2: Build from source
cd mission-barisal/extension
npm install
npm run compile
npx @vscode/vsce package
# Install the generated .vsix file
```

### Extension Features

| Feature          | Description                                              | Command                                            |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------- |
| **Chat Panel**   | Custom webview with 6 agent status chips + SSE streaming | `ctrl+shift+p` → "Mission Barisal: Open Panel"     |
| **Copilot Chat** | 7 models available in VS Code Copilot Chat picker        | Select model from Copilot Chat dropdown            |
| **Agent Tree**   | Explorer view showing 6 agent statuses                   | View in Explorer sidebar                           |
| **Quick Ask**    | Ask a single question to agents                          | `ctrl+shift+p` → "Mission Barisal: Quick Ask"      |
| **MCP Tools**    | 9 MCP tools (read_file, web_search, etc.)                | `ctrl+shift+p` → "Mission Barisal: List Tools"     |
| **SSOT Scan**    | Auto-generate workspace knowledge                        | `ctrl+shift+p` → "Mission Barisal: Scan Workspace" |

### Available Copilot Chat Models

| Model ID           | Name                    | Description                                    |
| ------------------ | ----------------------- | ---------------------------------------------- |
| `mb-debate`        | **6-Agent Full Debate** | All 6 agents debate → cross-verify → consensus |
| `mb-code-guru`     | **Code Guru**           | Architecture analysis & system design expert   |
| `mb-bug-hunter`    | **Bug Hunter**          | Debugging & issue diagnosis expert             |
| `mb-security-hero` | **Security Hero**       | Security vulnerability analysis                |
| `mb-perf-wizard`   | **Perf Wizard**         | Performance optimization expert                |
| `mb-doc-king`      | **Doc King**            | Documentation & API spec expert                |
| `mb-qa-tyrant`     | **QA Tyrant**           | Quality assurance & edge case expert           |

---

## 🪟 Windows vs 🐧 Linux: Platform Guide

### Running the Server

| Aspect                 | Linux                                          | Windows                                              |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| **Command**            | `node z.js`                                    | `node z.js`                                          |
| **Background Process** | `nohup node z.js &` or `pm2 start z.js`        | Start as background process or use Windows Service   |
| **Auto-start**         | Systemd service                                | NSSM (Non-Sucking Service Manager)                   |
| **Port Permission**    | Use `sudo` or port forwarding for ports < 1024 | Admin prompt for ports < 1024                        |
| **File Paths**         | `/path/to/server/z.js`                         | `C:\path\to\server\z.js` (backslashes OK)            |
| **Line Endings**       | LF (`\n`) — handled by git                     | CRLF (`\r\n`) — set `git config core.autocrlf input` |

### Running the Extension

| Aspect             | Linux                      | Windows                           |
| ------------------ | -------------------------- | --------------------------------- |
| **Install**        | VSIX from Extensions panel | VSIX from Extensions panel        |
| **Build**          | `npm run compile`          | `npm run compile` (same)          |
| **Package**        | `npx @vscode/vsce package` | `npx @vscode/vsce package` (same) |
| **Terminal**       | Bash/Zsh                   | PowerShell/CMD/Git Bash           |
| **Path Separator** | `/`                        | `\` (VS Code handles both)        |

### Cross-Platform Notes

1. **Node.js** — The server is platform-agnostic. Same code runs on both OS.
2. **VS Code** — Extension works identically on both platforms.
3. **Line Endings** — Server uses `\n` in log output. Windows displays correctly in terminals.
4. **File Watching** — Currently no file-watching feature (future enhancement).
5. **Network** — On Windows, you may need to allow Node.js through Windows Firewall.

---

## 📡 API Reference

### REST Endpoints

| Endpoint               | Method | Description                                                    |
| ---------------------- | ------ | -------------------------------------------------------------- |
| `/health`              | GET    | Server health check (returns agent count, model count, uptime) |
| `/v1/chat/completions` | POST   | OpenAI-compatible chat completion                              |
| `/api/agents`          | GET    | List all 6 agents with status                                  |
| `/api/mission`         | POST   | Execute full 6-agent debate (SSE streaming)                    |

### MCP Endpoint

| Endpoint | Method | Description                |
| -------- | ------ | -------------------------- |
| `/mcp`   | POST   | JSON-RPC 2.0 MCP interface |

### MCP Tools (9 available)

| Tool              | Description                          |
| ----------------- | ------------------------------------ |
| `read_file`       | Read file contents from workspace    |
| `write_file`      | Write content to a file              |
| `set_working_dir` | Set working directory for operations |
| `get_working_dir` | Get current working directory        |
| `web_search`      | Search the web for information       |
| `agent_mission`   | Execute a full multi-agent mission   |
| `agent_single`    | Execute a single agent               |
| `get_memory`      | Read agent memory/state              |
| `read_ssot`       | Read Single Source of Truth document |

### SSE Events (`/api/mission`)

| Event           | Description                        |
| --------------- | ---------------------------------- |
| `mission_start` | Mission has begun with agent list  |
| `log`           | Log message from agent             |
| `agent_status`  | Agent status update (working/done) |
| `output`        | Agent output/response              |
| `progress`      | Progress percentage and phase      |
| `mission_done`  | Mission complete with stats        |

---

## 🔧 Configuration

### Server (`z.js`)

The server auto-configures from environment variables:

```bash
# Optional: Set port (default: 3000)
export PORT=3000
node z.js
```

### Extension (`package.json` → VS Code settings)

| Setting                        | Default                 | Description                |
| ------------------------------ | ----------------------- | -------------------------- |
| `mission-barisal.serverUrl`    | `http://localhost:3000` | Server URL                 |
| `mission-barisal.autoConnect`  | `true`                  | Auto-connect on startup    |
| `mission-barisal.pingInterval` | `30000`                 | Health check interval (ms) |

---

## 🧪 Testing

### Server Tests

```bash
cd server

# Integration tests
node test_integration.js

# Masking tests
node test_masking.js

# Manual health check
curl http://localhost:3000/health
curl http://localhost:3000/api/agents
```

### Extension Tests

```bash
cd extension
npm run compile    # TypeScript compilation check
```

---

## 📦 Deployment

### Production Server (Linux)

```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start server/z.js --name mission-barisal
pm2 save
pm2 startup

# Using systemd (manual)
sudo nano /etc/systemd/system/mission-barisal.service
```

**systemd service file:**

```ini
[Unit]
Description=Mission Barisal AI Agent Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/mission-barisal/server
ExecStart=/usr/bin/node /path/to/mission-barisal/server/z.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Production Server (Windows)

```powershell
# Using NSSM (Non-Sucking Service Manager)
nssm install MissionBarisal "C:\Program Files\nodejs\node.exe" "C:\path\to\server\z.js"
nssm start MissionBarisal
```

---

## 🔒 Security Notes

1. **No authentication** is built-in — use a reverse proxy (nginx, Caddy) for production
2. **Server runs on localhost:3000** by default — safe for local development
3. **No npm dependencies** — minimal supply chain risk
4. **Session data** is stored locally in `data/` directory (gitignored)
5. **API keys** for providers (opencode, groq, gemini) are passed via request body

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License — See `LICENSE` file for details.

---

## 👨‍💻 Developer

**Sahon Srabon (ZombieCoder)**  
📍 Dhaka, Bangladesh  
🐙 GitHub: [@zombiecoderbd](https://github.com/zombiecoderbd)

---

## 🙏 Acknowledgments

- **OpenCode** — Primary AI provider
- **Groq** — High-speed inference provider
- **Google Gemini** — Fallback provider
- **VS Code API** — LanguageModelChatProvider integration
