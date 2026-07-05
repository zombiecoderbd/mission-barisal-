# Mission Barisal v3 — Server API Reference

> **Version:** 3.0.0
> **Owner:** Sahon Srabon · Developer Zone · Dhaka, Bangladesh

---

## Overview

Mission Barisal v3 — zero-dependency multi-agent AI platform (pure Node.js).

- 6 Specialist Agents
- Multi-Provider Support
- Competition Router
- Anti-Dote Type Safety
- Session & Memory System
- MCP JSON-RPC 2.0

---

## Endpoints

### Health & Identity

#### `GET /health`

```json
{
  "healthy": true,
  "version": "3.0.0",
  "agents": 6,
  "models": 14,
  "uptime": 3600,
  "session_count": 47
}
```

#### `GET /identity`

```json
{
  "system_identity": {
    "name": "ZombieCoder",
    "version": "1.0.0",
    "tagline": "যেখানে কোড ও কথা বলে"
  }
}
```

---

### Model Listing

#### `GET /v1/models`

List available agents.

```json
{
  "object": "list",
  "data": [
    { "id": "mission" },
    { "id": "code-guru" },
    { "id": "bug-hunter" },
    { "id": "security-hero" },
    { "id": "perf-wizard" },
    { "id": "doc-king" },
    { "id": "qa-tyrant" }
  ]
}
```

#### `GET /api/agents`

```json
{
  "count": 6,
  "agents": [
    { "id": "code-guru", "name": "কোড গুরু - মনু", "role": "architecture" },
    { "id": "bug-hunter", "name": "বাগ হান্টার - জারিন", "role": "debugging" }
  ]
}
```

---

### Chat Completions

#### `POST /v1/chat/completions`

```json
{
  "model": "code-guru",
  "messages": [
    { "role": "user", "content": "আপনার বার্তা" }
  ],
  "stream": false
}
```

**Model Options:** `mission`, `code-guru`, `bug-hunter`, `security-hero`, `perf-wizard`, `doc-king`, `qa-tyrant`

---

### Mission (Multi-Agent)

#### `POST /api/mission`

```json
{
  "input": "আপনার প্রশ্ন",
  "max_agents": 6
}
```

---

### Runtime Configuration

#### `GET /api/config`

```json
{
  "config": {
    "logLevel": "INFO",
    "antiDoteEnabled": true
  }
}
```

#### `POST /api/config`

```json
{
  "logLevel": "DEBUG"
}
```

---

### MCP

#### `POST /mcp`

JSON-RPC 2.0 endpoint.

#### `GET /api/mcp-clients`

```json
{
  "total_requests": 150,
  "active_connections": 2,
  "tools": 8
}
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| PORT | 3000 | Server port |
| PERSONAS_FILE | ./PERSONAS.md | Agent personas |
| DATA_DIR | ./data | Session data |
| LOG_DIR | ./logs | Logs |
| CACHE_DIR | ./cache | Cache |
| SSOT_DIR | ./.zombiecoder | SSOT |

---

**Owner:** Sahon Srabon · Developer Zone · Dhaka, Bangladesh
