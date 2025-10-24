import sqlite3 from 'sqlite3';
import { Pool } from 'pg';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

interface MigrationData {
  users: any[];
  transactions: any[];
  secret_vcs: any[];
}

async function migrateSQLiteToPostgreSQL() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Please set it to migrate to PostgreSQL.');
    return;
  }

  console.log('Starting migration from SQLite to PostgreSQL...');

  // SQLiteからデータを読み取り
  const sqliteDb = new sqlite3.Database(path.join(__dirname, '..', 'data', 'elysion.db'));
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // SQLiteからデータを取得
    const migrationData: MigrationData = {
      users: await new Promise((resolve, reject) => {
        sqliteDb.all('SELECT * FROM users', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }),
      transactions: await new Promise((resolve, reject) => {
        sqliteDb.all('SELECT * FROM transactions', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }),
      secret_vcs: await new Promise((resolve, reject) => {
        sqliteDb.all('SELECT * FROM secret_vcs', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      })
    };

    console.log(`Found ${migrationData.users.length} users, ${migrationData.transactions.length} transactions, ${migrationData.secret_vcs.length} VCs`);

    // PostgreSQLにテーブルを作成
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        discord_id TEXT UNIQUE NOT NULL,
        balance INTEGER DEFAULT 10000,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        from_user_id TEXT,
        to_user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('transfer', 'admin_give', 'vc_purchase')),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS secret_vcs (
        id SERIAL PRIMARY KEY,
        channel_id TEXT UNIQUE NOT NULL,
        creator_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // データを移行
    for (const user of migrationData.users) {
      await pgPool.query(
        'INSERT INTO users (discord_id, balance, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (discord_id) DO NOTHING',
        [user.discord_id, user.balance, user.created_at, user.updated_at]
      );
    }

    for (const transaction of migrationData.transactions) {
      await pgPool.query(
        'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [transaction.from_user_id, transaction.to_user_id, transaction.amount, transaction.type, transaction.description, transaction.created_at]
      );
    }

    for (const vc of migrationData.secret_vcs) {
      await pgPool.query(
        'INSERT INTO secret_vcs (channel_id, creator_id, channel_name, created_at, last_activity) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (channel_id) DO NOTHING',
        [vc.channel_id, vc.creator_id, vc.channel_name, vc.created_at, vc.last_activity]
      );
    }

    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

// スクリプト実行
migrateSQLiteToPostgreSQL().catch(console.error);