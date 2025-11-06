import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config();

class PostgreSQLTester {
  private pool: Pool;

  constructor() {
    if (!process.env['DATABASE_URL']) {
      throw new Error('DATABASE_URL 環境変数が設定されていません');
    }

    this.pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
    });

    console.log('PostgreSQL接続設定:');
    console.log(`URL: ${process.env['DATABASE_URL']?.replace(/:[^:@]*@/, ':****@')}`); // パスワード隠す
  }

  // 接続テスト
  async testConnection(): Promise<void> {
    try {
      console.log('\n=== PostgreSQL接続テスト ===');
      const client = await this.pool.connect();
      
      // バージョン確認
      const result = await client.query('SELECT version()');
      console.log('✅ 接続成功!');
      console.log(`PostgreSQLバージョン: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
      
      client.release();
    } catch (error) {
      console.error('❌ 接続失敗:', error);
      throw error;
    }
  }

  // テーブル作成テスト
  async testTableCreation(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      console.log('\n=== テーブル作成テスト ===');
      await client.query('BEGIN');

      // ユーザーテーブル作成
      await client.query(`
        CREATE TABLE IF NOT EXISTS test_users (
          id SERIAL PRIMARY KEY,
          discord_id TEXT UNIQUE NOT NULL,
          balance INTEGER DEFAULT 10000,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ test_usersテーブル作成成功');

      // テストデータ挿入
      const testUserId = '123456789012345678';
      await client.query(
        'INSERT INTO test_users (discord_id, balance) VALUES ($1, $2) ON CONFLICT (discord_id) DO UPDATE SET balance = $2',
        [testUserId, 15000]
      );
      console.log('✅ テストデータ挿入成功');

      // データ取得テスト
      const result = await client.query('SELECT * FROM test_users WHERE discord_id = $1', [testUserId]);
      console.log(`✅ データ取得成功: ${result.rows[0].discord_id} - ${result.rows[0].balance}Ru`);

      // テーブル削除（クリーンアップ）
      await client.query('DROP TABLE IF EXISTS test_users');
      console.log('✅ テストテーブル削除完了');

      await client.query('COMMIT');
      console.log('✅ テーブル作成テスト完了');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ テーブル作成テスト失敗:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 本番テーブル作成テスト
  async testProductionTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      console.log('\n=== 本番テーブル作成テスト ===');
      await client.query('BEGIN');

      // 既存テーブル確認
      const existingTables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'transactions', 'salary_configs', 'monthly_salary_claims')
      `);
      
      console.log(`既存テーブル: ${existingTables.rows.map(r => r.table_name).join(', ') || 'なし'}`);

      // ユーザーテーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          discord_id TEXT UNIQUE NOT NULL,
          balance INTEGER DEFAULT 10000,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ usersテーブル作成確認');

      // 取引履歴テーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          from_user_id TEXT,
          to_user_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('transfer', 'admin_give', 'vc_purchase', 'salary', 'voice_reward')),
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ transactionsテーブル作成確認');

      // 月給設定テーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS salary_configs (
          id SERIAL PRIMARY KEY,
          role_id TEXT UNIQUE NOT NULL,
          role_name TEXT NOT NULL,
          amount INTEGER NOT NULL,
          enabled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ salary_configsテーブル作成確認');

      // 月給支給テーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS monthly_salary_claims (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          claim_month TEXT NOT NULL,
          paid_by TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, claim_month)
        )
      `);
      console.log('✅ monthly_salary_claimsテーブル作成確認');

      // インデックス作成
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_to_user_id ON transactions(to_user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_from_user_id ON transactions(from_user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
      console.log('✅ インデックス作成確認');

      await client.query('COMMIT');
      console.log('✅ 本番テーブル作成完了');

      // 最終確認
      const finalTables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);
      console.log(`作成済みテーブル: ${finalTables.rows.map(r => r.table_name).join(', ')}`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ 本番テーブル作成失敗:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 総合テスト実行
  async runAllTests(): Promise<void> {
    try {
      await this.testConnection();
      await this.testTableCreation();
      await this.testProductionTables();
      
      console.log('\n🎉 すべてのテストが成功しました！');
      console.log('PostgreSQLの準備が完了しています。');
    } catch (error) {
      console.error('\n💥 テスト失敗:', error);
      throw error;
    }
  }

  // 接続終了
  async close(): Promise<void> {
    await this.pool.end();
    console.log('PostgreSQL接続を閉じました');
  }
}

// テスト実行
async function runTest() {
  const tester = new PostgreSQLTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('テスト実行エラー:', error);
    process.exit(1);
  } finally {
    await tester.close();
  }
}

if (require.main === module) {
  runTest();
}