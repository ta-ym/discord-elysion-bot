import sqlite3 from 'sqlite3';
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

export interface MonthlySalaryClaim {
  id: number;
  user_id: string;
  role_name: string;
  amount: number;
  claim_month: string; // YYYY-MM format
  paid_by: string; // 支給した管理者のID
  description?: string;
  created_at: string;
}

export class Database {
  private db: sqlite3.Database;

  constructor() {
    const dbPath = path.join(__dirname, '..', 'data', 'elysion.db');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.initializeTables();
      }
    });
  }

  private initializeTables(): void {
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
        type TEXT NOT NULL CHECK (type IN ('transfer', 'admin_give', 'vc_purchase')),
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // シークレットVCテーブル
    this.db.run(`
      CREATE TABLE IF NOT EXISTS secret_vcs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT UNIQUE NOT NULL,
        creator_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 月給支給テーブル
    this.db.run(`
      CREATE TABLE IF NOT EXISTS monthly_salary_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role_name TEXT NOT NULL,
        amount INTEGER NOT NULL,
        claim_month TEXT NOT NULL,
        paid_by TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, claim_month)
      )
    `);

    console.log('Database tables initialized');
  }

  // ユーザー関連メソッド
  async getUser(discordId: string): Promise<User | null> {
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
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (discord_id) VALUES (?)',
        [discordId],
        function(err) {
          if (err) reject(err);
          else {
            // 作成したユーザーを取得
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

  async updateUserBalance(discordId: string, newBalance: number): Promise<void> {
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

  // 取引履歴関連メソッド
  async addTransaction(
    fromUserId: string | null,
    toUserId: string,
    amount: number,
    type: 'transfer' | 'admin_give' | 'vc_purchase',
    description: string
  ): Promise<void> {
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

  // シークレットVC関連メソッド
  async addSecretVC(channelId: string, creatorId: string, channelName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO secret_vcs (channel_id, creator_id, channel_name) VALUES (?, ?, ?)',
        [channelId, creatorId, channelName],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async updateVCActivity(channelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE secret_vcs SET last_activity = CURRENT_TIMESTAMP WHERE channel_id = ?',
        [channelId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getSecretVC(channelId: string): Promise<SecretVC | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM secret_vcs WHERE channel_id = ?',
        [channelId],
        (err, row: SecretVC) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async removeSecretVC(channelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM secret_vcs WHERE channel_id = ?',
        [channelId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getInactiveVCs(minutesAgo: number = 5): Promise<SecretVC[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM secret_vcs 
         WHERE datetime(last_activity) <= datetime('now', '-${minutesAgo} minutes')`,
        (err, rows: SecretVC[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // トランザクション処理
  async transferMoney(fromId: string, toId: string, amount: number, description: string): Promise<boolean> {
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
  async payMonthlySalary(userId: string, roleName: string, amount: number, paidBy: string, description?: string): Promise<boolean> {
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
                  this.insertMonthlySalaryClaim(userId, roleName, amount, currentMonth, paidBy, description, resolve, reject);
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
    roleName: string, 
    amount: number, 
    claimMonth: string, 
    paidBy: string, 
    description: string | undefined, 
    resolve: Function, 
    reject: Function
  ): void {
    // 月給支給記録を追加
    this.db.run(
      'INSERT INTO monthly_salary_claims (user_id, role_name, amount, claim_month, paid_by, description) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, roleName, amount, claimMonth, paidBy, description || ''],
      (err: any) => {
        if (err) {
          this.db.run('ROLLBACK');
          reject(err);
          return;
        }

        // 取引履歴を追加
        this.db.run(
          'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
          [null, userId, amount, 'admin_give', `月給支給 (${roleName}) - ${claimMonth}`],
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