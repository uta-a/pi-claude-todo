/**
 * Pure TODO logic and tree rendering, kept free of pi imports so it can be
 * tested with plain `node --test`.
 */

export const STATUSES = ["pending", "in_progress", "completed"] as const;
export type Status = (typeof STATUSES)[number];

export interface Todo {
	text: string;
	status: Status;
	/** Parent heading from set_todos; items sharing one are drawn as two levels. */
	group?: string;
}

export interface ThemeLike {
	fg(color: string, text: string): string;
	bold(text: string): string;
	strikethrough(text: string): string;
}

// U+FE0E keeps the marks as text instead of emoji
export const MARK = { pending: "☐", in_progress: "▶︎", completed: "☑︎" } as const;

/** Validates set_todos input into Todo[]; returns the reason when it is invalid. */
export function parseList(raw: unknown): Todo[] | string {
	if (!Array.isArray(raw)) return "todos must be an array";
	const list: Todo[] = [];
	for (const [i, t] of raw.entries()) {
		const { content, status, group } = (t ?? {}) as { content?: unknown; status?: unknown; group?: unknown };
		if (typeof content !== "string" || !STATUSES.includes(status as Status)) {
			return `todos[${i}] needs a string content and a status of ${STATUSES.join(", ")}`;
		}
		if (group !== undefined && typeof group !== "string") return `todos[${i}].group must be a string`;
		list.push(group ? { text: content, status: status as Status, group } : { text: content, status: status as Status });
	}
	return list;
}

export const countDone = (list: readonly Todo[]) => list.filter((t) => t.status === "completed").length;

/** The widget is shown only while something is left to do. */
export const isVisible = (list: readonly Todo[]) => list.length > 0 && countDone(list) < list.length;

type Node = { kind: "item"; todo: Todo } | { kind: "group"; name: string; items: Todo[] };

/** Gathers items with a group under one parent, placed where the group first appears. */
export function toTree(list: readonly Todo[]): Node[] {
	const nodes: Node[] = [];
	const groups = new Map<string, Todo[]>();
	for (const todo of list) {
		if (todo.group === undefined) {
			nodes.push({ kind: "item", todo });
			continue;
		}
		const items = groups.get(todo.group);
		if (items) {
			items.push(todo);
		} else {
			const created = [todo];
			groups.set(todo.group, created);
			nodes.push({ kind: "group", name: todo.group, items: created });
		}
	}
	return nodes;
}

/** The group whose children are expanded: the one in progress, else the first unfinished one. */
export function activeGroup(nodes: readonly Node[]): string | undefined {
	const groups = nodes.flatMap((n) => (n.kind === "group" ? [n] : []));
	return (
		groups.find((g) => g.items.some((t) => t.status === "in_progress")) ??
		groups.find((g) => g.items.some((t) => t.status !== "completed"))
	)?.name;
}

/**
 * Draws the list the way claude-todo-tree does:
 *
 *   TODO · 1/3
 *   ├─ ☑︎ 調査
 *   ├─ ▶︎ 実装
 *   └─ ☐ テスト
 */
export function renderTree(list: readonly Todo[], theme: ThemeLike): string[] {
	const done = (text: string) => theme.fg("dim", theme.strikethrough(text));
	const active = (text: string) => theme.fg("borderAccent", theme.bold(text));
	const muted = (text: string) => theme.fg("dim", text);

	const label = (t: Todo) =>
		t.status === "completed"
			? done(`${MARK.completed} ${t.text}`)
			: t.status === "in_progress"
				? active(`${MARK.in_progress} ${t.text}`)
				: `${MARK.pending} ${t.text}`;

	const nodes = toTree(list);
	const open = activeGroup(nodes);
	const lines = [`${theme.bold("TODO")} ${muted(`· ${countDone(list)}/${list.length}`)}`];

	nodes.forEach((n, i) => {
		const last = i === nodes.length - 1;
		const branch = muted(last ? "└─ " : "├─ ");
		if (n.kind === "item") {
			lines.push(branch + label(n.todo));
			return;
		}
		const groupDone = countDone(n.items);
		const name =
			groupDone === n.items.length ? done(n.name) : n.name === open ? active(n.name) : n.name;
		lines.push(`${branch}${name}${muted(` · ${groupDone}/${n.items.length}`)}`);
		if (n.name !== open) return;
		n.items.forEach((t, j) => {
			const stem = (last ? "   " : "│  ") + (j === n.items.length - 1 ? "└─ " : "├─ ");
			lines.push(muted(stem) + label(t));
		});
	});
	return lines;
}
