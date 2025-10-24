# Discord Elysion Bot

TypeScriptで構築されたDiscordボット。独自のサーバー内通貨「Ru_men」システムと、シークレットボイスチャンネル作成機能を提供します。

## 🌟 主要機能

### 💰 Ru_men通貨システム
- **初期所持金**: 10,000 Ru
- **残高確認**: `/balance` コマンド
- **送金機能**: `/transfer` コマンド（確認画面付き）
- **取引履歴**: `/history` コマンド
- **管理者機能**: `/give` コマンド（管理者による通貨付与）

### 💼 給与システム
- **月給制**: `/salary` コマンド（管理者が手動支給）
- **ロール別月給設定**:
  - 👑 admin: 30,000 Ru/月（デフォルト）
  - 🛡️ moderator: 20,000 Ru/月（デフォルト）
  - ⭐ vip: 15,000 Ru/月（デフォルト）
  - 💎 premium: 10,000 Ru/月（デフォルト）
  - 🏃 active: 7,500 Ru/月（デフォルト）
  - 👤 member: 5,000 Ru/月（デフォルト）
  - 🌱 newcomer: 2,500 Ru/月（デフォルト）
- **給与履歴**: `/salary-history` コマンド
- **給与設定**: `/salary-config` コマンド（管理者専用）

### 🎪 シークレットVC機能
- **作成費用**: 500 Ru
- **利用制限**: 最大2人まで参加可能
- **自動削除**: 5分間無人で自動削除
- **管理機能**: 
  - ボタンでチャンネル名変更
  - ユーザー招待機能
  - 手動削除機能

### � セキュリティ機能
- レート制限（送金: 3回/分）
- 入力値検証
- 管理者権限チェック
- セキュリティログ記録

## 📋 前提条件

- Node.js 16.9.0以上
- npm または yarn
- Discord Developer Portalでのアプリケーション作成

## 🛠️ セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example`を`.env`にコピーして、必要な値を設定してください：

```bash
cp .env.example .env
```

`.env`ファイルを編集：

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here_optional
NODE_ENV=development
```

### 3. Discord Botの作成手順

1. [Discord Developer Portal](https://discord.com/developers/applications)にアクセス
2. 「New Application」をクリックして新しいアプリケーションを作成
3. 左側メニューから「Bot」を選択
4. 「Add Bot」をクリック
5. 「Token」をコピーして`.env`ファイルの`DISCORD_TOKEN`に設定
6. 「General Information」タブから「Application ID」をコピーして`DISCORD_CLIENT_ID`に設定

### 4. ボットの招待

必要な権限を付与してボットをサーバーに招待：

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8589934608&scope=bot%20applications.commands
```

`YOUR_CLIENT_ID`を実際のクライアントIDに置き換えてください。

**必要な権限**:
- `Manage Channels` (チャンネル管理)
- `Send Messages` (メッセージ送信)
- `Use Slash Commands` (スラッシュコマンド使用)
- `Connect` (ボイスチャンネル接続)
- `Speak` (ボイスチャンネル発言)

## 🎮 使用方法

### 💰 通貨システムコマンド

#### `/balance`
自分のRu_men残高を確認します。
```
/balance
```

#### `/transfer`
他のユーザーにRu_menを送金します。確認画面が表示されます。
```
/transfer user:@ユーザー名 amount:1000 message:ありがとう
```

#### `/history`
自分の取引履歴を確認します。
```
/history limit:10
```

#### `/give` (管理者限定)
指定したユーザーにRu_menを付与します。
```
/give user:@ユーザー名 amount:5000 reason:イベント参加賞
```

### 💼 月給システムコマンド

#### `/salary` (管理者専用)
対象ユーザーに月給を支給します。
```
/salary user:@ユーザー名 role:admin amount:30000 description:月末支給
/salary user:@ユーザー名 role:member  # ロール規定額で支給
/salary user:@ユーザー名  # ユーザーのロールを自動判定して支給
```
- 管理者のみ実行可能
- 月1回まで支給可能（同月内の重複支給は不可）
- ロール・金額の指定が可能
- 確認画面でボタンクリックにより実行

#### `/salary-history`
月給受取履歴を確認します。
```
/salary-history user:@ユーザー名 limit:12  # 管理者は他ユーザーの履歴確認可能
/salary-history limit:6  # 自分の履歴のみ
```

#### `/salary-config` (管理者専用)
月給ロール設定を管理します。
```
/salary-config list  # 設定一覧表示
/salary-config set role:admin amount:35000 description:管理者月給
/salary-config add role:special amount:25000 description:特別ロール
/salary-config toggle role:vip  # ロールの有効/無効切り替え
```

### 🎪 シークレットVC機能

#### `/create-vc`
500 RuでシークレットVCを作成します。
```
/create-vc name:プライベートルーム
```

**機能**:
- 最大2人まで参加可能
- 5分間無人で自動削除
- 作成者のみアクセス権限設定可能
- ボタンによる管理機能：
  - 🖊️ チャンネル名変更
  - 👥 ユーザー招待
  - 🗑️ VC削除

## 📁 プロジェクト構造

