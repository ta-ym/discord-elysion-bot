# PostgreSQL移行ガイド

## 概要

サーバー内通貨システムをSQLiteからRailway PostgreSQLに移行しました。VC関連のデータは引き続きSQLiteに保存され、通貨関連のデータがPostgreSQLに移行されています。

## アーキテクチャ

### ハイブリッド構成
- **PostgreSQL**: ユーザー残高、取引履歴、月給設定
- **SQLite**: VC関連データ（voice_sessions、temp_vcs など）

### 新しいファイル構成
- `src/postgresDatabase.ts`: PostgreSQL専用データベースクラス
- `src/database.ts`: 両方のDBを管理するメインクラス

## 環境設定

### 環境変数
```env
# PostgreSQL接続URL（Railway提供）
DATABASE_URL=postgresql://user:password@host:port/database

# 開発環境例
DATABASE_URL=postgresql://localhost:5432/elysion_dev
```

### Railway設定手順
1. Railway.appでPostgreSQLサービスを作成
2. 環境変数`DATABASE_URL`を自動設定
3. ボット再デプロイで自動的にテーブル作成

## PostgreSQLテーブル構造

### users
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  discord_id TEXT UNIQUE NOT NULL,
  balance INTEGER DEFAULT 10000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### transactions
```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  from_user_id TEXT,
  to_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('transfer', 'admin_give', 'vc_purchase', 'salary', 'voice_reward')),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### salary_configs
```sql
CREATE TABLE salary_configs (
  id SERIAL PRIMARY KEY,
  role_id TEXT UNIQUE NOT NULL,
  role_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### monthly_salary_claims
```sql
CREATE TABLE monthly_salary_claims (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  claim_month TEXT NOT NULL,
  paid_by TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, claim_month)
);
```

## 影響を受けるコマンド

以下のコマンドがPostgreSQLを使用するようになりました：

### 通貨関連コマンド
- `/balance` - 残高確認
- `/transfer` - 送金
- `/give` - 管理者送金
- `/pay` - 管理者支払い
- `/history` - 取引履歴

### 月給関連コマンド
- `/salary` - 月給受取
- `/salary-config` - 月給設定（管理者）
- `/salary-history` - 月給履歴
- `/salary-bulk` - 一括月給支給（管理者）

### ログ関連
- `/currency-log` - 取引ログ（管理者）

## データ移行

### 既存データの移行
現在のSQLiteデータをPostgreSQLに移行する場合：

1. 既存のユーザーデータをエクスポート
2. PostgreSQLでINSERT文を実行
3. 残高整合性の確認

### 移行スクリプト例
```sql
-- 既存ユーザーデータ移行
INSERT INTO users (discord_id, balance, created_at, updated_at)
VALUES 
  ('user_id_1', 15000, NOW(), NOW()),
  ('user_id_2', 8500, NOW(), NOW());

-- 既存取引履歴移行
INSERT INTO transactions (from_user_id, to_user_id, amount, type, description, created_at)
VALUES 
  ('user_id_1', 'user_id_2', 1000, 'transfer', '送金', NOW());
```

## パフォーマンス向上

### PostgreSQLの利点
- **スケーラビリティ**: 大量のユーザーと取引に対応
- **同時実行性**: 複数の取引を安全に処理
- **データ整合性**: ACIDトランザクション保証
- **バックアップ**: Railway自動バックアップ

### インデックス最適化
主要なクエリパフォーマンス向上のため以下のインデックスを設定：
- `users.discord_id`
- `transactions.to_user_id`
- `transactions.from_user_id`
- `transactions.type`
- `transactions.created_at`

## トラブルシューティング

### 接続エラー
```
Error: Connection failed
```
- `DATABASE_URL`環境変数を確認
- Railway PostgreSQLサービスの状態確認
- ネットワーク接続確認

### テーブル不存在エラー
```
Error: relation "users" does not exist
```
- 初期化プロセスが正常実行されているか確認
- 手動でテーブル作成スクリプト実行

### データ不整合
- PostgreSQL側とSQLite側のユーザーID一致確認
- 残高計算の検証

## モニタリング

### Railway Dashboard
- データベース使用量
- 接続数
- クエリパフォーマンス

### ログ確認
```
PostgreSQL currency tables initialized
Connected to PostgreSQL database
```

## 今後の拡張

### 予定機能
- 詳細な取引分析
- 月次/年次レポート
- 通貨インフレ管理
- 高度な権限システム

### 最適化計画
- クエリキャッシュ
- 読み取り専用レプリカ
- バッチ処理最適化

## 本番環境デプロイ

1. Railway PostgreSQLサービス作成
2. `DATABASE_URL`環境変数設定
3. アプリケーションデプロイ
4. 初期化ログ確認
5. テストユーザーでの動作確認

通貨システムがPostgreSQLに正常に移行され、スケーラビリティと信頼性が向上しました！