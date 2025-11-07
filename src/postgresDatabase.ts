import { Pool } from 'pg';

// インターフェース定義（既存のものをインポート）
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

export interface SalaryConfig {
  id: number;
  role_id: string;
  role_name: string;
  amount: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export class PostgreSQLDatabase {
  private pool: Pool;

  constructor() {
    // DATABASE_URL環境変数のチェック
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL環境変数が設定されていません');
    }

    console.log('PostgreSQL接続情報:', {
      url: process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':****@'), // パスワード隠す
      isProduction: process.env.NODE_ENV === 'production'
    });

    // Railway PostgreSQL接続設定
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    // 非同期初期化を実行（エラーハンドリング付き）
    this.initializeTables().catch(error => {
      console.error('PostgreSQL初期化エラー:', error);
      console.error('ボット起動を継続しますが、通貨機能は利用できません');
    });
  }

  private async initializeTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // トランザクション開始
      await client.query('BEGIN');

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
          type TEXT NOT NULL CHECK (type IN ('transfer', 'admin_give', 'vc_purchase', 'salary', 'voice_reward')),
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

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

      // インデックス作成
      await client.query(`CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_to_user_id ON transactions(to_user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_from_user_id ON transactions(from_user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_salary_configs_role_id ON salary_configs(role_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_monthly_salary_claims_user_id ON monthly_salary_claims(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_monthly_salary_claims_claim_month ON monthly_salary_claims(claim_month)`);

      await client.query('COMMIT');
      console.log('PostgreSQL currency tables initialized');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error initializing PostgreSQL tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ユーザー関連メソッド
  async getUser(discordId: string): Promise<User | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM users WHERE discord_id = $1',
        [discordId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error in getUser:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async createUser(discordId: string): Promise<User> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO users (discord_id, balance) 
         VALUES ($1, 10000) 
         RETURNING *`,
        [discordId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error in createUser:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateUserBalance(discordId: string, newBalance: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'UPDATE users SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
        [newBalance, discordId]
      );
    } catch (error) {
      console.error('Error in updateUserBalance:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 取引関連メソッド
  async createTransaction(
    fromUserId: string | null,
    toUserId: string,
    amount: number,
    type: Transaction['type'],
    description?: string
  ): Promise<Transaction> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [fromUserId, toUserId, amount, type, description]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error in createTransaction:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getTransactionHistory(
    discordId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<Transaction[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM transactions 
         WHERE from_user_id = $1 OR to_user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [discordId, limit, offset]
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getTransactionHistory:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 月給関連メソッド
  async getSalaryConfigs(): Promise<SalaryConfig[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM salary_configs WHERE enabled = TRUE ORDER BY amount DESC'
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getSalaryConfigs:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async setSalaryConfig(roleId: string, roleName: string, amount: number): Promise<SalaryConfig> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO salary_configs (role_id, role_name, amount) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (role_id) 
         DO UPDATE SET role_name = $2, amount = $3, updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [roleId, roleName, amount]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error in setSalaryConfig:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async hasSalaryClaim(userId: string, month: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT COUNT(*) as count FROM monthly_salary_claims WHERE user_id = $1 AND claim_month = $2',
        [userId, month]
      );
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('Error in hasSalaryClaim:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async createSalaryClaim(
    userId: string,
    roleId: string,
    amount: number,
    month: string,
    paidBy: string,
    description?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO monthly_salary_claims (user_id, role_id, amount, claim_month, paid_by, description) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, roleId, amount, month, paidBy, description]
      );
    } catch (error) {
      console.error('Error in createSalaryClaim:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getSalaryHistory(userId: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          msc.*,
          sc.role_name
         FROM monthly_salary_claims msc
         LEFT JOIN salary_configs sc ON msc.role_id = sc.role_id
         WHERE msc.user_id = $1
         ORDER BY msc.created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getSalaryHistory:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 送金処理
  async transferMoney(fromId: string, toId: string, amount: number, description: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      console.log(`[POSTGRES] Starting transferMoney: ${fromId} -> ${toId}, amount: ${amount}`);
      await client.query('BEGIN');

      // 送金者の残高チェック
      const senderResult = await client.query(
        'SELECT balance FROM users WHERE discord_id = $1',
        [fromId]
      );
      
      console.log(`[POSTGRES] Sender query result:`, senderResult.rows);

      if (senderResult.rows.length === 0 || senderResult.rows[0].balance < amount) {
        console.log(`[POSTGRES] Transfer failed: insufficient balance or user not found`);
        await client.query('ROLLBACK');
        return false;
      }

      // 受取人が存在するかチェック（存在しない場合は作成）
      const receiverCheck = await client.query(
        'SELECT discord_id FROM users WHERE discord_id = $1',
        [toId]
      );
      
      if (receiverCheck.rows.length === 0) {
        console.log(`[POSTGRES] Creating receiver user: ${toId}`);
        await client.query(
          'INSERT INTO users (discord_id, balance) VALUES ($1, 10000)',
          [toId]
        );
      }

      // 送金者の残高を減額
      const updateSender = await client.query(
        'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
        [amount, fromId]
      );
      console.log(`[POSTGRES] Sender balance updated, affected rows:`, updateSender.rowCount);

      // 受取人の残高を増額
      const updateReceiver = await client.query(
        'UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
        [amount, toId]
      );
      console.log(`[POSTGRES] Receiver balance updated, affected rows:`, updateReceiver.rowCount);

      // 取引履歴を記録
      const insertTransaction = await client.query(
        'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [fromId, toId, amount, 'transfer', description]
      );
      console.log(`[POSTGRES] Transaction recorded, affected rows:`, insertTransaction.rowCount);

      await client.query('COMMIT');
      console.log(`[POSTGRES] Transfer completed successfully`);
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in transferMoney:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 管理者による支給（残高チェック不要）
  async giveMoney(toId: string, amount: number, description: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

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
        [null, toId, amount, 'admin_give', description]
      );

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in giveMoney:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 管理者による支給（管理者ID付き）
  async adminGiveMoney(adminId: string, toId: string, amount: number, description: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 受取人の残高を増額（ユーザーが存在しない場合は作成）
      await client.query(
        `INSERT INTO users (discord_id, balance) VALUES ($1, 10000 + $2)
         ON CONFLICT(discord_id) DO UPDATE SET 
         balance = users.balance + $2, updated_at = CURRENT_TIMESTAMP`,
        [toId, amount]
      );

      // 取引履歴を記録（管理者IDを記録）
      await client.query(
        'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [adminId, toId, amount, 'admin_give', description]
      );

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in adminGiveMoney:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 月給支給メソッド
  async payMonthlySalary(userId: string, roleId: string, amount: number, paidBy: string, description?: string): Promise<boolean> {
    const client = await this.pool.connect();
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    try {
      console.log(`[PostgreSQL] Starting transaction for user ${userId}`);
      await client.query('BEGIN');

      // ユーザーの残高を増額（存在しない場合は作成）
      console.log(`[PostgreSQL] Updating user balance for ${userId} with amount ${amount}`);
      await client.query(
        `INSERT INTO users (discord_id, balance) VALUES ($1, 10000 + $2)
         ON CONFLICT(discord_id) DO UPDATE SET 
         balance = users.balance + $2, updated_at = CURRENT_TIMESTAMP`,
        [userId, amount]
      );

      // 月給支給記録を作成（UPSERT: 既存の場合は金額を累積）
      console.log(`[PostgreSQL] Creating/updating salary claim record for user ${userId}`);
      await client.query(
        `INSERT INTO monthly_salary_claims (user_id, role_id, amount, claim_month, paid_by, description) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, claim_month) 
         DO UPDATE SET 
           role_id = EXCLUDED.role_id,
           amount = monthly_salary_claims.amount + EXCLUDED.amount,
           paid_by = EXCLUDED.paid_by,
           description = EXCLUDED.description,
           created_at = CURRENT_TIMESTAMP`,
        [userId, roleId, amount, currentMonth, paidBy, description || '月給支給']
      );

      // 取引履歴を記録
      console.log(`[PostgreSQL] Creating transaction record for user ${userId}`);
      await client.query(
        'INSERT INTO transactions (from_user_id, to_user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [null, userId, amount, 'salary', description || `月給支給 (${roleId})`]
      );

      console.log(`[PostgreSQL] Committing transaction for user ${userId}`);
      await client.query('COMMIT');
      console.log(`[PostgreSQL] Successfully processed salary for user ${userId}`);
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[PostgreSQL] Error in payMonthlySalary:', error);
      console.error('[PostgreSQL] payMonthlySalary parameters:', {
        userId,
        roleId,
        amount,
        paidBy,
        description,
        currentMonth
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // 月給支給状況確認
  async checkMonthlySalaryStatus(userId: string, month?: string): Promise<any> {
    const client = await this.pool.connect();
    const targetMonth = month || new Date().toISOString().substring(0, 7);
    
    try {
      const result = await client.query(
        'SELECT * FROM monthly_salary_claims WHERE user_id = $1 AND claim_month = $2',
        [userId, targetMonth]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error in checkMonthlySalaryStatus:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 月給履歴取得
  async getMonthlySalaryHistory(userId: string, limit: number = 12): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM monthly_salary_claims WHERE user_id = $1 ORDER BY claim_month DESC LIMIT $2',
        [userId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getMonthlySalaryHistory:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 月給支給記録削除（ロールバック用）
  async deleteMonthlySalaryClaim(userId: string, month: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM monthly_salary_claims WHERE user_id = $1 AND claim_month = $2',
        [userId, month]
      );
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error in deleteMonthlySalaryClaim:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 全ユーザー取得（balance-reset-all用）
  async getAllUsers(): Promise<User[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM users ORDER BY discord_id');
      return result.rows;
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 接続終了
  async close(): Promise<void> {
    await this.pool.end();
  }
}