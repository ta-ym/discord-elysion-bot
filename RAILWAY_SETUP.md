# Railway PostgreSQL設定ガイド

## 手順1: Railway.appでPostgreSQLサービス作成

### 1. Railway.appにアクセス
- https://railway.app にアクセス
- GitHubアカウントでログイン

### 2. 新しいプロジェクトを作成
1. 「New Project」をクリック
2. 「Provision PostgreSQL」を選択
3. プロジェクト名を設定（例: elysion-bot-db）

### 3. DATABASE_URLを取得
1. 作成されたPostgreSQLサービスをクリック
2. 「Variables」タブを開く
3. `DATABASE_URL` の値をコピー

形式例:
```
postgresql://postgres:password123@containers-us-west-1.railway.app:6543/railway
```

## 手順2: 環境変数設定

### .envファイルを更新
```env
# Discord Bot Configuration
DISCORD_TOKEN=あなたのDiscordトークン

# PostgreSQL Configuration (Railway)
DATABASE_URL=postgresql://postgres:password123@containers-us-west-1.railway.app:6543/railway
```

**重要: 実際のDATABASE_URLに置き換えてください**

## 手順3: 接続テスト

### PostgreSQL接続テストを実行
```bash
# 接続テスト実行
npm run test-postgresql
```

### 期待される出力
```
PostgreSQL接続設定:
URL: postgresql://postgres:****@containers-us-west-1.railway.app:6543/railway

=== PostgreSQL接続テスト ===
✅ 接続成功!
PostgreSQLバージョン: PostgreSQL 13.x

=== テーブル作成テスト ===
✅ test_usersテーブル作成成功
✅ テストデータ挿入成功
✅ データ取得成功: 123456789012345678 - 15000Ru
✅ テストテーブル削除完了
✅ テーブル作成テスト完了

=== 本番テーブル作成テスト ===
既存テーブル: なし
✅ usersテーブル作成確認
✅ transactionsテーブル作成確認
✅ salary_configsテーブル作成確認
✅ monthly_salary_claimsテーブル作成確認
✅ インデックス作成確認
✅ 本番テーブル作成完了
作成済みテーブル: monthly_salary_claims, salary_configs, transactions, users

🎉 すべてのテストが成功しました！
PostgreSQLの準備が完了しています。
```

## エラーの対処法

### 接続エラー
```
❌ 接続失敗: Connection failed
```
**解決方法:**
1. DATABASE_URLが正しく設定されているか確認
2. Railway PostgreSQLサービスが起動しているか確認
3. ネットワーク接続を確認

### 認証エラー
```
❌ 接続失敗: authentication failed
```
**解決方法:**
1. DATABASE_URL内のパスワードが正しいか確認
2. Railway Variables タブで最新のDATABASE_URLを確認

### タイムアウトエラー
```
❌ 接続失敗: timeout
```
**解決方法:**
1. Railway サービスの地域を確認
2. ファイアウォール設定を確認
3. 少し時間をおいて再実行

## 次のステップ

接続テストが成功したら:

1. **ボット起動テスト**
   ```bash
   npm run build
   npm start
   ```

2. **通貨コマンドテスト**
   - `/balance` - 残高確認
   - `/give @user 1000` - 送金テスト（管理者）

3. **Railway Dashboard確認**
   - データベース使用量
   - 接続数
   - クエリ実行状況

## セキュリティ注意事項

- `.env`ファイルはGitに含めないでください
- DATABASE_URLは秘密情報として管理してください
- 本番環境では適切なアクセス制御を設定してください

PostgreSQL接続の準備ができました！