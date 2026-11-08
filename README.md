# pi-claude-todo

[claude-todo-tree](https://github.com/uta-a/claude-todo-tree) と同じ TODO のツリー表示を、pi の入力欄の上に出す pi 拡張です。

```
TODO · 1/3
├─ ☑︎ 調査
├─ ▶︎ 実装
└─ ☐ テスト
```

グループを付けた場合（作業中のグループだけ子を展開）

```
TODO · 2/6
├─ 準備 · 1/1
├─ 実装 · 1/3
│  ├─ ☑︎ API を実装
│  ├─ ▶︎ UI を実装
│  └─ ☐ 結合する
├─ 仕上げ · 0/1
└─ ☐ README を更新
```

- `set_todos` ツールを追加する。モデルは毎回リスト全体を渡して置き換える
- 入力欄の上のウィジェットにツリーを描く。完了は緑の打ち消し線、作業中はアクセント色の太字
- `group` が同じ項目は親の見出しの下にまとめ、作業中の親（なければ最初の未完了の親）だけ子を展開する
- 複数ステップの実装を始めるときにモデルが自分から `set_todos` を呼ぶよう、システムプロンプトに `<todo_tree>` セクションを足す（pi-claude-bridge 経由でも届く経路）
- TODO はツール結果の `details` に保存するので、resume・fork・`/tree` で今のブランチの状態に戻る
- すべて完了するか、リストが空になると表示を消す
- pi-subagents の子プロセス（`PI_SUBAGENT_CHILD` / `PI_SUBAGENT_PARENT_SESSION`）では何もしない

会話中のツール行は `Update Todos · 1/3` の 1 行で、展開（ctrl+o）するとツリーを出します。

## インストール

```bash
pi install git:github.com/uta-a/pi-claude-todo
```

バージョンを固定する場合は `pi install git:github.com/uta-a/pi-claude-todo@v0.1.0`。更新は `pi update --extensions`。

一度だけ試す場合は、clone して `pi -e ./extension/index.ts`。

## 開発

```bash
npm test                     # node --test（Node 22.6+ の型ストリップで実行）
npm run preview              # サンプルを端末に描画
node test/integration.ts ~/.pi/agent/install/releases/<ver>/node_modules/@earendil-works/pi-coding-agent
                             # pi の AgentSession と faux モデルで、ツール呼び出し・ウィジェット・
                             # プロンプトセクション・ブランチ復元・完了時の非表示を検証
```
