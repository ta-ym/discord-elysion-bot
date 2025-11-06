# データ移行ガイド：SQLite → PostgreSQL

## 概要

現在のサーバー内通貨データ（ユーザー残高、取引履歴、月給履歴）をSQLiteからPostgreSQLに移行するためのツールです。

## 事前準備

### 1. Railway PostgreSQL準備
```bash
# Railway.appでPostgreSQLサービスを作成
# DATABASE_URL環境変数が自動設定される
```

### 2. 環境変数設定
```env
# .envファイルに追加
DATABASE_URL=postgresql://user:password@host:port/database
```

## 移行手順

### ステップ1: 現在のデータ確認
```bash
# SQLiteデータベースの内容を確認
npm run inspect-data
```

**出力例:**
```
=== SQLiteデータベース検査開始 ===
=== テーブル一覧 ===
users, transactions, monthly_salary_claims, ...

=== ユーザーデータサンプル ===
総ユーザー数: 15 (最初の5人を表示)
1. ID: 123456789012345678, 残高: 25000Ru, 作成日: 2024-11-01
2. ID: 234567890123456789, 残高: 18500Ru, 作成日: 2024-11-02

=== 統計情報 ===
ユーザー総数: 15
総残高: 285000
取引総数: 47
取引タイプ別統計:
  transfer: 25件, 125000Ru
  admin_give: 10件, 50000Ru
  vc_purchase: 12件, 60000Ru
```

### ステップ2: PostgreSQL準備確認
```bash
# PostgreSQLテーブルが作成されているか確認
# ボットを一度起動するとテーブルが自動作成される
```

### ステップ3: データ移行実行
```bash
# 重要: 移行前にボットを停止してください
# データの整合性を保つため

# データ移行実行
npm run migrate-data
```

**移行プロセス:**
```
=== データ移行開始 ===
SQLiteからデータを抽出中...
抽出結果: ユーザー15人, 取引47件, 月給申請8件

PostgreSQLにデータを移行中...
15人のユーザーデータを移行中...
ユーザー 123456789012345678 を移行: 25000Ru
ユーザー 234567890123456789 を移行: 18500Ru
...
ユーザーデータの移行が完了しました

47件の取引履歴を移行中...
取引を移行: transfer 5000Ru (123... -> 234...)
取引を移行: admin_give 10000Ru (null -> 345...)
...
取引履歴の移行が完了しました

8件の月給申請を移行中...
月給申請を移行: 123456789012345678 2024-11 15000Ru
...
月給申請履歴の移行が完了しました

=== 移行結果検証 ===
PostgreSQLユーザー数: 15
PostgreSQL取引数: 47
PostgreSQL総残高: 285000Ru
取引タイプ別統計:
  admin_give: 10件, 50000Ru
  transfer: 25件, 125000Ru
  vc_purchase: 12件, 60000Ru

=== データ移行完了 ===
✅ すべてのデータが正常に移行されました！
```

### ステップ4: 動作確認
```bash
# PostgreSQL対応ボットを起動
npm start

# Discordで動作確認
/balance  # 残高が正しく表示されるか
/history  # 取引履歴が表示されるか
```

## 移行の特徴

### 安全性
- **ON CONFLICT処理**: 重複データは更新、新規データは追加
- **トランザクション**: エラー時の自動ロールバック
- **読み取り専用**: SQLiteは読み取り専用でアクセス
- **データ検証**: 移行後に自動検証実行

### 重複実行対応
```bash
# 同じコマンドを複数回実行しても安全
# 既存データは更新、新規データは追加される
npm run migrate-data
npm run migrate-data  # 2回目も安全
```

### パーシャル移行
```bash
# 特定のデータが失敗しても他のデータは移行される
# ログで詳細な成功/失敗状況が確認できる
```

## トラブルシューティング

### PostgreSQL接続エラー
```
Error: Connection failed
```
**解決方法:**
1. `DATABASE_URL`環境変数を確認
2. Railway PostgreSQLサービスの状態確認
3. ネットワーク接続確認

### SQLiteファイル不存在
```
Error: SQLITE_CANTOPEN
```
**解決方法:**
1. `data/elysion.db`ファイルの存在確認
2. ファイルの読み取り権限確認

### データ不整合
```
Warning: Balance mismatch detected
```
**解決方法:**
1. 移行前後の統計比較
2. 手動でデータ確認
3. 必要に応じて個別修正

### 部分的失敗
```
Error: User 123... migration failed
```
**対応方法:**
1. ログで失敗した項目を確認
2. 原因を修正後、再実行
3. 個別に手動修正

## 移行後の確認項目

### データ整合性チェック
```sql
-- PostgreSQL側で確認
SELECT COUNT(*) FROM users;           -- ユーザー数
SELECT SUM(balance) FROM users;      -- 総残高
SELECT COUNT(*) FROM transactions;   -- 取引数

-- 残高計算の検証
SELECT 
  u.discord_id,
  u.balance,
  (
    COALESCE((SELECT SUM(amount) FROM transactions WHERE to_user_id = u.discord_id), 0) -
    COALESCE((SELECT SUM(amount) FROM transactions WHERE from_user_id = u.discord_id), 0)
  ) as calculated_balance
FROM users u
WHERE u.balance != calculated_balance;  -- 不整合があれば表示
```

### 機能テスト
1. **残高確認**: `/balance`コマンドテスト
2. **送金機能**: `/transfer`コマンドテスト  
3. **履歴表示**: `/history`コマンドテスト
4. **管理機能**: `/give`コマンドテスト（管理者）

## バックアップ

### 移行前バックアップ
```bash
# SQLiteファイルをバックアップ
cp data/elysion.db data/elysion_backup_$(date +%Y%m%d_%H%M%S).db
```

### 移行後バックアップ
```bash
# Railway Dashboardから PostgreSQLバックアップ作成
# または pg_dump でローカルバックアップ
```

## 本番環境での移行

### 推奨手順
1. **メンテナンス通知**: ユーザーに事前通知
2. **ボット停止**: データ整合性確保
3. **バックアップ作成**: SQLiteファイルバックアップ
4. **移行実行**: `npm run migrate-data`
5. **検証実行**: データ整合性確認
6. **ボット再開**: PostgreSQL版で起動
7. **動作確認**: 主要機能テスト
8. **完了通知**: ユーザーに運用再開通知

### ダウンタイム
- **推定時間**: 5-15分（データ量による）
- **最小化**: 事前準備とリハーサルで短縮可能

## よくある質問

### Q: 移行中にデータが失われる可能性は？
A: SQLiteは読み取り専用でアクセスし、PostgreSQLはトランザクション処理するため、元データは保護されます。

### Q: 移行を途中でキャンセルできる？
A: Ctrl+Cで停止可能。PostgreSQL側はトランザクション処理でロールバックされます。

### Q: 移行後にSQLiteは不要？
A: VC関連データは継続してSQLiteを使用するため、削除しないでください。

### Q: 移行後に追加されたデータは？
A: PostgreSQL側に直接保存されるため、追加の移行は不要です。

移行ツールが準備できました！現在データが少なくても、将来データが蓄積された際にいつでも安全に移行できます。