/**
 * pi-claude-todo — shows the TODO list above the editor as a tree, the way
 * claude-todo-tree (https://github.com/uta-a/claude-todo-tree) does in
 * Claude Code.
 *
 * - Registers a `set_todos` tool that replaces the whole list
 * - Draws it in an above-editor widget and hides it once everything is done
 * - Items with a `group` are shown under one parent; only the active parent expands
 * - Adds a system prompt section asking the model to keep the list current
 * - State lives in the tool result details, so resume, fork and /tree restore it
 * - Does nothing inside pi-subagents children
 */
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { countDone, isVisible, parseList, renderTree, STATUSES, type ThemeLike, type Todo } from "./todos.ts";

const TOOL_NAME = "set_todos";
const WIDGET_KEY = "claude-todo";
const SECTION = "todo_tree";

const GUIDANCE = `When you start implementation work of more than one step in the main conversation, call ${TOOL_NAME} before your first edit, listing the steps. Use it in preference to any other TODO tool. Group the steps with group when they fall into phases. Call it again whenever a step starts or finishes, so the list stays current. Mark as in_progress only the step you are working on right now, which is normally exactly one: when you write several steps in one go, still mark them one at a time, and leave the rest pending. Mark several only while they really run at the same time, such as parallel subagents. Skip it for questions, research, and single small edits. Subagents do not call it.`;

interface TodoDetails {
	todos: Todo[];
}

const params = Type.Object({
	todos: Type.Array(
		Type.Object({
			content: Type.String(),
			status: StringEnum(STATUSES),
			group: Type.Optional(Type.String()),
		}),
	),
});

const isSubagentChild = () => process.env.PI_SUBAGENT_CHILD === "1" || Boolean(process.env.PI_SUBAGENT_PARENT_SESSION);

/** Above-editor component; reads the list on every render so theme changes apply. */
class TodoWidget {
	constructor(
		private readonly getList: () => readonly Todo[],
		private readonly theme: ThemeLike,
	) {}

	render(width: number): string[] {
		const list = this.getList();
		if (!isVisible(list)) return [];
		return renderTree(list, this.theme).map((line) => truncateToWidth(` ${line}`, width));
	}

	invalidate(): void {}
}

export default function (pi: ExtensionAPI) {
	if (isSubagentChild()) return;

	let todos: Todo[] = [];
	let shown = false;

	const refresh = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		const visible = isVisible(todos);
		if (visible && !shown) {
			ctx.ui.setWidget(WIDGET_KEY, (_tui, theme) => new TodoWidget(() => todos, theme as ThemeLike));
		} else if (!visible && shown) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		}
		shown = visible;
	};

	// Replays set_todos results on the current branch
	const reconstruct = (ctx: ExtensionContext) => {
		todos = [];
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (msg.role !== "toolResult" || msg.toolName !== TOOL_NAME || msg.isError) continue;
			const details = msg.details as TodoDetails | undefined;
			if (Array.isArray(details?.todos)) todos = details.todos;
		}
		// Extension UI is reset on session replacement, so draw again from scratch
		shown = false;
		refresh(ctx);
	};

	pi.on("session_start", async (_event, ctx) => reconstruct(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstruct(ctx));

	pi.on("before_agent_start", async (event) => {
		const options = event.systemPromptOptions;
		if (options.selectedTools.includes(TOOL_NAME)) options.sections[SECTION] = GUIDANCE;
		else delete options.sections[SECTION];
	});

	pi.registerTool({
		name: TOOL_NAME,
		label: "Update Todos",
		description:
			"Replace the TODO list shown above the prompt. Pass the whole list every time, with the current status of every item. Only a step being worked on right now is in_progress, normally exactly one. Give items the same group to show them under one parent heading; only the group being worked on is expanded.",
		promptSnippet: "Show and update the TODO list above the prompt",
		parameters: params,
		executionMode: "sequential",

		async execute(_toolCallId, input, _signal, _onUpdate, ctx) {
			const list = parseList(input.todos);
			if (typeof list === "string") throw new Error(list);
			todos = list;
			refresh(ctx);
			return {
				content: [{ type: "text", text: `TODO updated: ${countDone(list)}/${list.length} completed` }],
				details: { todos: list } as TodoDetails,
			};
		},

		renderCall(args, theme) {
			const list = parseList((args as { todos?: unknown } | undefined)?.todos);
			const count = typeof list === "string" ? "" : theme.fg("dim", ` · ${countDone(list)}/${list.length}`);
			return new Text(theme.fg("toolTitle", theme.bold("Update Todos")) + count, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as TodoDetails | undefined;
			if (!expanded || !details?.todos?.length) return new Text("", 0, 0);
			return new Text(renderTree(details.todos, theme as ThemeLike).slice(1).join("\n"), 0, 0);
		},
	});
}
