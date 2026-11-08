/**
 * Runs the extension in a real pi AgentSession with a scripted faux model:
 * the model calls set_todos, and the widget, prompt section and branch
 * restore are checked.
 *
 *   node test/integration.ts <path-to>/node_modules/@earendil-works/pi-coding-agent
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const piRoot = process.argv[2];
if (!piRoot) {
	console.error("usage: node test/integration.ts <pi-coding-agent package dir>");
	process.exit(2);
}
const pi = await import(pathToFileURL(join(piRoot, "dist/index.js")).href);
const ai = await import(pathToFileURL(join(piRoot, "../pi-ai/dist/index.js")).href);
const tui = await import(pathToFileURL(join(piRoot, "../pi-tui/dist/index.js")).href);
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

// Stand-in theme that only accepts real theme tokens
const TOKENS = new Set(["accent", "borderAccent", "success", "dim", "muted", "text", "toolTitle", "error"]);
assert.equal(typeof pi.Theme.prototype.strikethrough, "function");
const theme = {
	fg: (color: string, text: string) => {
		assert.ok(TOKENS.has(color), `unknown theme color ${color}`);
		return `\x1b[3${color.length % 7}m${text}\x1b[39m`;
	},
	bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
	strikethrough: (text: string) => `\x1b[9m${text}\x1b[29m`,
};
const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-"));
const cwd = mkdtempSync(join(tmpdir(), "pi-cwd-"));

const faux = ai.fauxProvider({ provider: "faux", models: [{ id: "faux-1" }] });
const seen: string[] = [];
const step = (todos: unknown[]) => (context: { systemPrompt?: string; messages: unknown[] }) => {
	seen.push(JSON.stringify(context));
	return ai.fauxAssistantMessage(ai.fauxToolCall("set_todos", { todos }), { stopReason: "toolUse" });
};
faux.setResponses([
	step([
		{ content: "調査", status: "completed" },
		{ content: "実装", status: "in_progress", group: "本体" },
		{ content: "テスト", status: "pending", group: "本体" },
	]),
	(context: unknown) => {
		seen.push(JSON.stringify(context));
		return ai.fauxAssistantMessage("done");
	},
]);

const resourceLoader = new pi.DefaultResourceLoader({
	cwd,
	agentDir,
	noExtensions: true,
	additionalExtensionPaths: [resolve(import.meta.dirname, "../extension/index.ts")],
	extensionFactories: [(api: { registerProvider(p: unknown): void }) => api.registerProvider(faux.provider)],
});
await resourceLoader.reload();
const { session } = await pi.createAgentSession({
	cwd,
	agentDir,
	resourceLoader,
	sessionManager: pi.SessionManager.inMemory(cwd),
	settingsManager: pi.SettingsManager.inMemory({}),
});

const widgets = new Map<string, unknown>();
const ui = new Proxy(
	{
		setWidget: (key: string, content: unknown) => (content === undefined ? widgets.delete(key) : widgets.set(key, content)),
		theme,
	},
	{ get: (target, prop) => (prop in target ? Reflect.get(target, prop) : () => undefined) },
);
await session.bindExtensions({ uiContext: ui, mode: "tui" });
await session.setModel(faux.getModel());

const drawWidget = (width: number) => {
	const factory = widgets.get("claude-todo") as ((tui: unknown, theme: unknown) => { render(w: number): string[] }) | undefined;
	return factory ? factory({}, theme).render(width).map(strip) : [];
};

await session.prompt("実装して");

assert.ok(seen[0]?.includes("todo_tree"), "system prompt has the todo_tree section");
const lines = drawWidget(60);
for (const line of lines) console.log(line);
assert.deepEqual(lines, [
	" TODO · 1/3",
	" ├─ ☑︎ 調査",
	" └─ 本体 · 0/2",
	"    ├─ ▶︎ 実装",
	"    └─ ☐ テスト",
]);
assert.ok(drawWidget(8).every((l) => tui.visibleWidth(l) <= 8), "lines fit the width");

// Restoring the branch rebuilds the same list
widgets.clear();
await session.extensionRunner.emit({ type: "session_tree" });
assert.deepEqual(drawWidget(60), lines);

// Completing everything hides the widget
faux.setResponses([
	step([
		{ content: "調査", status: "completed" },
		{ content: "実装", status: "completed", group: "本体" },
		{ content: "テスト", status: "completed", group: "本体" },
	]),
	ai.fauxAssistantMessage("done"),
]);
await session.prompt("続けて");
assert.equal(widgets.has("claude-todo"), false);

session.dispose();
console.log("\nOK");
