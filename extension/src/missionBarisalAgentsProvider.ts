import * as vscode from "vscode";

// ─── Agent Data ───────────────────────────────────────────────
export interface AgentInfo {
  id: string;
  label: string;
  emoji: string;
  status: "idle" | "working" | "done" | "error";
  description: string;
}

const DEFAULT_AGENTS: AgentInfo[] = [
  {
    id: "code-guru",
    label: "Code Guru",
    emoji: "🧠",
    status: "idle",
    description: "Architecture & system design",
  },
  {
    id: "bug-hunter",
    label: "Bug Hunter",
    emoji: "🐛",
    status: "idle",
    description: "Debugging & diagnosis",
  },
  {
    id: "security-hero",
    label: "Security Hero",
    emoji: "🛡️",
    status: "idle",
    description: "Security analysis",
  },
  {
    id: "perf-wizard",
    label: "Perf Wizard",
    emoji: "⚡",
    status: "idle",
    description: "Performance optimization",
  },
  {
    id: "doc-king",
    label: "Doc King",
    emoji: "📖",
    status: "idle",
    description: "Documentation",
  },
  {
    id: "qa-tyrant",
    label: "QA Tyrant",
    emoji: "👑",
    status: "idle",
    description: "Code quality",
  },
];

// ─── Tree Item ────────────────────────────────────────────────
export class AgentTreeItem extends vscode.TreeItem {
  constructor(public readonly agent: AgentInfo) {
    super(agent.label, vscode.TreeItemCollapsibleState.None);

    this.id = agent.id;
    this.description = agent.description;

    // Set icon based on status
    switch (agent.status) {
      case "idle":
        this.iconPath = new vscode.ThemeIcon(
          "circle-outline",
          new vscode.ThemeColor("charts.foreground"),
        );
        break;
      case "working":
        this.iconPath = new vscode.ThemeIcon(
          "loading~spin",
          new vscode.ThemeColor("charts.blue"),
        );
        break;
      case "done":
        this.iconPath = new vscode.ThemeIcon(
          "pass-filled",
          new vscode.ThemeColor("charts.green"),
        );
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("charts.red"),
        );
        break;
    }

    // Tooltip
    this.tooltip = `${agent.emoji} ${agent.label}\n${agent.description}\nStatus: ${agent.status}`;

    // Context value for when clause
    this.contextValue = `agent-${agent.status}`;
  }
}

// ─── Tree Data Provider ──────────────────────────────────────
export class MissionBarisalAgentsProvider implements vscode.TreeDataProvider<AgentTreeItem> {
  private _agents: AgentInfo[] = [...DEFAULT_AGENTS];
  private _connected: boolean = false;
  private _serverInfo: string = "";

  private _onDidChangeTreeData: vscode.EventEmitter<
    AgentTreeItem | undefined | void
  > = new vscode.EventEmitter<AgentTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<AgentTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  // ─── Refresh ─────────────────────────────────────────────

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  // ─── Connection Status ───────────────────────────────────

  setConnected(connected: boolean, serverInfo: string = ""): void {
    this._connected = connected;
    this._serverInfo = serverInfo;
    this.refresh();
  }

  // ─── Agent Status Updates ────────────────────────────────

  setAgentStatus(agentId: string, status: AgentInfo["status"]): void {
    const agent = this._agents.find((a) => a.id === agentId);
    if (agent) {
      agent.status = status;
      this.refresh();
    }
  }

  resetAllAgents(): void {
    for (const agent of this._agents) {
      agent.status = "idle";
    }
    this.refresh();
  }

  getAgent(agentId: string): AgentInfo | undefined {
    return this._agents.find((a) => a.id === agentId);
  }

  getAllAgents(): AgentInfo[] {
    return [...this._agents];
  }

  // ─── TreeDataProvider Implementation ──────────────────────

  getTreeItem(element: AgentTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: AgentTreeItem): Thenable<AgentTreeItem[]> {
    const items: AgentTreeItem[] = [];

    if (!this._connected) {
      // Show status message when disconnected
      const statusItem = new vscode.TreeItem(
        "⚠️ Not connected",
        vscode.TreeItemCollapsibleState.None,
      );
      statusItem.description = "Run 'Connect to Server'";
      statusItem.iconPath = new vscode.ThemeIcon("plug");
      statusItem.contextValue = "disconnected";
      return Promise.resolve([statusItem as unknown as AgentTreeItem]);
    }

    // Add connection info as first item
    const connItem = new vscode.TreeItem(
      "● Connected",
      vscode.TreeItemCollapsibleState.None,
    );
    connItem.description = this._serverInfo || "localhost:3000";
    connItem.iconPath = new vscode.ThemeIcon("radio-tower");
    connItem.contextValue = "connected";
    items.push(connItem as unknown as AgentTreeItem);

    // Add agents
    for (const agent of this._agents) {
      items.push(new AgentTreeItem(agent));
    }

    // Add "All Agents" summary
    const idleCount = this._agents.filter((a) => a.status === "idle").length;
    const workingCount = this._agents.filter(
      (a) => a.status === "working",
    ).length;
    const doneCount = this._agents.filter((a) => a.status === "done").length;

    if (workingCount > 0 || doneCount > 0) {
      const summaryItem = new vscode.TreeItem(
        `📊 ${workingCount} working · ${doneCount} done · ${idleCount} idle`,
        vscode.TreeItemCollapsibleState.None,
      );
      summaryItem.description = "Agent activity";
      summaryItem.iconPath = new vscode.ThemeIcon("graph");
      summaryItem.contextValue = "summary";
      items.push(summaryItem as unknown as AgentTreeItem);
    }

    return Promise.resolve(items);
  }

  getParent?(element: AgentTreeItem): vscode.ProviderResult<AgentTreeItem> {
    return null;
  }

  // ─── Dispose ────────────────────────────────────────────

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
