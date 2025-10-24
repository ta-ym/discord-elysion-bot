import sqlite3 from 'sqlite3';
import { Pool, Client } from 'pg';
import path from 'path';

export interface User {
  id: string;
  discord_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  type: 'transfer' | 'admin_give' | 'vc_purchase';
  description: string;
  created_at: string;
}

export interface SecretVC {
  id: number;
  channel_id: string;
  creator_id: string;
  channel_name: string;
  created_at: string;
  last_activity: string;
}

export class Database {
  private sqliteDb?: sqlite3.Database;
  private pgPool?: Pool;
  private isPostgres: boolean;

  constructor() {
    // 環境変数でデータベースタイプを判定
    this.isPostgres = !!process.env.DATABASE_URL;
    
    if (this.isPostgres) {
      this.initializePostgreSQL();
    } else {
      this.initializeSQLite();
    }
  }

  private initializePostgreSQL(): void {
    this.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    console.log('Connected to PostgreSQL database');
    this.initializePostgreSQLTables();
  }

  private initializeSQLite(): void {
    const dbPath = path.join(__dirname, '..', 'data', 'elysion.db');
    this.sqliteDb = new sqlite3.Database(dbPath, (err: any) => {
      if (err) {
        console.error('Error opening SQLite database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.initializeSQLiteTables();
      }
    });
  }

  private async initializePostgreSQLTables(): Promise<void> {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
      await client.connect();

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

      // 取引履歴テーブル
      await client.query(`
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

      // シークレットVCテーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS secret_vcs (
          id SERIAL PRIMARY KEY,
          channel_id TEXT UNIQUE NOT NULL,
          creator_id TEXT NOT NULL,
          channel_name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('PostgreSQL tables initialized');
    } catch (error) {
      console.error('Error initializing PostgreSQL tables:', error);
    } finally {
      await client.end();
    }
  }

  private initializeSQLiteTables(): void {
    if (!this.sqliteDb) return;

    // ユーザーテーブル
    this.sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT UNIQUE NOT NULL,
        balance INTEGER DEFAULT 10000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 取引履歴テーブル
    this.sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user_id TEXT,
        to_user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('transfer', 'admin_give', 'vc_purchase')),
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // シークレットVCテーブル
    this.sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS secret_vcs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT UNIQUE NOT NULL,
        creator_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('SQLite tables initialized');
  }

  // ユーザー関連メソッド
  async getUser(discordId: string): Promise<User | null> {
    if (this.isPostgres && this.pgPool) {
      try {
        const result = await this.pgPool.query(
          'SELECT * FROM users WHERE discord_id = $1',
          [discordId]
        );
        return result.rows[0] || null;
      } catch (error) {
        console.error('PostgreSQL error in getUser:', error);
        return null;
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.get(
          'SELECT * FROM users WHERE discord_id = ?',
          [discordId],
          (err: any, row: User) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }
    return null;
  }

  async createUser(discordId: string): Promise<User> {
    if (this.isPostgres && this.pgPool) {
      try {
        const result = await this.pgPool.query(
          'INSERT INTO users (discord_id) VALUES ($1) RETURNING *',
          [discordId]
        );
        return result.rows[0];
      } catch (error) {
        console.error('PostgreSQL error in createUser:', error);
        throw error;
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.run(
          'INSERT INTO users (discord_id) VALUES (?)',
          [discordId],
          function(err: any) {
            if (err) reject(err);
            else {
              resolve({
                id: this.lastID.toString(),
                discord_id: discordId,
                balance: 10000,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }
          }
        );
      });
    }
    throw new Error('No database connection available');
  }

  async updateUserBalance(discordId: string, newBalance: number): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      try {
        await this.pgPool.query(
          'UPDATE users SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
          [newBalance, discordId]
        );
      } catch (error) {
        console.error('PostgreSQL error in updateUserBalance:', error);
        throw error;
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.run(
          'UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
          [newBalance, discordId],
          (err: any) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
  }

  // 取引履歴関連メソッド
  async addTransaction(
    fromUserId: string | null,
    toUserId: string,
    amount: number,
    type: 'transfer' | 'admin_give' | 'vc_purchase',
    description: string
  ): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      try {
        await this.pgPool.query(
          'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
          [fromUserId, toUserId, amount, type, description]
        );
      } catch (error) {
        console.error('PostgreSQL error in addTransaction:', error);
        throw error;
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.run(
          'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
          [fromUserId, toUserId, amount, type, description],
          (err: any) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
  }

  async getUserTransactions(discordId: string, limit: number = 10): Promise<Transaction[]> {
    if (this.isPostgres && this.pgPool) {
      try {
        const result = await this.pgPool.query(
          `SELECT * FROM transactions 
           WHERE from_user_id = $1 OR to_user_id = $1 
           ORDER BY created_at DESC 
           LIMIT $2`,
          [discordId, limit]
        );
        return result.rows;
      } catch (error) {
        console.error('PostgreSQL error in getUserTransactions:', error);
        return [];
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.all(
          `SELECT * FROM transactions 
           WHERE from_user_id = ? OR to_user_id = ? 
           ORDER BY created_at DESC 
           LIMIT ?`,
          [discordId, discordId, limit],
          (err: any, rows: Transaction[]) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    return [];
  }

  // シークレットVC関連メソッド
  async addSecretVC(channelId: string, creatorId: string, channelName: string): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      try {
        await this.pgPool.query(
          'INSERT INTO secret_vcs (channel_id, creator_id, channel_name) VALUES ($1, $2, $3)',
          [channelId, creatorId, channelName]
        );
      } catch (error) {
        console.error('PostgreSQL error in addSecretVC:', error);
        throw error;
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.run(
          'INSERT INTO secret_vcs (channel_id, creator_id, channel_name) VALUES (?, ?, ?)',
          [channelId, creatorId, channelName],
          (err: any) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
  }

  async updateVCActivity(channelId: string): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      try {
        await this.pgPool.query(
          'UPDATE secret_vcs SET last_activity = CURRENT_TIMESTAMP WHERE channel_id = $1',
          [channelId]
        );
      } catch (error) {
        console.error('PostgreSQL error in updateVCActivity:', error);
        throw error;
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.run(
          'UPDATE secret_vcs SET last_activity = CURRENT_TIMESTAMP WHERE channel_id = ?',
          [channelId],
          (err: any) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
  }

  async getSecretVC(channelId: string): Promise<SecretVC | null> {
    if (this.isPostgres && this.pgPool) {
      try {
        const result = await this.pgPool.query(
          'SELECT * FROM secret_vcs WHERE channel_id = $1',
          [channelId]
        );
        return result.rows[0] || null;
      } catch (error) {
        console.error('PostgreSQL error in getSecretVC:', error);
        return null;
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.get(
          'SELECT * FROM secret_vcs WHERE channel_id = ?',
          [channelId],
          (err: any, row: SecretVC) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }
    return null;
  }

  async removeSecretVC(channelId: string): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      try {
        await this.pgPool.query(
          'DELETE FROM secret_vcs WHERE channel_id = $1',
          [channelId]
        );
      } catch (error) {
        console.error('PostgreSQL error in removeSecretVC:', error);
        throw error;
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.run(
          'DELETE FROM secret_vcs WHERE channel_id = ?',
          [channelId],
          (err: any) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
  }

  async getInactiveVCs(minutesAgo: number = 5): Promise<SecretVC[]> {
    if (this.isPostgres && this.pgPool) {
      try {
        const result = await this.pgPool.query(
          `SELECT * FROM secret_vcs 
           WHERE last_activity <= NOW() - INTERVAL '${minutesAgo} minutes'`
        );
        return result.rows;
      } catch (error) {
        console.error('PostgreSQL error in getInactiveVCs:', error);
        return [];
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.all(
          `SELECT * FROM secret_vcs 
           WHERE datetime(last_activity) <= datetime('now', '-${minutesAgo} minutes')`,
          (err: any, rows: SecretVC[]) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    return [];
  }

  // トランザクション処理
  async transferMoney(fromId: string, toId: string, amount: number, description: string): Promise<boolean> {
    if (this.isPostgres && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');

        // 送金者の残高チェック
        const senderResult = await client.query(
          'SELECT balance FROM users WHERE discord_id = $1',
          [fromId]
        );

        if (!senderResult.rows[0] || senderResult.rows[0].balance < amount) {
          await client.query('ROLLBACK');
          return false;
        }

        // 送金者の残高を減額
        await client.query(
          'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
          [amount, fromId]
        );

        // 受取人の残高を増額（ユーザーが存在しない場合は作成）
        await client.query(
          `INSERT INTO users (discord_id, balance) VALUES ($1, 10000 + $2)
           ON CONFLICT(discord_id) DO UPDATE SET 
           balance = users.balance + $2, updated_at = CURRENT_TIMESTAMP`,
          [toId, amount]
        );

        // 取引履歴を記録
        await client.query(
          'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
          [fromId, toId, amount, 'transfer', description]
        );

        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('PostgreSQL error in transferMoney:', error);
        return false;
      } finally {
        client.release();
      }
    } else if (this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb!.serialize(() => {
          this.sqliteDb!.run('BEGIN TRANSACTION');
          
          // 送金者の残高チェックと減額
          this.sqliteDb!.get(
            'SELECT balance FROM users WHERE discord_id = ?',
            [fromId],
            (err: any, row: any) => {
              if (err || !row || row.balance < amount) {
                this.sqliteDb!.run('ROLLBACK');
                resolve(false);
                return;
              }

              // 送金者の残高を減額
              this.sqliteDb!.run(
                'UPDATE users SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
                [amount, fromId],
                (err: any) => {
                  if (err) {
                    this.sqliteDb!.run('ROLLBACK');
                    reject(err);
                    return;
                  }

                  // 受取人の残高を増額（ユーザーが存在しない場合は作成）
                  this.sqliteDb!.run(
                    `INSERT INTO users (discord_id, balance) VALUES (?, 10000 + ?)
                     ON CONFLICT(discord_id) DO UPDATE SET 
                     balance = balance + ?, updated_at = CURRENT_TIMESTAMP`,
                    [toId, amount, amount],
                    (err: any) => {
                      if (err) {
                        this.sqliteDb!.run('ROLLBACK');
                        reject(err);
                        return;
                      }

                      // 取引履歴を記録
                      this.sqliteDb!.run(
                        'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
                        [fromId, toId, amount, 'transfer', description],
                        (err: any) => {
                          if (err) {
                            this.sqliteDb!.run('ROLLBACK');
                            reject(err);
                          } else {
                            this.sqliteDb!.run('COMMIT');
                            resolve(true);
                          }
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        });
      });
    }
    return false;
  }

  close(): void {
    if (this.isPostgres && this.pgPool) {
      this.pgPool.end().then(() => {
        console.log('PostgreSQL connection pool closed');
      });
    } else if (this.sqliteDb) {
      this.sqliteDb.close((err: any) => {
        if (err) {
          console.error('Error closing SQLite database:', err.message);
        } else {
          console.log('SQLite database connection closed');
        }
      });
    }
  }
}