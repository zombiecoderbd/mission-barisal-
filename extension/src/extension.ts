import * as vscode from "vscode";
import { MissionBarisalManager } from "./missionBarisalManager";
import { MissionBarisalPanel } from "./missionBarisalPanel";
import {
  MissionBarisalAgentsProvider,
  AgentInfo,
} from "./missionBarisalAgentsProvider";

let manager: MissionBarisalManager | undefined;
let panel: MissionBarisalPanel | undefined;
let agentsProvider: MissionBarisalAgentsProvider | undefined;

// ─── Language Model Chat Provider ─────────────────────────────
const AGENT_MODELS: vscode.LanguageModelChatInformation[] = [
  {
    id: "mb-debate",
    name: "6-Agent Full Debate",
    family: "mission-barisal",
    version: "1.0.0",
    detail: "All 6 agents debate, cross-verify, produce consensus",
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    capabilities: { toolCalling: true },
  },
  {
    id: "mb-code-guru",
    name: "Code Guru (Architecture)",
    family: "mission-barisal",
    version: "1.0.0",
    detail: "Architecture analysis & system design expert",
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    capabilities: { toolCalling: true },
  },
  {
    id: "mb-bug-hunter",
    name: "Bug Hunter (Debugging)",
    family: "mission-barisal",
    version: "1.0.0",
    detail: "Debugging & issue diagnosis expert",
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    capabilities: { toolCalling: true },
  },
  {
    id: "mb-security-hero",
    name: "Security Hero",
    family: "mission-barisal",
    version: "1.0.0",
    detail: "Security vulnerability analysis & penetration testing",
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    capabilities: { toolCalling: true },
  },
  {
    id: "mb-perf-wizard",
    name: "Perf Wizard",
    family: "mission-barisal",
    version: "1.0.0",
    detail: "Performance optimization & bottleneck detection",
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    capabilities: { toolCalling: true },
  },
  {
    id: "mb-doc-king",
    name: "Doc King",
    family: "mission-barisal",
    version: "1.0.0",
    detail: "Documentation & technical writing expert",
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    capabilities: { toolCalling: true },
  },
  {
    id: "mb-qa-tyrant",
    name: "QA Tyrant",
    family: "mission-barisal",
    version: "1.0.0",
    detail: "Code quality enforcement & best practices",
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    capabilities: { toolCalling: true },
  },
];
/** Maps our model IDs to the server's internal agent IDs */
const MODEL_TO_AGENT: Record<string, string> = {
  "mb-debate": "mission",
  "mb-code-guru": "code-guru",
  "mb-bug-hunter": "bug-hunter",
  "mb-security-hero": "security-hero",
  "mb-perf-wizard": "perf-wizard",
  "mb-doc-king": "doc-king",
  "mb-qa-tyrant": "qa-tyrant",
};

/** Convert LanguageModelChatRequestMessage content parts to a string */
function contentPartsToString(parts: readonly unknown[]): string {
  if (!parts || parts.length === 0) return "";
  return parts
    .map((part: any) => {
      if (typeof part === "string") return part;
      if (part?.text) return part.text;
      return JSON.stringify(part);
    })
    .join("\n");
}

class MissionBarisalChatProvider implements vscode.LanguageModelChatProvider {
  private _onDidChangeModels = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation: vscode.Event<void> =
    this._onDidChangeModels.event;

  async provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelChatInformation[]> {
    return AGENT_MODELS;
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Auto-connect if not connected
    if (!manager?.isConnected()) {
      try {
        const connected = await manager?.connect();
        if (!connected) {
          throw new Error("Mission Barisal: Could not connect to server.");
        }
      } catch (err: any) {
        throw new Error("Mission Barisal: Server not reachable. " + err.message);
      }
    }

    const serverModel = MODEL_TO_AGENT[model.id] || "mission";

    // Convert VS Code messages to OpenAI-compatible format
    const ROLE_MAP: Record<number, string> = {
      1: "user",
      2: "assistant",
      3: "system",
    };
    const openAIMessages = messages.map((m) => ({
      role: ROLE_MAP[m.role as number] || "user",
      content: contentPartsToString(m.content),
    }));

    // Convert VS Code tools to OpenAI-compatible format if provided
    let openAITools: any[] | undefined;
    if (options.tools && options.tools.length > 0) {
      openAITools = options.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description || "",
          parameters: (t as any).inputSchema || { type: "object", properties: {} },
        },
      }));
    }

    try {
      const response = await manager!.sendChatCompletions({
        model: serverModel,
        messages: openAIMessages,
        stream: false,
        ...(openAITools ? { tools: openAITools } : {}),
      });

      const content =
        response?.choices?.[0]?.message?.content || "No response generated.";

      // Stream the full response as a single text part
      progress.report(new vscode.LanguageModelTextPart(content));
    } catch (err: any) {
      throw new Error(`Mission Barisal: ${err.message}`);
    }
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    const content = typeof text === "string" ? text : text.content;
    // Approximate: ~4 chars per token for Bengali/English mixed
    return Math.ceil(content.length / 4);
  }

  /** Expose model change event for external firing */
  fireModelChange(): void {
    this._onDidChangeModels.fire();
  }
}

