import sqlite3 from 'sqlite3';
import path from 'path';
import { PostgreSQLDatabase } from './postgresDatabase';

export interface User {
  id: number;
  discord_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  from_user_id?: string;
  to_user_id: string;
  amount: number;
  type: 'transfer' | 'admin_give' | 'vc_purchase' | 'salary' | 'voice_reward';
  description?: string;
  created_at: string;
}

export interface MonthlySalaryClaim {
  id: number;
  user_id: string;
  role_id: string;         // Discord ロールID
  amount: number;
  claim_month: string;     // YYYY-MM format
  paid_by: string;         // 支給した管理者のID
  description?: string;
  created_at: string;
}

export interface PublicVC {
  id: number;
  channel_id: string;
  creator_id: string;
  channel_name: string;
  description?: string;
  created_at: string;
  last_activity: string;
}

export interface TempVC {
  id: number;
  channel_id: string;
  creator_id: string;
  channel_name: string;
  duration_hours: number;
  cost_ru: number;
  created_at: string;
  expires_at: string;
}

export interface VoiceSession {
  id: number;
  user_id: string;
  channel_id: string;
  joined_at: string;
  left_at?: string;
  duration_minutes?: number;
  has_angel_role: boolean;
}

export interface VoiceTimeLog {
  id: number;
  user_id: string;
  date: string; // YYYY-MM-DD format
  total_minutes: number;
  angel_role_minutes: number;
  sessions_count: number;
  created_at: string;
  updated_at: string;
}

export interface SpecialVCSession {
  id: number;
  user_id: string;
  channel_id: string;
  channel_name: string;
  vc_type: 'corridor' | 'evaluation'; // 回廊 or 評価
  joined_at: string;
  left_at?: string;
  duration_minutes?: number;
  has_angel_role: boolean;
}

export interface SpecialVCTimeLog {
  id: number;
  user_id: string;
  date: string; // YYYY-MM-DD format
  corridor_minutes: number; // 回廊での時間
  evaluation_minutes: number; // 評価VCでの時間
  corridor_sessions: number;
  evaluation_sessions: number;
  total_angel_corridor_minutes: number;
  total_angel_evaluation_minutes: number;
  last_updated: string;
}

export class Database {
  private db: sqlite3.Database;
  private pgDb: PostgreSQLDatabase | null;
  private usePostgreSQL: boolean = true; // PostgreSQL使用フラグ

  constructor() {
    // 環境変数でPostgreSQL使用を制御
    const disablePostgreSQL = process.env['DISABLE_POSTGRESQL'] === 'true';
    this.usePostgreSQL = !disablePostgreSQL && !!process.env['DATABASE_URL'];

    // PostgreSQL接続を初期化（通貨関連のデータ用）
    if (this.usePostgreSQL && process.env['DATABASE_URL']) {
      try {
        // DATABASE_URLの形式をチェック
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl || dbUrl.includes('username:password@host:port') || dbUrl === 'postgresql://username:password@host:port/database') {
          throw new Error('DATABASE_URL is not properly configured - contains placeholder values');
        }
        
        console.log('PostgreSQL接続情報: {');
        console.log(`  url: '${dbUrl.replace(/\/\/[^:]+:[^@]+@/, '//****:****@')}',`);
        console.log(`  isProduction: ${process.env['NODE_ENV'] === 'production'}`);
        console.log('}');
        console.log('PostgreSQL通貨システムを初期化中...');
        
        this.pgDb = new PostgreSQLDatabase();
      } catch (error) {
        console.error('PostgreSQL初期化エラー:', error);
        console.log('ボット起動を継続しますが、通貨機能は利用できません');
        this.pgDb = null;
        this.usePostgreSQL = false;
      }
    } else {
      if (disablePostgreSQL) {
        console.log('PostgreSQLが無効化されています - SQLiteで通貨機能を使用します');
      } else {
        console.log('DATABASE_URLが設定されていません - SQLiteで通貨機能を使用します');
      }
      this.pgDb = null;
      this.usePostgreSQL = false;
    }
    