```
discord-elysion-bot/
├── src/
│   ├── commands/          # スラッシュコマンド
│   │   ├── balance.ts     # 残高確認コマンド
│   │   ├── transfer.ts    # 送金コマンド
│   │   ├── history.ts     # 取引履歴コマンド
│   │   ├── give.ts        # 管理者付与コマンド
│   │   ├── create-vc.ts   # VC作成コマンド
│   │   └── ping.ts        # 接続テストコマンド
│   ├── events/            # Discordイベント
│   │   ├── ready.ts       # Bot起動時イベント
│   │   ├── buttonInteraction.ts  # ボタンインタラクション
│   │   └── modalInteraction.ts   # モーダルインタラクション
│   ├── utils/             # ユーティリティ
│   │   └── security.ts    # セキュリティ関連機能
│   ├── types/             # 型定義
│   │   └── env.d.ts       # 環境変数型定義
│   ├── database.ts        # データベース管理
│   ├── vcManager.ts       # VC管理システム
│   ├── types.ts           # 基本型定義
│   └── index.ts           # メインファイル
├── data/                  # データベースファイル
├── dist/                  # コンパイル済みファイル
├── .env.example           # 環境変数テンプレート
├── .gitignore            # Git無視ファイル
├── package.json          # パッケージ設定
├── tsconfig.json         # TypeScript設定
└── README.md             # このファイル
```

## � Railway/Herokuでのデプロイ

### データ永続化対策

このボットは自動的に環境を検出してデータベースを選択します：

- **ローカル開発**: SQLite（`data/elysion.db`）
- **本番環境**: PostgreSQL（`DATABASE_URL`が設定されている場合）

### Railway でのデプロイ手順

1. **PostgreSQLサービスを追加**
   ```bash
   # Railwayダッシュボードで「Add Service」→ PostgreSQL
   ```

2. **環境変数を設定**
   ```env
   DISCORD_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_client_id
   NODE_ENV=production
   DATABASE_URL=postgresql://... # Railwayが自動設定
   ```

3. **既存データの移行（必要な場合）**
   ```bash
   npm run migrate
   ```

4. **デプロイ**
   ```bash
   git push origin main
   ```

### データバックアップ

```bash
# 手動バックアップ
npm run backup

# バックアップファイルは backups/ ディレクトリに保存
```

### 本番環境でのデータ保護

- PostgreSQLは永続ストレージを使用
- Railway/Herokuのデータベースは自動的にバックアップされる
- 定期的なカスタムバックアップも設定可能

## �🔧 開発者向け情報

### スクリプト一覧

```bash
# 開発モード（ホットリロード）
npm run dev

# プロダクションビルド
npm run build
npm start

# TypeScriptのコンパイル監視
npm run watch

# スラッシュコマンドのデプロイ
npm run deploy-commands

# コードの品質チェック
npm run lint

# コードの自動修正
npm run lint:fix
```

### データベース設計

**users テーブル**
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE NOT NULL,
  balance INTEGER DEFAULT 10000,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**transactions テーブル**
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id TEXT,
  to_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('transfer', 'admin_give', 'vc_purchase')),
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**secret_vcs テーブル**
```sql
CREATE TABLE secret_vcs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT UNIQUE NOT NULL,
  creator_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**monthly_salary_claims テーブル**
```sql
CREATE TABLE monthly_salary_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  claim_month TEXT NOT NULL,  -- YYYY-MM format
  paid_by TEXT NOT NULL,       -- 支給した管理者のID
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, claim_month) -- 月1回制限
);
```

### 新しいコマンドの追加

1. `src/commands/`ディレクトリに新しい`.ts`ファイルを作成
2. 以下のテンプレートを使用：

```typescript
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types';

const yourCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('your-command')
    .setDescription('Your command description'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply('Hello from your command!');
  },
};

export default yourCommand;
```

3. ボットを再起動すると自動的にコマンドが読み込まれます

## 🔒 セキュリティ機能

### レート制限
- 送金: 3回/分
- 自動的にリセット

### 入力値検証
- 金額: 1以上、1,000,000以下の整数
- チャンネル名: 100文字以下、特殊文字制限
- ユーザーID: Discord ID形式チェック

### ログ記録
- 管理者操作の記録
- セキュリティ関連操作の記録
- エラーログ

## 💡 トラブルシューティング

### よくある問題

1. **ボットがオンラインにならない**
   - `DISCORD_TOKEN`が正しく設定されているか確認
   - Botの権限が適切に設定されているか確認

2. **コマンドが表示されない**
   - ボットに`applications.commands`スコープが付与されているか確認
   - `npm run deploy-commands`を実行

3. **VCが作成できない**
   - ボットに「チャンネル管理」権限があるか確認
   - 残高が500 Ru以上あるか確認

4. **データベースエラー**
   - `data/`ディレクトリに書き込み権限があるか確認
   - SQLiteが正しくインストールされているか確認

5. **依存関係のエラー**
   - `node_modules`を削除して再インストール: `rm -rf node_modules && npm install`

## 📜 ライセンス

MIT License

## 🤝 コントリビューション

1. フォークしてください
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. コミット (`git commit -m 'Add some amazing feature'`)
4. プッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📞 サポート

問題や質問がある場合は、GitHubのIssuesをご利用ください。

---

**Elysion Bot** - Discord内での新しいコミュニケーション体験を提供します 🚀