// ─── Activation ───────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
  console.log("[Mission Barisal] Activating extension...");

  // --- Status Bar Item ---
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(robot) Mission Barisal";
  statusBarItem.tooltip = "Mission Barisal — Click to open panel";
  statusBarItem.command = "mission-barisal.openPanel";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // --- Manager ---
  manager = new MissionBarisalManager(context);

  // --- Panel Provider ---
  panel = new MissionBarisalPanel(context, manager);

  // --- Register Language Model Chat Provider ---
  try {
    const chatProvider = new MissionBarisalChatProvider();
    const disposable = vscode.lm.registerLanguageModelChatProvider(
      "mission-barisal",
      chatProvider,
    );
    context.subscriptions.push(disposable);
    // Notify Copilot Chat that models are available
    setTimeout(() => {
      try { chatProvider.fireModelChange(); } catch(e) {}
    }, 100);
    console.log("[Mission Barisal] LanguageModelChatProvider registered ✓");
  } catch (err: any) {
    console.log(
      "[Mission Barisal] LanguageModelChatProvider not supported in this VS Code version:",
      err.message,
    );
  }

  // --- Register Agent Tree View ---
  agentsProvider = new MissionBarisalAgentsProvider();
  const treeView = vscode.window.createTreeView("mission-barisal-agents", {
    treeDataProvider: agentsProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);
  context.subscriptions.push(agentsProvider);
  console.log("[Mission Barisal] Agent TreeView registered ✓");

  // --- Register Commands ---
  const commands = [
    vscode.commands.registerCommand("mission-barisal.openPanel", () => {
      panel?.show();
    }),
    vscode.commands.registerCommand("mission-barisal.connect", async () => {
      const connected = await manager?.connect();
      if (connected) {
        agentsProvider?.setConnected(true, manager?.getServerUrl());
        vscode.window.showInformationMessage(
          "✓ Connected to Mission Barisal server",
        );
        // Auto-scan workspace for SSOT
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        if (wsFolder) {
          manager?.scanWorkspaceForSSOT(wsFolder.uri.fsPath);
        }
      }
    }),
    vscode.commands.registerCommand("mission-barisal.disconnect", () => {
      manager?.disconnect();
      agentsProvider?.setConnected(false);
      agentsProvider?.resetAllAgents();
      vscode.window.showInformationMessage(
        "✗ Disconnected from Mission Barisal server",
      );
    }),
    vscode.commands.registerCommand("mission-barisal.listTools", async () => {
      if (!manager?.isConnected()) {
        vscode.window.showErrorMessage("Not connected. Connect first.");
        return;
      }
      try {
        const tools = await manager.listTools();
        const items = tools.map((t: any) => ({
          label: t.name,
          description: t.description || "",
          detail: t.inputSchema ? JSON.stringify(t.inputSchema) : "",
        }));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: "Select a tool to see details",
          matchOnDescription: true,
        });
        if (picked) {
          vscode.window.showInformationMessage(
            `Tool: ${picked.label} — ${picked.description}`,
          );
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to list tools: ${err.message}`);
      }
    }),
    vscode.commands.registerCommand("mission-barisal.callTool", async () => {
      if (!manager?.isConnected()) {
        vscode.window.showErrorMessage("Not connected. Connect first.");
        return;
      }
      try {
        const tools = await manager.listTools();
        const toolNames = tools.map((t: any) => t.name);
        const toolName = await vscode.window.showQuickPick(toolNames, {
          placeHolder: "Select a tool to call",
        });
        if (!toolName) return;

        const argsStr = await vscode.window.showInputBox({
          placeHolder: 'Arguments as JSON object (e.g. {"input": "hello"})',
          validateInput: (value) => {
            try {
              if (value) JSON.parse(value);
              return null;
            } catch {
              return "Invalid JSON";
            }
          },
        });
        const args = argsStr ? JSON.parse(argsStr) : {};

        const result = await manager.callTool(toolName, args);
        const output = JSON.stringify(result, null, 2);
        const doc = await vscode.workspace.openTextDocument({
          content: output,
          language: "json",
        });
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Tool call failed: ${err.message}`);
      }
    }),
    vscode.commands.registerCommand("mission-barisal.quickAsk", async () => {
      if (!manager?.isConnected()) {
        vscode.window.showErrorMessage("Not connected. Connect first.");
        return;
      }
      const query = await vscode.window.showInputBox({
        placeHolder: "Ask a question to the agents...",
        prompt: "Quick Ask — single agent response",
      });
      if (!query) return;

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Mission Barisal: Processing...",
          cancellable: false,
        },
        async () => {
          try {
            const result = await manager?.sendChatMessage(query);
            const combined =
              result?.choices?.[0]?.message?.content || "No response";
            const doc = await vscode.workspace.openTextDocument({
              content: combined,
              language: "markdown",
            });
            await vscode.window.showTextDocument(doc);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Quick ask failed: ${err.message}`);
          }
        },
      );
    }),
    // --- New: SSOT Scan Command ---
    vscode.commands.registerCommand(
      "mission-barisal.scanWorkspace",
      async () => {
        if (!manager?.isConnected()) {
          vscode.window.showErrorMessage("Not connected. Connect first.");
          return;
        }
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        if (!wsFolder) {
          vscode.window.showErrorMessage("No workspace folder open.");
          return;
        }
        const result = await manager?.scanWorkspaceForSSOT(wsFolder.uri.fsPath);
        vscode.window.showInformationMessage(
          `SSOT generated: ${result?.ssot || "done"}`,
        );
      },
    ),
    // --- Diagnostic: Test Provider Registration ---
    vscode.commands.registerCommand(
      "mission-barisal.diagnostics",
      async () => {
        const info: string[] = [];
        info.push("🔍 Mission Barisal Diagnostics");
        info.push("═══════════════════════════════");
        info.push(`Server connected: ${manager?.isConnected() ? "✅" : "❌"}`);
        info.push(`Server URL: ${manager?.getServerUrl() || "N/A"}`);
        
        // Check if LM provider API exists
        try {
          const hasAPI = typeof vscode.lm.registerLanguageModelChatProvider !== 'undefined';
          info.push(`LM Provider API: ${hasAPI ? "✅" : "❌"}`);
        } catch (e: any) {
          info.push(`LM Provider API: ❌ (${e.message})`);
        }
        
        // Try to send a test message
        if (manager?.isConnected()) {
          try {
            const result = await manager.sendChatCompletions({
              model: "mission",
              messages: [{ role: "user", content: "ping" }],
              stream: false,
            });
            const ok = result?.choices?.[0]?.message?.content ? "✅" : "❌";
            info.push(`Server response: ${ok}`);
          } catch (e: any) {
            info.push(`Server response: ❌ (${e.message})`);
          }
        }
        
        const report = info.join("\n");
        const doc = await vscode.workspace.openTextDocument({
          content: report,
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc);
      },
    ),
  ];

  for (const cmd of commands) {
    context.subscriptions.push(cmd);
  }

  // --- Set Context Key ---
  vscode.commands.executeCommand(
    "setContext",
    "mission-barisal.connected",
    false,
  );

  // --- Auto-connect ---
  const config = vscode.workspace.getConfiguration("mission-barisal");
  if (config.get<boolean>("autoConnect", true)) {
    setTimeout(async () => {
      const ok = await manager?.connect();
      if (ok) {
        agentsProvider?.setConnected(true, manager?.getServerUrl());
        vscode.commands.executeCommand(
          "setContext",
          "mission-barisal.connected",
          true,
        );
        statusBarItem.text = "$(robot) Mission Barisal ✓";

        // Auto-scan workspace for SSOT
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        if (wsFolder) {
          manager?.scanWorkspaceForSSOT(wsFolder.uri.fsPath);
        }
      } else {
        statusBarItem.text = "$(robot) Mission Barisal ✗";
      }
    }, 1000);
  }

  console.log("[Mission Barisal] Extension activated successfully.");
}

export function deactivate(): void {
  console.log("[Mission Barisal] Deactivating extension...");
  manager?.disconnect();
  panel?.dispose();
}