    // SQLite接続を初期化（VC関連のデータ用）
    // Railway環境ではメモリDBまたはwritableなディレクトリを使用
    const isProduction = process.env['NODE_ENV'] === 'production';
    let dbPath: string;
    
    if (isProduction) {
      // 本番環境：現在のディレクトリにDBファイルを配置
      dbPath = path.join(process.cwd(), 'elysion.db');
    } else {
      // 開発環境：従来のdataディレクトリ
      dbPath = path.join(__dirname, '..', 'data', 'elysion.db');
    }
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        // エラーが発生した場合はメモリDBにフォールバック
        console.log('Falling back to in-memory database...');
        this.db = new sqlite3.Database(':memory:', (memErr) => {
          if (memErr) {
            console.error('Error creating memory database:', memErr.message);
          } else {
            console.log('Connected to in-memory SQLite database');
            this.initializeTables();
          }
        });
      } else {
        console.log('Connected to SQLite database');
        this.initializeTables();
      }
    });
  }

  private initializeTables(): void {
    // serializeを使用してテーブル作成を順次実行
    this.db.serialize(() => {
    
    // PostgreSQLが使用できない場合は、SQLiteに通貨テーブルも作成
    if (!this.usePostgreSQL) {
      console.log('PostgreSQL利用不可 - SQLiteに通貨テーブルを作成します');
      
      // ユーザーテーブル
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT UNIQUE NOT NULL,
          balance INTEGER DEFAULT 10000,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 取引履歴テーブル
      this.db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_user_id TEXT,
          to_user_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('transfer', 'admin_give', 'vc_purchase', 'salary', 'voice_reward')),
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    
    // 公開VCテーブル
    this.db.run(`
      CREATE TABLE IF NOT EXISTS public_vcs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT UNIQUE NOT NULL,
        creator_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 一時VCテーブル（時間制限付き、料金システム）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS temp_vcs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT UNIQUE NOT NULL,
        creator_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        duration_hours INTEGER NOT NULL,
        cost_ru INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
      )
    `);

    // 通話セッションテーブル（月給関連テーブルはPostgreSQLに移行）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS voice_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        left_at DATETIME,
        duration_minutes INTEGER,
        has_angel_role BOOLEAN DEFAULT FALSE
      )
    `);

    // 通話時間ログテーブル（日次集計）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS voice_time_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        total_minutes INTEGER DEFAULT 0,
        angel_role_minutes INTEGER DEFAULT 0,
        sessions_count INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      )
    `);

    // 特別VC（回廊・評価）セッションテーブル
    this.db.run(`
      CREATE TABLE IF NOT EXISTS special_vc_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        vc_type TEXT NOT NULL, -- 'corridor' or 'evaluation'
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        left_at DATETIME,
        duration_minutes INTEGER,
        has_angel_role BOOLEAN DEFAULT FALSE
      )
    `);

    // 特別VC時間ログテーブル（日次集計）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS special_vc_time_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        corridor_minutes INTEGER DEFAULT 0,
        evaluation_minutes INTEGER DEFAULT 0,
        corridor_sessions INTEGER DEFAULT 0,
        evaluation_sessions INTEGER DEFAULT 0,
        total_angel_corridor_minutes INTEGER DEFAULT 0,
        total_angel_evaluation_minutes INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      )
    `);

    // インデックス作成
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_id ON voice_sessions(user_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_voice_sessions_joined_at ON voice_sessions(joined_at)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_voice_sessions_angel_role ON voice_sessions(has_angel_role)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_voice_time_logs_user_id ON voice_time_logs(user_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_voice_time_logs_date ON voice_time_logs(date)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_voice_time_logs_angel_minutes ON voice_time_logs(angel_role_minutes)`);
    
    // 特別VCテーブルのインデックス
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_special_vc_sessions_user_id ON special_vc_sessions(user_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_special_vc_sessions_type ON special_vc_sessions(vc_type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_special_vc_sessions_joined_at ON special_vc_sessions(joined_at)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_special_vc_time_logs_user_id ON special_vc_time_logs(user_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_special_vc_time_logs_date ON special_vc_time_logs(date)`);

    console.log('Database tables initialized');
    }); // serialize終了
  }

  // ユーザー関連メソッド（PostgreSQLに委譲またはSQLiteフォールバック）
  async getUser(discordId: string): Promise<User | null> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.getUser(discordId);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE discord_id = ?',
        [discordId],
        (err, row: User) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async createUser(discordId: string): Promise<User> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.createUser(discordId);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (discord_id) VALUES (?)',
        [discordId],
        function(err) {
          if (err) reject(err);
          else {
            resolve({
              id: this.lastID,
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

  async updateUserBalance(discordId: string, newBalance: number): Promise<void> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.updateUserBalance(discordId, newBalance);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
        [newBalance, discordId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // ユーザーの残高を設定（存在しない場合は作成）
  async setUserBalance(discordId: string, newBalance: number): Promise<void> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.setUserBalance(discordId, newBalance);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      // UPSERT操作：存在する場合は更新、存在しない場合は作成
      this.db.run(
        `INSERT INTO users (discord_id, balance, created_at, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(discord_id) DO UPDATE SET 
         balance = excluded.balance, 
         updated_at = CURRENT_TIMESTAMP`,
        [discordId, newBalance],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // 取引履歴関連メソッド（PostgreSQLに委譲またはSQLiteフォールバック）
  async addTransaction(
    fromUserId: string | null,
    toUserId: string,
    amount: number,
    type: 'transfer' | 'admin_give' | 'vc_purchase' | 'salary' | 'voice_reward',
    description?: string
  ): Promise<void> {
    if (this.usePostgreSQL && this.pgDb) {
      await this.pgDb.createTransaction(fromUserId, toUserId, amount, type, description);
      return;
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
        [fromUserId, toUserId, amount, type, description],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUserTransactions(discordId: string, limit: number = 10): Promise<Transaction[]> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.getTransactionHistory(discordId, limit);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM transactions 
         WHERE from_user_id = ? OR to_user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [discordId, discordId, limit],
        (err, rows: Transaction[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getTransactionHistory(discordId: string, limit: number = 10, offset: number = 0): Promise<Transaction[]> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.getTransactionHistory(discordId, limit, offset);
    }
    
    // SQLiteフォールバック
    return this.getUserTransactions(discordId, limit);
  }

  // 月給関連メソッド（PostgreSQLに委譲またはSQLiteフォールバック）
  async getSalaryConfigs(): Promise<any[]> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.getSalaryConfigs();
    }
    // SQLiteフォールバック（空配列）
    return [];
  }

  async setSalaryConfig(roleId: string, roleName: string, amount: number): Promise<any> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.setSalaryConfig(roleId, roleName, amount);
    }
    // SQLiteフォールバック（何もしない）
    return null;
  }

  async hasSalaryClaim(userId: string, month: string): Promise<boolean> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.hasSalaryClaim(userId, month);
    }
    // SQLiteフォールバック（月給機能なし）
    return false;
  }

  async createSalaryClaim(
    userId: string,
    roleId: string,
    amount: number,
    month: string,
    paidBy: string,
    description?: string
  ): Promise<void> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.createSalaryClaim(userId, roleId, amount, month, paidBy, description);
    }
    // SQLiteフォールバック（何もしない）
  }

  async getSalaryHistory(userId: string): Promise<any[]> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.getSalaryHistory(userId);
    }
    // SQLiteフォールバック（空配列）
    return [];
  }

  // TempVC関連メソッド
  async addTempVC(channelId: string, creatorId: string, channelName: string, durationHours: number, costRu: number, expiresAt: Date): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO temp_vcs (channel_id, creator_id, channel_name, duration_hours, cost_ru, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [channelId, creatorId, channelName, durationHours, costRu, expiresAt.toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getTempVC(channelId: string): Promise<TempVC | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM temp_vcs WHERE channel_id = ?',
        [channelId],
        (err, row: TempVC) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async removeTempVC(channelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM temp_vcs WHERE channel_id = ?',
        [channelId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getExpiredTempVCs(): Promise<TempVC[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM temp_vcs WHERE datetime(expires_at) <= datetime("now")',
        (err, rows: TempVC[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // トランザクション処理
  async transferMoney(fromId: string, toId: string, amount: number, description: string): Promise<boolean> {
    console.log(`[DATABASE] transferMoney called: usePostgreSQL=${this.usePostgreSQL}, pgDb=${!!this.pgDb}`);
    if (this.usePostgreSQL && this.pgDb) {
      console.log(`[DATABASE] Using PostgreSQL for transferMoney`);
      return await this.pgDb.transferMoney(fromId, toId, amount, description);
    }
    
    console.log(`[DATABASE] Using SQLite fallback for transferMoney`);
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        // 送金者の残高チェックと減額
        this.db.get(
          'SELECT balance FROM users WHERE discord_id = ?',
          [fromId],
          (err, row: any) => {
            if (err || !row || row.balance < amount) {
              this.db.run('ROLLBACK');
              resolve(false);
              return;
            }

            // 送金者の残高を減額
            this.db.run(
              'UPDATE users SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
              [amount, fromId],
              (err) => {
                if (err) {
                  this.db.run('ROLLBACK');
                  reject(err);
                  return;
                }

                // 受取人の残高を増額（ユーザーが存在しない場合は作成）
                this.db.run(
                  `INSERT INTO users (discord_id, balance) VALUES (?, 10000 + ?)
                   ON CONFLICT(discord_id) DO UPDATE SET 
                   balance = balance + ?, updated_at = CURRENT_TIMESTAMP`,
                  [toId, amount, amount],
                  (err) => {
                    if (err) {
                      this.db.run('ROLLBACK');
                      reject(err);
                      return;
                    }

                    // 取引履歴を記録
                    this.db.run(
                      'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
                      [fromId, toId, amount, 'transfer', description],
                      (err) => {
                        if (err) {
                          this.db.run('ROLLBACK');
                          reject(err);
                          return;
                        }

                        this.db.run('COMMIT');
                        resolve(true);
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

  // 管理者による支給（残高チェック不要）
  async adminGiveMoney(adminId: string, toId: string, amount: number, description: string): Promise<void> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.adminGiveMoney(adminId, toId, amount, description);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        // 受取人の残高を増額（ユーザーが存在しない場合は作成）
        this.db.run(
          `INSERT INTO users (discord_id, balance) VALUES (?, 10000 + ?)
           ON CONFLICT(discord_id) DO UPDATE SET 
           balance = balance + ?, updated_at = CURRENT_TIMESTAMP`,
          [toId, amount, amount],
          (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }

            // 取引履歴を記録
            this.db.run(
              'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
              [adminId, toId, amount, 'admin_give', description],
              (err) => {
                if (err) {
                  this.db.run('ROLLBACK');
                  reject(err);
                  return;
                }

                this.db.run('COMMIT', (err) => {
                  if (err) {
                    this.db.run('ROLLBACK');
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              }
            );
          }
        );
      });
    });
  }

  // システムによる支給（管理者IDなし）
  async giveMoney(toId: string, amount: number, description: string): Promise<void> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.giveMoney(toId, amount, description);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        // 受取人の残高を増額（ユーザーが存在しない場合は作成）
        this.db.run(
          `INSERT INTO users (discord_id, balance) VALUES (?, 10000 + ?)
           ON CONFLICT(discord_id) DO UPDATE SET 
           balance = balance + ?, updated_at = CURRENT_TIMESTAMP`,
          [toId, amount, amount],
          (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }

            // 取引履歴を記録
            this.db.run(
              'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
              [null, toId, amount, 'admin_give', description],
              (err) => {
                if (err) {
                  this.db.run('ROLLBACK');
                  reject(err);
                  return;
                }

                this.db.run('COMMIT', (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              }
            );
          }
        );
      });
    });
  }

  // 給与請求関連メソッド
  async hasClaimedSalaryToday(userId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式
    
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id FROM salary_claims WHERE user_id = ? AND claim_date = ?',
        [userId, today],
        (err: any, row: any) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
  }

  async claimSalary(userId: string, roleId: string, amount: number): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        // 今日既に請求済みかチェック
        this.db.get(
          'SELECT id FROM salary_claims WHERE user_id = ? AND claim_date = ?',
          [userId, today],
          (err: any, row: any) => {
            if (err || row) {
              this.db.run('ROLLBACK');
              resolve(false);
              return;
            }

            // ユーザーの残高を取得/作成
            this.db.get(
              'SELECT balance FROM users WHERE discord_id = ?',
              [userId],
              (err: any, user: any) => {
                if (err) {
                  this.db.run('ROLLBACK');
                  reject(err);
                  return;
                }

                if (!user) {
                  // ユーザーが存在しない場合は作成
                  this.db.run(
                    'INSERT INTO users (discord_id, balance) VALUES (?, ?)',
                    [userId, 10000 + amount],
                    (err: any) => {
                      if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                        return;
                      }
                      this.insertSalaryClaim(userId, roleId, amount, today, resolve, reject);
                    }
                  );
                } else {
                  // 既存ユーザーの残高を更新
                  this.db.run(
                    'UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
                    [amount, userId],
                    (err: any) => {
                      if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                        return;
                      }
                      this.insertSalaryClaim(userId, roleId, amount, today, resolve, reject);
                    }
                  );
                }
              }
            );
          }
        );
      });
    });
  }

  private insertSalaryClaim(userId: string, roleId: string, amount: number, claimDate: string, resolve: Function, reject: Function): void {
    // 給与請求記録を追加
    this.db.run(
      'INSERT INTO salary_claims (user_id, role_id, amount, claim_date) VALUES (?, ?, ?, ?)',
      [userId, roleId, amount, claimDate],
      (err: any) => {
        if (err) {
          this.db.run('ROLLBACK');
          reject(err);
          return;
        }

        // 取引履歴を追加
        this.db.run(
          'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
          [null, userId, amount, 'admin_give', `日次給与 (${roleId})`],
          (err: any) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
            } else {
              this.db.run('COMMIT');
              resolve(true);
            }
          }
        );
      }
    );
  }

  // 月給支給メソッド
  async payMonthlySalary(userId: string, roleId: string, amount: number, paidBy: string, description?: string): Promise<boolean> {
    try {
      if (this.usePostgreSQL && this.pgDb) {
        console.log(`[DATABASE] Using PostgreSQL for payMonthlySalary: ${userId}`);
        return await this.pgDb.payMonthlySalary(userId, roleId, amount, paidBy, description);
      }
    } catch (error) {
      console.error('[DATABASE] PostgreSQL payMonthlySalary failed:', error);
      throw error;
    }
    
    // SQLiteフォールバック
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

    return new Promise((resolve, reject) => {
      this.db.run('BEGIN TRANSACTION');
      
      // 今月既に支給済みかチェック
      this.db.get(
        'SELECT id FROM monthly_salary_claims WHERE user_id = ? AND claim_month = ?',
        [userId, currentMonth],
        (err: any, row: any) => {
          if (err) {
            this.db.run('ROLLBACK');
            reject(err);
            return;
          }

          if (row) {
            this.db.run('ROLLBACK');
            reject(new Error('今月の給与は既に支給済みです'));
            return;
          }

          // ユーザーが存在するか確認
          this.db.get(
            'SELECT discord_id FROM users WHERE discord_id = ?',
            [userId],
            (err: any, user: any) => {
              if (err) {
                this.db.run('ROLLBACK');
                reject(err);
                return;
              }

              if (!user) {
                // ユーザーが存在しない場合は作成
                this.db.run(
                  'INSERT INTO users (discord_id) VALUES (?)',
                  [userId],
                  (err: any) => {
                    if (err) {
                      this.db.run('ROLLBACK');
                      reject(err);
                      return;
                    }
                  }
                );
              }

              // 残高を更新
              this.db.run(
                'UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
                [amount, userId],
                (err: any) => {
                  if (err) {
                    this.db.run('ROLLBACK');
                    reject(err);
                    return;
                  }
                  this.insertMonthlySalaryClaim(userId, roleId, amount, currentMonth, paidBy, description, resolve, reject);
                }
              );
            }
          );
        }
      );
    });
  }

  private insertMonthlySalaryClaim(
    userId: string, 
    roleId: string, 
    amount: number, 
    claimMonth: string, 
    paidBy: string, 
    description: string | undefined, 
    resolve: Function, 
    reject: Function
  ): void {
    // 月給支給記録を追加
    this.db.run(
      'INSERT INTO monthly_salary_claims (user_id, role_id, amount, claim_month, paid_by, description) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, roleId, amount, claimMonth, paidBy, description || ''],
      (err: any) => {
        if (err) {
          this.db.run('ROLLBACK');
          reject(err);
          return;
        }

        // 取引履歴を追加
        this.db.run(
          'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
          [null, userId, amount, 'admin_give', `月給支給 (${roleId}) - ${claimMonth}`],
          (err: any) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
            } else {
              this.db.run('COMMIT');
              resolve(true);
            }
          }
        );
      }
    );
  }

  async getMonthlySalaryHistory(userId: string, limit: number = 12): Promise<MonthlySalaryClaim[]> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.getMonthlySalaryHistory(userId, limit);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM monthly_salary_claims WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, limit],
        (err: any, rows: MonthlySalaryClaim[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // 全ユーザーの月給履歴を取得（管理者用）
  async getAllMonthlySalaryHistory(limit: number = 50): Promise<MonthlySalaryClaim[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM monthly_salary_claims ORDER BY created_at DESC LIMIT ?',
        [limit],
        (err: any, rows: MonthlySalaryClaim[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // 指定月の支給状況確認
  async checkMonthlySalaryStatus(userId: string, month?: string): Promise<MonthlySalaryClaim | null> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.checkMonthlySalaryStatus(userId, month);
    }
    
    // SQLiteフォールバック
    const targetMonth = month || new Date().toISOString().substring(0, 7);
    
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM monthly_salary_claims WHERE user_id = ? AND claim_month = ?',
        [userId, targetMonth],
        (err: any, row: MonthlySalaryClaim) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  // 月給支給記録削除（ロールバック用）
  async deleteMonthlySalaryClaim(userId: string, month: string): Promise<boolean> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.deleteMonthlySalaryClaim(userId, month);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM monthly_salary_claims WHERE user_id = ? AND claim_month = ?',
        [userId, month],
        function(err: any) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  // 公開VC関連メソッド
  async addPublicVC(channelId: string, creatorId: string, channelName: string, description?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO public_vcs (channel_id, creator_id, channel_name, description) VALUES (?, ?, ?, ?)',
        [channelId, creatorId, channelName, description || null],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getPublicVC(channelId: string): Promise<PublicVC | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM public_vcs WHERE channel_id = ?',
        [channelId],
        (err, row: PublicVC) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async getActivePublicVCs(): Promise<PublicVC[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM public_vcs ORDER BY created_at DESC',
        [],
        (err, rows: PublicVC[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async removePublicVC(channelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM public_vcs WHERE channel_id = ?',
        [channelId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async updatePublicVC(channelId: string, channelName: string, description?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE public_vcs SET channel_name = ?, description = ?, last_activity = CURRENT_TIMESTAMP WHERE channel_id = ?',
        [channelName, description || null, channelId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // 通話セッション関連メソッド
  async startVoiceSession(userId: string, channelId: string, hasAngelRole: boolean): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO voice_sessions (user_id, channel_id, has_angel_role) VALUES (?, ?, ?)',
        [userId, channelId, hasAngelRole],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async endVoiceSession(sessionId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE voice_sessions 
         SET left_at = CURRENT_TIMESTAMP,
             duration_minutes = ROUND((julianday(CURRENT_TIMESTAMP) - julianday(joined_at)) * 24 * 60)
         WHERE id = ?`,
        [sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getActiveVoiceSession(userId: string, channelId: string): Promise<VoiceSession | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM voice_sessions WHERE user_id = ? AND channel_id = ? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1',
        [userId, channelId],
        (err, row: VoiceSession) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async updateVoiceTimeLog(userId: string, date: string, additionalMinutes: number, angelRoleMinutes: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO voice_time_logs (user_id, date, total_minutes, angel_role_minutes, sessions_count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET
           total_minutes = total_minutes + ?,
           angel_role_minutes = angel_role_minutes + ?,
           sessions_count = sessions_count + 1,
           last_updated = CURRENT_TIMESTAMP`,
        [userId, date, additionalMinutes, angelRoleMinutes, additionalMinutes, angelRoleMinutes],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getVoiceTimeStats(userId: string, startDate?: string, endDate?: string): Promise<VoiceTimeLog[]> {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM voice_time_logs WHERE user_id = ?';
      const params: any[] = [userId];

      if (startDate) {
        query += ' AND date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND date <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY date DESC';

      this.db.all(query, params, (err, rows: VoiceTimeLog[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async getAngelRoleVoiceStats(startDate?: string, endDate?: string): Promise<{
    user_id: string;
    total_angel_minutes: number;
    total_sessions: number;
  }[]> {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          user_id,
          SUM(angel_role_minutes) as total_angel_minutes,
          SUM(sessions_count) as total_sessions
        FROM voice_time_logs 
        WHERE angel_role_minutes > 0
      `;
      const params: any[] = [];

      if (startDate) {
        query += ' AND date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND date <= ?';
        params.push(endDate);
      }

      query += ' GROUP BY user_id ORDER BY total_angel_minutes DESC';

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // 特別VC（回廊・評価）関連メソッド
  async startSpecialVCSession(userId: string, channelId: string, channelName: string, vcType: 'corridor' | 'evaluation', hasAngelRole: boolean): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO special_vc_sessions (user_id, channel_id, channel_name, vc_type, has_angel_role) VALUES (?, ?, ?, ?, ?)',
        [userId, channelId, channelName, vcType, hasAngelRole],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async endSpecialVCSession(sessionId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE special_vc_sessions 
         SET left_at = CURRENT_TIMESTAMP,
             duration_minutes = ROUND((julianday(CURRENT_TIMESTAMP) - julianday(joined_at)) * 24 * 60)
         WHERE id = ?`,
        [sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getActiveSpecialVCSession(userId: string, channelId: string): Promise<SpecialVCSession | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM special_vc_sessions WHERE user_id = ? AND channel_id = ? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1',
        [userId, channelId],
        (err, row: SpecialVCSession) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async updateSpecialVCTimeLog(userId: string, date: string, corridorMinutes: number, evaluationMinutes: number, angelCorridorMinutes: number, angelEvaluationMinutes: number, vcType: 'corridor' | 'evaluation'): Promise<void> {
    return new Promise((resolve, reject) => {
      const corridorSessionsIncrement = vcType === 'corridor' ? 1 : 0;
      const evaluationSessionsIncrement = vcType === 'evaluation' ? 1 : 0;

      this.db.run(
        `INSERT INTO special_vc_time_logs (user_id, date, corridor_minutes, evaluation_minutes, corridor_sessions, evaluation_sessions, total_angel_corridor_minutes, total_angel_evaluation_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET
           corridor_minutes = corridor_minutes + excluded.corridor_minutes,
           evaluation_minutes = evaluation_minutes + excluded.evaluation_minutes,
           corridor_sessions = corridor_sessions + excluded.corridor_sessions,
           evaluation_sessions = evaluation_sessions + excluded.evaluation_sessions,
           total_angel_corridor_minutes = total_angel_corridor_minutes + excluded.total_angel_corridor_minutes,
           total_angel_evaluation_minutes = total_angel_evaluation_minutes + excluded.total_angel_evaluation_minutes,
           last_updated = CURRENT_TIMESTAMP`,
        [userId, date, corridorMinutes, evaluationMinutes, corridorSessionsIncrement, evaluationSessionsIncrement, angelCorridorMinutes, angelEvaluationMinutes],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getSpecialVCStats(userId: string, startDate?: string, endDate?: string): Promise<SpecialVCTimeLog[]> {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM special_vc_time_logs WHERE user_id = ?';
      const params: any[] = [userId];

      if (startDate) {
        query += ' AND date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND date <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY date DESC';

      this.db.all(query, params, (err, rows: SpecialVCTimeLog[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async getSpecialVCRanking(vcType: 'corridor' | 'evaluation' | 'both' = 'both', startDate?: string, endDate?: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let timeField;
      if (vcType === 'corridor') {
        timeField = 'SUM(corridor_minutes) as total_minutes';
      } else if (vcType === 'evaluation') {
        timeField = 'SUM(evaluation_minutes) as total_minutes';
      } else {
        timeField = 'SUM(corridor_minutes + evaluation_minutes) as total_minutes';
      }

      let query = `
        SELECT 
          user_id,
          ${timeField},
          SUM(corridor_minutes) as corridor_minutes,
          SUM(evaluation_minutes) as evaluation_minutes,
          SUM(corridor_sessions) as corridor_sessions,
          SUM(evaluation_sessions) as evaluation_sessions,
          SUM(total_angel_corridor_minutes) as angel_corridor_minutes,
          SUM(total_angel_evaluation_minutes) as angel_evaluation_minutes
        FROM special_vc_time_logs 
        WHERE 1=1
      `;
      const params: any[] = [];

      if (startDate) {
        query += ' AND date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND date <= ?';
        params.push(endDate);
      }

      query += ' GROUP BY user_id ORDER BY total_minutes DESC';

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // 給与詳細取得メソッド
  async getSalaryDetails(userId: string, month: string): Promise<any[]> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.getSalaryDetails(userId, month);
    }
    
    // SQLiteフォールバック
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM monthly_salary_claims WHERE user_id = ? AND claim_month = ? ORDER BY created_at DESC',
        [userId, month],
        (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Bulk Salary結果を保存
  async saveBulkSalaryResults(results: any[], processedBy: string): Promise<void> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.saveBulkSalaryResults(results, processedBy);
    }
    
    // SQLiteフォールバック: bulk_salary_resultsテーブルがない場合はスキップ
    console.log('Bulk salary results save - SQLite not supported, skipping save');
  }

  // 最新のBulk Salary結果を取得
  async getLatestBulkSalaryResults(processedBy: string): Promise<any[]> {
    if (this.usePostgreSQL && this.pgDb) {
      return await this.pgDb.getLatestBulkSalaryResults(processedBy);
    }
    
    // SQLiteフォールバック: 空配列を返す
    console.log('Bulk salary results retrieval - SQLite not supported, returning empty array');
    return [];
  }

  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}