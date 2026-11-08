import assert from "node:assert/strict";
import { test } from "node:test";
import { activeGroup, isVisible, parseList, renderTree, type ThemeLike, toTree } from "../extension/todos.ts";

const plain: ThemeLike = { fg: (_c, t) => t, bold: (t) => t, strikethrough: (t) => t };
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const draw = (raw: unknown) => {
	const list = parseList(raw);
	assert.ok(typeof list !== "string", String(list));
	return renderTree(list, plain).map(strip);
};

test("flat list draws like claude-todo-tree", () => {
	assert.deepEqual(
		draw([
			{ content: "調査", status: "completed" },
			{ content: "実装", status: "in_progress" },
			{ content: "テスト", status: "pending" },
		]),
		["TODO · 1/3", "├─ ☑︎ 調査", "├─ ▶︎ 実装", "└─ ☐ テスト"],
	);
});

test("only the active group is expanded", () => {
	assert.deepEqual(
		draw([
			{ content: "a", status: "completed", group: "準備" },
			{ content: "b", status: "in_progress", group: "実装" },
			{ content: "c", status: "pending", group: "実装" },
			{ content: "d", status: "pending", group: "仕上げ" },
		]),
		["TODO · 1/4", "├─ 準備 · 1/1", "├─ 実装 · 0/2", "│  ├─ ▶︎ b", "│  └─ ☐ c", "└─ 仕上げ · 0/1"],
	);
});

test("last group indents its children with spaces", () => {
	assert.deepEqual(draw([{ content: "x", status: "pending" }, { content: "y", status: "pending", group: "G" }]), [
		"TODO · 0/2",
		"├─ ☐ x",
		"└─ G · 0/1",
		"   └─ ☐ y",
	]);
});

test("without in_progress the first unfinished group opens", () => {
	const list = parseList([
		{ content: "a", status: "completed", group: "A" },
		{ content: "b", status: "pending", group: "B" },
	]);
	assert.ok(typeof list !== "string");
	assert.equal(activeGroup(toTree(list)), "B");
});

test("hidden when empty or all completed", () => {
	assert.equal(isVisible([]), false);
	assert.equal(isVisible([{ text: "a", status: "completed" }]), false);
	assert.equal(isVisible([{ text: "a", status: "pending" }]), true);
});

test("invalid input returns a reason", () => {
	assert.equal(typeof parseList("x"), "string");
	assert.match(String(parseList([{ content: "a", status: "done" }])), /todos\[0\]/);
	assert.match(String(parseList([{ content: "a", status: "pending", group: 1 }])), /group/);
});
