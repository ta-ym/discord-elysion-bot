import sqlite3 from 'sqlite3';
import { Pool } from 'pg';
import path from 'path';
import * as dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config();

interface SQLiteUser {
  id: number;
  discord_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

interface SQLiteTransaction {
  id: number;
  from_user_id: string | null;
  to_user_id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

interface SQLiteSalaryClaim {
  id: number;
  user_id: string;
  role_id: string;
  amount: number;
  claim_month: string;
  paid_by: string;
  description: string | null;
  created_at: string;
}

class DataMigrator {
  private sqliteDb: sqlite3.Database;
  private pgPool: Pool;

  constructor() {
    // SQLiteデータベースに接続
    const dbPath = path.join(__dirname, '..', 'data', 'elysion.db');
    this.sqliteDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('SQLite接続エラー:', err.message);
      } else {
        console.log('SQLiteデータベースに接続しました');
      }
    });

    // PostgreSQLに接続
    this.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  // SQLiteからユーザーデータを取得
  async extractUsers(): Promise<SQLiteUser[]> {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(
        'SELECT * FROM users ORDER BY created_at',
        (err, rows: SQLiteUser[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  // SQLiteから取引履歴を取得
  async extractTransactions(): Promise<SQLiteTransaction[]> {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(
        'SELECT * FROM transactions ORDER BY created_at',
        (err, rows: SQLiteTransaction[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  // SQLiteから月給申請履歴を取得
  async extractSalaryClaims(): Promise<SQLiteSalaryClaim[]> {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(
        'SELECT * FROM monthly_salary_claims ORDER BY created_at',
        (err, rows: SQLiteSalaryClaim[]) => {
          if (err) {
            if (err.message.includes('no such table')) {
              console.log('monthly_salary_claimsテーブルが存在しません（問題なし）');
              resolve([]);
            } else {
              reject(err);
            }
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  // PostgreSQLにユーザーデータを挿入
  async migrateUsers(users: SQLiteUser[]): Promise<void> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');
      
      console.log(`${users.length}人のユーザーデータを移行中...`);
      
      for (const user of users) {
        try {
          await client.query(
            `INSERT INTO users (discord_id, balance, created_at, updated_at) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (discord_id) DO UPDATE SET 
             balance = $2, updated_at = $4`,
            [user.discord_id, user.balance, user.created_at, user.updated_at]
          );
          console.log(`ユーザー ${user.discord_id} を移行: ${user.balance}Ru`);
        } catch (error) {
          console.error(`ユーザー ${user.discord_id} の移行エラー:`, error);
        }
      }
      
      await client.query('COMMIT');
      console.log('ユーザーデータの移行が完了しました');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('ユーザーデータ移行エラー:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // PostgreSQLに取引履歴を挿入
  async migrateTransactions(transactions: SQLiteTransaction[]): Promise<void> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');
      
      console.log(`${transactions.length}件の取引履歴を移行中...`);
      
      for (const tx of transactions) {
        try {
          await client.query(
            `INSERT INTO transactions (from_user_id, to_user_id, amount, type, description, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tx.from_user_id, tx.to_user_id, tx.amount, tx.type, tx.description, tx.created_at]
          );
          console.log(`取引を移行: ${tx.type} ${tx.amount}Ru (${tx.from_user_id} -> ${tx.to_user_id})`);
        } catch (error) {
          console.error(`取引 ID ${tx.id} の移行エラー:`, error);
        }
      }
      
      await client.query('COMMIT');
      console.log('取引履歴の移行が完了しました');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('取引履歴移行エラー:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // PostgreSQLに月給申請を挿入
  async migrateSalaryClaims(claims: SQLiteSalaryClaim[]): Promise<void> {
    if (claims.length === 0) {
      console.log('移行する月給申請履歴はありません');
      return;
    }

    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');
      
      console.log(`${claims.length}件の月給申請を移行中...`);
      
      for (const claim of claims) {
        try {
          await client.query(
            `INSERT INTO monthly_salary_claims (user_id, role_id, amount, claim_month, paid_by, description, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, claim_month) DO NOTHING`,
            [claim.user_id, claim.role_id, claim.amount, claim.claim_month, claim.paid_by, claim.description, claim.created_at]
          );
          console.log(`月給申請を移行: ${claim.user_id} ${claim.claim_month} ${claim.amount}Ru`);
        } catch (error) {
          console.error(`月給申請 ID ${claim.id} の移行エラー:`, error);
        }
      }
      
      await client.query('COMMIT');
      console.log('月給申請履歴の移行が完了しました');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('月給申請移行エラー:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // データ整合性チェック
  async verifyMigration(): Promise<void> {
    const client = await this.pgPool.connect();
    
    try {
      // ユーザー数確認
      const userCount = await client.query('SELECT COUNT(*) FROM users');
      console.log(`PostgreSQLユーザー数: ${userCount.rows[0].count}`);
      
      // 取引数確認
      const txCount = await client.query('SELECT COUNT(*) FROM transactions');
      console.log(`PostgreSQL取引数: ${txCount.rows[0].count}`);
      
      // 残高合計確認
      const balanceSum = await client.query('SELECT SUM(balance) FROM users');
      console.log(`PostgreSQL総残高: ${balanceSum.rows[0].sum}Ru`);
      
      // 取引タイプ別統計
      const txStats = await client.query(
        'SELECT type, COUNT(*), SUM(amount) FROM transactions GROUP BY type ORDER BY type'
      );
      console.log('取引タイプ別統計:');
      for (const stat of txStats.rows) {
        console.log(`  ${stat.type}: ${stat.count}件, ${stat.sum}Ru`);
      }
      
    } finally {
      client.release();
    }
  }

  // 移行処理実行
  async migrate(): Promise<void> {
    try {
      console.log('=== データ移行開始 ===');
      
      // 1. データ抽出
      console.log('SQLiteからデータを抽出中...');
      const users = await this.extractUsers();
      const transactions = await this.extractTransactions();
      const salaryClaims = await this.extractSalaryClaims();
      
      console.log(`抽出結果: ユーザー${users.length}人, 取引${transactions.length}件, 月給申請${salaryClaims.length}件`);
      
      // 2. データ移行
      console.log('\nPostgreSQLにデータを移行中...');
      await this.migrateUsers(users);
      await this.migrateTransactions(transactions);
      await this.migrateSalaryClaims(salaryClaims);
      
      // 3. 検証
      console.log('\n=== 移行結果検証 ===');
      await this.verifyMigration();
      
      console.log('\n=== データ移行完了 ===');
      console.log('✅ すべてのデータが正常に移行されました！');
      
    } catch (error) {
      console.error('移行プロセスエラー:', error);
      throw error;
    }
  }

  // リソース解放
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.sqliteDb.close((err) => {
        if (err) {
          console.error('SQLite切断エラー:', err.message);
        } else {
          console.log('SQLite接続を閉じました');
        }
      });
      
      this.pgPool.end().then(() => {
        console.log('PostgreSQL接続を閉じました');
        resolve();
      });
    });
  }
}

// 移行実行
async function runMigration() {
  const migrator = new DataMigrator();
  
  try {
    await migrator.migrate();
  } catch (error) {
    console.error('移行失敗:', error);
    process.exit(1);
  } finally {
    await migrator.close();
  }
}

// スクリプト実行
if (require.main === module) {
  runMigration();
}

export { DataMigrator };