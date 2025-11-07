
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
  private usePostgreSQL: boolean = false;

  constructor() {
    // SQLiteデータベースの初期化（メイン機能用）
    const dbPath = path.join(__dirname, '..', 'database.sqlite');
    this.db = new sqlite3.Database(dbPath);
    
    // PostgreSQL接続の初期化（給与システム専用）
    if (process.env['DATABASE_URL']) {
      const dbUrl = process.env['DATABASE_URL'];
      if (!dbUrl.includes('username:password@host:port') && dbUrl !== 'postgresql://username:password@host:port/database') {
        console.log('=== ハイブリッドモード ===');
        console.log('SQLite: 通常機能（VC、トランザクション履歴等）');
        console.log('PostgreSQL: 給与システム専用');
        console.log(`PostgreSQL URL: '${dbUrl.replace(/\/\/[^:]+:[^@]+@/, '//****:****@')}'`);
        
        this.usePostgreSQL = true;
        this.pgDb = new PostgreSQLDatabase();
      } else {
        console.log('PostgreSQL設定不正 - SQLiteのみモードで動作');
        this.pgDb = null;
      }
    } else {
      console.log('DATABASE_URL未設定 - SQLiteのみモードで動作');
      this.pgDb = null;
    }

    // テーブル初期化
    this.initializeTables();
    
    // PostgreSQL接続の健全性チェック（給与システム用）
    if (this.usePostgreSQL && this.pgDb) {
      setTimeout(async () => {
        try {
          await this.checkPostgreSQLHealth();
          console.log('PostgreSQL給与システム - 接続確認完了');
        } catch (healthError) {
          console.error('PostgreSQL健全性チェック失敗:', healthError);
          console.error('給与システムはSQLiteフォールバックで動作します');
          this.usePostgreSQL = false;
        }
      }, 3000);
    }
  }

  // checkPostgreSQLHealthメソッドを追加
  private async checkPostgreSQLHealth(): Promise<void> {
    if (!this.pgDb) {
      throw new Error('PostgreSQL connection not available');
    }
    
    // PostgreSQLDatabaseクラスの健全性チェックメソッドを呼び出し
    await this.pgDb.healthCheck();
    
    console.log('PostgreSQL健全性チェック完了');
  }

  private initializeTables(): void {
    // SQLiteテーブルの初期化
    this.db.serialize(() => {
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

      // 給与請求テーブル（フォールバック用）
      this.db.run(`
        CREATE TABLE IF NOT EXISTS salary_claims (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          claim_date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 月給支給記録テーブル（フォールバック用）
      this.db.run(`
        CREATE TABLE IF NOT EXISTS monthly_salary_claims (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          claim_month TEXT NOT NULL,
          paid_by TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // VCテーブル群
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

      this.db.run(`
        CREATE TABLE IF NOT EXISTS voice_time_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          date TEXT NOT NULL,
          total_minutes INTEGER DEFAULT 0,
          angel_role_minutes INTEGER DEFAULT 0,
          sessions_count INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, date)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS special_vc_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          vc_type TEXT NOT NULL CHECK (vc_type IN ('menhera', 'needy')),
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          left_at DATETIME,
          duration_minutes INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS special_vc_time_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          date TEXT NOT NULL,
          menhera_minutes INTEGER DEFAULT 0,
          needy_minutes INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, date)
        )
      `);

      console.log('SQLiteテーブル初期化完了');
    });
  }

  // ユーザー関連メソッド（SQLiteベース）
  async getUser(discordId: string): Promise<User | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE discord_id = ?',
        [discordId],
        (err: any, row: User) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async createUser(discordId: string): Promise<User> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (discord_id) VALUES (?)',
        [discordId],
        function(err: any) {
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
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
        [newBalance, discordId],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // システムによる支給（管理者IDなし）
  async giveMoney(toId: string, amount: number, description: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        // ユーザーの残高を更新
        this.db.run(
          'UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
          [amount, toId],
          (err: any) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }

            // 取引履歴を追加
            this.db.run(
              'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
              [null, toId, amount, 'admin_give', description],
              (err: any) => {
                if (err) {
                  this.db.run('ROLLBACK');
                  reject(err);
                } else {
                  this.db.run('COMMIT');
                  resolve();
                }
              }
            );
          }
        );
      });
    });
  }

  // 注意: 日次給与システムは廃止され、月給システムのみ使用されています

  // 月給支給メソッド（ハイブリッド：PostgreSQL優先、SQLiteフォールバック）
  async payMonthlySalary(userId: string, roleId: string, amount: number, paidBy: string, description?: string): Promise<boolean> {
    if (this.usePostgreSQL && this.pgDb) {
      try {
        console.log(`[DATABASE] Using PostgreSQL for payMonthlySalary: ${userId}`);
        return await this.pgDb.payMonthlySalary(userId, roleId, amount, paidBy, description);
      } catch (error) {
        console.error('[DATABASE] PostgreSQL payMonthlySalary failed, falling back to SQLite:', error);
        // PostgreSQL失敗時はSQLiteにフォールバック
      }
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

                  // 月給支給記録を追加
                  this.db.run(
                    'INSERT INTO monthly_salary_claims (user_id, role_id, amount, claim_month, paid_by, description) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, roleId, amount, currentMonth, paidBy, description || ''],
                    (err: any) => {
                      if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                        return;
                      }

                      // 取引履歴を追加
                      this.db.run(
                        'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
                        [null, userId, amount, 'admin_give', `月給支給 (${roleId}) - ${currentMonth}`],
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
              );
            }
          );
        }
      );
    });
  }



  async getMonthlySalaryHistory(userId: string, limit: number = 12): Promise<MonthlySalaryClaim[]> {
    if (this.usePostgreSQL && this.pgDb) {
      try {
        return await this.pgDb.getMonthlySalaryHistory(userId, limit);
      } catch (error) {
        console.error('PostgreSQL getMonthlySalaryHistory failed, falling back to SQLite:', error);
        // PostgreSQL失敗時はSQLiteにフォールバック
      }
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

  // 注意: getAllMonthlySalaryHistoryは現在未実装
  // PostgreSQLDatabaseクラスに対応するメソッドを追加する必要があります

  // 指定月の支給状況確認
  async checkMonthlySalaryStatus(userId: string, month?: string): Promise<MonthlySalaryClaim | null> {
    if (this.usePostgreSQL && this.pgDb) {
      try {
        return await this.pgDb.checkMonthlySalaryStatus(userId, month);
      } catch (error) {
        console.error('PostgreSQL checkMonthlySalaryStatus failed, falling back to SQLite:', error);
        // PostgreSQL失敗時はSQLiteにフォールバック
      }
    }
    
    // SQLiteフォールバック
    const targetMonth = month || new Date().toISOString().substring(0, 7); // YYYY-MM
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

  // トランザクション関連メソッド
  async addTransaction(fromUserId: string | null, toUserId: string, amount: number, type: Transaction['type'], description: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
        [fromUserId, toUserId, amount, type, description],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUserTransactions(userId: string, limit: number = 50): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM transactions WHERE from_user_id = ? OR to_user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, userId, limit],
        (err: any, rows: Transaction[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async transferMoney(fromId: string, toId: string, amount: number, description: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        // 送金者の残高チェック
        this.db.get(
          'SELECT balance FROM users WHERE discord_id = ?',
          [fromId],
          (err: any, fromUser: User) => {
            if (err || !fromUser || fromUser.balance < amount) {
              this.db.run('ROLLBACK');
              resolve(false);
              return;
            }

            // 送金者の残高を減らす
            this.db.run(
              'UPDATE users SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
              [amount, fromId],
              (err: any) => {
                if (err) {
                  this.db.run('ROLLBACK');
                  reject(err);
                  return;
                }

                // 受金者の残高を増やす
                this.db.run(
                  'UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
                  [amount, toId],
                  (err: any) => {
                    if (err) {
                      this.db.run('ROLLBACK');
                      reject(err);
                      return;
                    }

                    // 取引履歴を追加
                    this.db.run(
                      'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
                      [fromId, toId, amount, 'transfer', description],
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
            );
          }
        );
      });
    });
  }

  // ユーザー残高設定メソッド
  async setUserBalance(discordId: string, newBalance: number): Promise<void> {
    return this.updateUserBalance(discordId, newBalance);
  }

  // 給与関連の追加メソッド
  async getSalaryDetails(userId: string, month: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM monthly_salary_claims WHERE user_id = ? AND claim_month = ?',
        [userId, month],
        (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async deleteMonthlySalaryClaim(userId: string, month: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM monthly_salary_claims WHERE user_id = ? AND claim_month = ?',
        [userId, month],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // 一時的な方法：getLatestBulkSalaryResultsは未実装
  async getLatestBulkSalaryResults(_userId: string): Promise<any[]> {
    // 実装されていない機能のため空配列を返す
    return [];
  }

  // VC関連メソッド
  async getTempVC(channelId: string): Promise<TempVC | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM temp_vcs WHERE channel_id = ?',
        [channelId],
        (err: any, row: TempVC) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async addPublicVC(channelId: string, creatorId: string, channelName: string, description?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO public_vcs (channel_id, creator_id, channel_name, description) VALUES (?, ?, ?, ?)',
        [channelId, creatorId, channelName, description || ''],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getActivePublicVCs(): Promise<PublicVC[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM public_vcs ORDER BY last_activity DESC',
        [],
        (err: any, rows: PublicVC[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getPublicVC(channelId: string): Promise<PublicVC | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM public_vcs WHERE channel_id = ?',
        [channelId],
        (err: any, row: PublicVC) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async removePublicVC(channelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM public_vcs WHERE channel_id = ?',
        [channelId],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async addTempVC(channelId: string, creatorId: string, channelName: string, durationHours: number, cost: number, expiresAt: Date): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO temp_vcs (channel_id, creator_id, channel_name, duration_hours, cost_ru, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [channelId, creatorId, channelName, durationHours, cost, expiresAt.toISOString()],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getExpiredTempVCs(): Promise<TempVC[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM temp_vcs WHERE expires_at <= datetime("now")',
        [],
        (err: any, rows: TempVC[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async removeTempVC(channelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM temp_vcs WHERE channel_id = ?',
        [channelId],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Voice session tracking methods
  async startVoiceSession(userId: string, channelId: string, hasAngel: boolean): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO voice_sessions (user_id, channel_id, has_angel_role) VALUES (?, ?, ?)',
        [userId, channelId, hasAngel],
        function(err: any) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async endVoiceSession(sessionId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE voice_sessions SET left_at = CURRENT_TIMESTAMP WHERE id = ?',
        [sessionId],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async updateVoiceTimeLog(userId: string, date: string, totalMinutes: number, angelMinutes: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO voice_time_logs (user_id, date, total_minutes, angel_role_minutes) VALUES (?, ?, ?, ?)',
        [userId, date, totalMinutes, angelMinutes],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getVoiceTimeStats(userId: string, startDate: string, endDate: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM voice_time_logs WHERE user_id = ? AND date BETWEEN ? AND ?',
        [userId, startDate, endDate],
        (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getAngelRoleVoiceStats(startDate: string, endDate: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM voice_time_logs WHERE date BETWEEN ? AND ? AND angel_role_minutes > 0 ORDER BY angel_role_minutes DESC',
        [startDate, endDate],
        (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getActiveVoiceSession(userId: string, channelId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM voice_sessions WHERE user_id = ? AND channel_id = ? AND left_at IS NULL',
        [userId, channelId],
        (err: any, row: any) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  // Special VC methods
  async startSpecialVCSession(userId: string, _channelId: string, _channelName: string, vcType: string, _hasAngel: boolean): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO special_vc_sessions (user_id, vc_type) VALUES (?, ?)',
        [userId, vcType],
        function(err: any) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async endSpecialVCSession(sessionId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE special_vc_sessions SET left_at = CURRENT_TIMESTAMP WHERE id = ?',
        [sessionId],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async updateSpecialVCTimeLog(userId: string, date: string, corridorMinutes: number, evaluationMinutes: number, _angelCorridorMinutes: number, _angelEvaluationMinutes: number, vcType: string): Promise<void> {
    // vcTypeに基づいて適切なカラムを更新
    const menheraMinutes = vcType === 'menhera' ? corridorMinutes : 0;
    const needyMinutes = vcType === 'needy' ? evaluationMinutes : 0;
    
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO special_vc_time_logs (user_id, date, menhera_minutes, needy_minutes) VALUES (?, ?, ?, ?)',
        [userId, date, menheraMinutes, needyMinutes],
        (err: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getSpecialVCStats(userId: string, startDate: string, endDate: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM special_vc_time_logs WHERE user_id = ? AND date BETWEEN ? AND ?',
        [userId, startDate, endDate],
        (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getSpecialVCRanking(vcType: string, startDate: string, endDate: string): Promise<any[]> {
    const column = vcType === 'menhera' ? 'menhera_minutes' : 'needy_minutes';
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM special_vc_time_logs WHERE date BETWEEN ? AND ? AND ${column} > 0 ORDER BY ${column} DESC`,
        [startDate, endDate],
        (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }
}