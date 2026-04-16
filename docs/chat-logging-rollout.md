# 会話ログ基盤の横展開手順

## 目的

他メンバーの環境でも、以下を同じ構成で使えるようにします。

- Cursorフックによる会話ログ記録（自動）
- 日次レポート生成（手動/定期実行）

## 0. 共有の考え方（重要）

この仕組みは「このリポジトリのファイル」を使って展開します。  
そのため、**GitHubでこのリポジトリを共有**し、各メンバーが同じスクリプトを実行する運用が一番安全です。

## 1. セットアップ実行（他メンバー側）

共有されたリポジトリ直下で、次を実行します。

```bash
python3 scripts/setup_chat_logging.py --target "/対象プロジェクトの絶対パス"
```

実行後、対象プロジェクトに以下が作成/更新されます。

- `.cursor/hooks.json`（既存があっても壊さず追記）
- `.cursor/hooks/chat_timestamp_logger.py`
- `scripts/daily_report.py`
- `logs/chat_events/`
- `reports/`

## 2. 動作確認

1. Cursorを再起動（必要時のみ）
2. 対象プロジェクトで1往復会話する
3. 日報生成を実行する

```bash
cd "/対象プロジェクトの絶対パス"
python3 scripts/daily_report.py --date YYYY-MM-DD
```

## 3. AIにセットアップを依頼するテンプレート

以下をそのままCursor AIへ依頼すれば、導入から確認まで実施できます。

```text
このプロジェクトに会話ログ基盤を導入してください。
このリポジトリ直下で、次を実行してセットアップと確認までお願いします。

python3 scripts/setup_chat_logging.py --target "<このプロジェクトの絶対パス>"

確認内容:
- .cursor/hooks.json に beforeSubmitPrompt / afterAgentResponse が入っていること
- logs/chat_events/YYYY-MM-DD.jsonl にログが出ること
- python3 scripts/daily_report.py --date YYYY-MM-DD で reports/daily_YYYY-MM-DD.md が出ること
```

## 4. GitHubでの共有手順（初心者向け）

### 4-1. あなた（作成者）がやること

```bash
cd "/このリポジトリのパス"
git checkout -b feat/chat-logging-rollout
git add scripts/setup_chat_logging.py scripts/daily_report.py .cursor/hooks.json .cursor/hooks/chat_timestamp_logger.py docs/chat-logging-rollout.md
git commit -m "Add reusable Cursor chat logging rollout and daily report setup"
git push -u origin feat/chat-logging-rollout
```

その後、GitHub上でPull Requestを作成してレビュー・マージします。

### 4-2. 他メンバーがやること

1. リポジトリを取得（clone済みなら `git pull`）
2. 手順書を開く（`docs/chat-logging-rollout.md`）
3. セットアップコマンドを実行

## 5. よくあるつまずき

- `python3: command not found`  
  - Python 3をインストールする（`python --version` ではなく `python3 --version` を確認）
- フックが反映されない  
  - Cursor再起動
- ログが増えない  
  - 対象プロジェクト配下の `.cursor/hooks.json` を確認

## 補足

- 既存の `hooks.json` があっても、同じコマンド重複は追加しない仕様です。
- 出力は日別ファイルです（`logs/chat_events/YYYY-MM-DD.jsonl`）。
