/**
 * Prints sample lists with an ANSI theme close to claude-code-dark:
 *   node test/preview.ts [--plain]
 */
import { parseList, renderTree, type ThemeLike } from "../extension/todos.ts";

const plain = process.argv.includes("--plain");

const COLORS: Record<string, string> = {
	dim: "\x1b[38;2;153;153;153m",
	borderAccent: "\x1b[38;2;215;119;87m",
};

const theme: ThemeLike = {
	fg: (c, t) => (plain ? t : `${COLORS[c] ?? ""}${t}\x1b[39m`),
	bold: (t) => (plain ? t : `\x1b[1m${t}\x1b[22m`),
	strikethrough: (t) => (plain ? t : `\x1b[9m${t}\x1b[29m`),
};

const samples: Record<string, unknown> = {
	flat: [
		{ content: "調査", status: "completed" },
		{ content: "実装", status: "in_progress" },
		{ content: "テスト", status: "pending" },
	],
	grouped: [
		{ content: "要件を確認", status: "completed", group: "準備" },
		{ content: "API を実装", status: "completed", group: "実装" },
		{ content: "UI を実装", status: "in_progress", group: "実装" },
		{ content: "結合する", status: "pending", group: "実装" },
		{ content: "テスト", status: "pending", group: "仕上げ" },
		{ content: "README を更新", status: "pending" },
	],
};

for (const [name, raw] of Object.entries(samples)) {
	const list = parseList(raw);
	if (typeof list === "string") throw new Error(list);
	console.log(`\x1b[2m── ${name} ──\x1b[0m\n`);
	for (const line of renderTree(list, theme)) console.log(` ${plain ? line.replace(/\x1b\[[0-9;]*m/g, "") : line}`);
	console.log("");
}
