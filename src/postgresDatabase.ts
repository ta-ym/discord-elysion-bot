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
    if (!process.env['DATABASE_URL']) {
      throw new Error('DATABASE_URL環境変数が設定されていません');
    }

    console.log('PostgreSQL接続情報:', {
      url: process.env['DATABASE_URL']?.replace(/:[^:@]*@/, ':****@'), // パスワード隠す
      isProduction: process.env['NODE_ENV'] === 'production'
    });

    // Railway PostgreSQL接続設定（安定性重視）
    this.pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
      // Railway環境用の安定した接続設定
      connectionTimeoutMillis: 30000, // 30秒でタイムアウト（Railway用に延長）
      idleTimeoutMillis: 30000, // 30秒でアイドル接続を終了
      max: 3, // 最大接続数を抑制（Railway制限対応）
      min: 0, // 最小接続数は0
      // クエリタイムアウト設定
      query_timeout: 15000, // 15秒でクエリタイムアウト
      // 接続設定
      application_name: 'elysion-bot',
      // Railway環境での安定性設定
      statement_timeout: 15000, // ステートメントタイムアウト
      idle_in_transaction_session_timeout: 10000, // トランザクション内アイドルタイムアウト
      // 接続リトライ設定
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });

    // 非同期初期化を実行（リトライ機能付き）
    this.initializeWithRetry(3).catch(error => {
      console.error('PostgreSQL初期化最終エラー:', error);
      console.error('ボット起動を継続しますが、通貨機能は利用できません');
    });
  }

  private async initializeWithRetry(maxRetries: number): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`PostgreSQL初期化試行 ${attempt}/${maxRetries} (タイムアウト: 30秒)`);
        
        // タイムアウト付きで初期化を実行（Railway用に延長）
        await Promise.race([
          this.initializeTables(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Initialization timeout after 30 seconds')), 30000)
          )
        ]);
        
        console.log('PostgreSQL初期化成功');
        return;
      } catch (error) {
        console.error(`PostgreSQL初期化試行 ${attempt} 失敗:`, error);
        
        // 接続エラーの詳細ログ
        if (error instanceof Error) {
          console.error(`接続エラー詳細: ${error.message}`);
          console.error(`エラースタック: ${error.stack}`);
        }
        
        if (attempt === maxRetries) {
          console.error('PostgreSQL初期化の最大リトライ回数に達しました');
          throw error; // 最後の試行で失敗した場合は例外を投げる
        }
        
        // リトライ前に待機（指数バックオフ）
        const initWaitTime = attempt * 2000; // 2秒、4秒、6秒...
        console.log(`${initWaitTime}ms待機してからリトライします...`);
        await new Promise(resolve => setTimeout(resolve, initWaitTime));
        
        // より短い待機時間（1秒、2秒のみ）
        const waitTime = attempt * 1000;
        console.log(`${waitTime}ms待機してリトライします...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
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

      // VC関連テーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS public_vcs (
          id SERIAL PRIMARY KEY,
          channel_id TEXT UNIQUE NOT NULL,
          creator_id TEXT NOT NULL,
          channel_name TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS temp_vcs (
          id SERIAL PRIMARY KEY,
          channel_id TEXT UNIQUE NOT NULL,
          creator_id TEXT NOT NULL,
          channel_name TEXT NOT NULL,
          duration_hours INTEGER NOT NULL,
          cost_ru INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS voice_sessions (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          left_at TIMESTAMP,
          duration_minutes INTEGER,
          has_angel_role BOOLEAN DEFAULT FALSE
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS voice_time_logs (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          date TEXT NOT NULL,
          total_minutes INTEGER DEFAULT 0,
          angel_role_minutes INTEGER DEFAULT 0,
          sessions_count INTEGER DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, date)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS special_vc_sessions (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          vc_type TEXT NOT NULL CHECK (vc_type IN ('corridor', 'evaluation')),
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          left_at TIMESTAMP,
          duration_minutes INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS special_vc_time_logs (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          date TEXT NOT NULL,
          corridor_minutes INTEGER DEFAULT 0,
          evaluation_minutes INTEGER DEFAULT 0,
          angel_corridor_minutes INTEGER DEFAULT 0,
          angel_evaluation_minutes INTEGER DEFAULT 0,
          corridor_sessions INTEGER DEFAULT 0,
          evaluation_sessions INTEGER DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, date)
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
      await client.query(`CREATE INDEX IF NOT EXISTS idx_public_vcs_channel_id ON public_vcs(channel_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_temp_vcs_channel_id ON temp_vcs(channel_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_temp_vcs_expires_at ON temp_vcs(expires_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_id ON voice_sessions(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_voice_time_logs_user_date ON voice_time_logs(user_id, date)`);

      // 既存の制約を更新（corridor, evaluationに対応）
      try {
        await client.query(`ALTER TABLE special_vc_sessions DROP CONSTRAINT IF EXISTS special_vc_sessions_vc_type_check`);
        await client.query(`ALTER TABLE special_vc_sessions ADD CONSTRAINT special_vc_sessions_vc_type_check CHECK (vc_type IN ('corridor', 'evaluation'))`);
        console.log('special_vc_sessions制約を更新しました (corridor, evaluation)');
      } catch (constraintError) {
        console.warn('特別VC制約更新でエラー（既に正しい可能性）:', constraintError);
      }

      // special_vc_time_logsテーブルに新しいカラムを追加（マイグレーション）
      try {
        await client.query(`ALTER TABLE special_vc_time_logs ADD COLUMN IF NOT EXISTS corridor_minutes INTEGER DEFAULT 0`);
        await client.query(`ALTER TABLE special_vc_time_logs ADD COLUMN IF NOT EXISTS evaluation_minutes INTEGER DEFAULT 0`);
        await client.query(`ALTER TABLE special_vc_time_logs ADD COLUMN IF NOT EXISTS angel_corridor_minutes INTEGER DEFAULT 0`);
        await client.query(`ALTER TABLE special_vc_time_logs ADD COLUMN IF NOT EXISTS angel_evaluation_minutes INTEGER DEFAULT 0`);
        await client.query(`ALTER TABLE special_vc_time_logs ADD COLUMN IF NOT EXISTS corridor_sessions INTEGER DEFAULT 0`);
        await client.query(`ALTER TABLE special_vc_time_logs ADD COLUMN IF NOT EXISTS evaluation_sessions INTEGER DEFAULT 0`);
        console.log('special_vc_time_logsテーブルに新しいカラムを追加しました');
      } catch (columnError) {
        console.warn('特別VCカラム追加でエラー（既に存在する可能性）:', columnError);
      }

      await client.query('COMMIT');
      console.log('PostgreSQL全テーブル初期化完了');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error initializing PostgreSQL tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 健全性チェック（リトライとタイムアウト機能付き）
  async healthCheck(): Promise<void> {
    const maxRetries = 3;
    const timeout = 15000; // 15秒タイムアウト
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let client: any = null;
      try {
        console.log(`PostgreSQLヘルスチェック試行 ${attempt}/${maxRetries}`);
        
        // タイムアウト付きで接続とクエリを実行
        const healthCheckPromise = (async () => {
          client = await this.pool.connect();
          const result = await client.query('SELECT 1 as test, NOW() as current_time');
          if (!result.rows || result.rows.length === 0) {
            throw new Error('Health check query returned no results');
          }
          console.log('PostgreSQLヘルスチェック成功:', result.rows[0]);
          return result;
        })();
        
        await Promise.race([
          healthCheckPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Health check timeout after ${timeout}ms`)), timeout)
          )
        ]);
        
        return; // 成功したら終了
        
      } catch (error) {
        console.error(`PostgreSQLヘルスチェック試行 ${attempt} 失敗:`, error);
        
        if (attempt === maxRetries) {
          throw new Error(`PostgreSQL health check failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // 次の試行まで待機
        const healthWaitTime = attempt * 1000; // 1秒、2秒、3秒
        console.log(`${healthWaitTime}ms待機してからリトライします...`);
        await new Promise(resolve => setTimeout(resolve, healthWaitTime));
        
      } finally {
        if (client) {
          try {
            client.release();
          } catch (releaseError) {
            console.error('Client release error:', releaseError);
          }
        }
      }
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

  // ユーザーの残高を設定（存在しない場合は作成）
  async setUserBalance(discordId: string, newBalance: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO users (discord_id, balance) VALUES ($1, $2)
         ON CONFLICT(discord_id) DO UPDATE SET 
         balance = EXCLUDED.balance, 
         updated_at = CURRENT_TIMESTAMP`,
        [discordId, newBalance]
      );
    } catch (error) {
      console.error('Error in setUserBalance:', error);
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

  // 給与詳細取得
  async getSalaryDetails(userId: string, month: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM monthly_salary_claims WHERE user_id = $1 AND claim_month = $2 ORDER BY created_at DESC',
        [userId, month]
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getSalaryDetails:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Bulk Salary結果を保存
  async saveBulkSalaryResults(results: any[], processedBy: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 一時的な結果保存テーブルを作成（存在しない場合）
      await client.query(`
        CREATE TABLE IF NOT EXISTS bulk_salary_results (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('success', 'skipped', 'error')),
          amount INTEGER,
          reason TEXT,
          processed_by TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 古い結果を削除（24時間以上前）
      await client.query(
        'DELETE FROM bulk_salary_results WHERE created_at < NOW() - INTERVAL \'24 hours\''
      );

      // 新しい結果を保存
      for (const result of results) {
        await client.query(
          'INSERT INTO bulk_salary_results (user_id, status, amount, reason, processed_by) VALUES ($1, $2, $3, $4, $5)',
          [result.userId, result.status, result.amount || null, result.reason || null, processedBy]
        );
      }

      await client.query('COMMIT');
      console.log(`[PostgreSQL] Saved ${results.length} bulk salary results for ${processedBy}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in saveBulkSalaryResults:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 最新のBulk Salary結果を取得
  async getLatestBulkSalaryResults(processedBy: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      // 最新の1時間以内の結果を取得
      const result = await client.query(
        `SELECT * FROM bulk_salary_results 
         WHERE processed_by = $1 
         AND created_at > NOW() - INTERVAL '1 hour'
         ORDER BY created_at DESC`,
        [processedBy]
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getLatestBulkSalaryResults:', error);
      return []; // エラーの場合は空配列を返す
    } finally {
      client.release();
    }
  }

  // VC関連メソッド
  async getTempVC(channelId: string): Promise<any | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM temp_vcs WHERE channel_id = $1',
        [channelId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error in getTempVC:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async addPublicVC(channelId: string, creatorId: string, channelName: string, description?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'INSERT INTO public_vcs (channel_id, creator_id, channel_name, description) VALUES ($1, $2, $3, $4)',
        [channelId, creatorId, channelName, description || '']
      );
    } catch (error) {
      console.error('Error in addPublicVC:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getActivePublicVCs(): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM public_vcs ORDER BY last_activity DESC'
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getActivePublicVCs:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPublicVC(channelId: string): Promise<any | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM public_vcs WHERE channel_id = $1',
        [channelId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error in getPublicVC:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async removePublicVC(channelId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'DELETE FROM public_vcs WHERE channel_id = $1',
        [channelId]
      );
    } catch (error) {
      console.error('Error in removePublicVC:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async addTempVC(channelId: string, creatorId: string, channelName: string, durationHours: number, cost: number, expiresAt: Date): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'INSERT INTO temp_vcs (channel_id, creator_id, channel_name, duration_hours, cost_ru, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [channelId, creatorId, channelName, durationHours, cost, expiresAt.toISOString()]
      );
    } catch (error) {
      console.error('Error in addTempVC:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getExpiredTempVCs(): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM temp_vcs WHERE expires_at <= NOW()'
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getExpiredTempVCs:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async removeTempVC(channelId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'DELETE FROM temp_vcs WHERE channel_id = $1',
        [channelId]
      );
    } catch (error) {
      console.error('Error in removeTempVC:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Voice session tracking methods
  async startVoiceSession(userId: string, channelId: string, hasAngel: boolean): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO voice_sessions (user_id, channel_id, has_angel_role) VALUES ($1, $2, $3) RETURNING id',
        [userId, channelId, hasAngel]
      );
      return result.rows[0].id;
    } catch (error) {
      console.error('Error in startVoiceSession:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async endVoiceSession(sessionId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'UPDATE voice_sessions SET left_at = NOW() WHERE id = $1',
        [sessionId]
      );
    } catch (error) {
      console.error('Error in endVoiceSession:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateVoiceTimeLog(userId: string, date: string, totalMinutes: number, angelMinutes: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO voice_time_logs (user_id, date, total_minutes, angel_role_minutes) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, date) 
         DO UPDATE SET 
           total_minutes = $3, 
           angel_role_minutes = $4, 
           updated_at = NOW()`,
        [userId, date, totalMinutes, angelMinutes]
      );
    } catch (error) {
      console.error('Error in updateVoiceTimeLog:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getVoiceTimeStats(userId: string, startDate: string, endDate: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM voice_time_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3',
        [userId, startDate, endDate]
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getVoiceTimeStats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getAngelRoleVoiceStats(startDate: string, endDate: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM voice_time_logs WHERE date BETWEEN $1 AND $2 AND angel_role_minutes > 0 ORDER BY angel_role_minutes DESC',
        [startDate, endDate]
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getAngelRoleVoiceStats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getActiveVoiceSession(userId: string, channelId: string): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM voice_sessions WHERE user_id = $1 AND channel_id = $2 AND left_at IS NULL',
        [userId, channelId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error in getActiveVoiceSession:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Special VC methods
  async startSpecialVCSession(userId: string, _channelId: string, _channelName: string, vcType: string, _hasAngel: boolean): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO special_vc_sessions (user_id, vc_type) VALUES ($1, $2) RETURNING id',
        [userId, vcType]
      );
      return result.rows[0].id;
    } catch (error) {
      console.error('Error in startSpecialVCSession:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async endSpecialVCSession(sessionId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'UPDATE special_vc_sessions SET left_at = NOW() WHERE id = $1',
        [sessionId]
      );
    } catch (error) {
      console.error('Error in endSpecialVCSession:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateSpecialVCTimeLog(userId: string, date: string, corridorMinutes: number, evaluationMinutes: number, angelCorridorMinutes: number, angelEvaluationMinutes: number, vcType: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sessionCount = 1; // 1回のセッション終了
      
      await client.query(
        `INSERT INTO special_vc_time_logs (user_id, date, corridor_minutes, evaluation_minutes, angel_corridor_minutes, angel_evaluation_minutes, corridor_sessions, evaluation_sessions) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, date) 
         DO UPDATE SET 
           corridor_minutes = special_vc_time_logs.corridor_minutes + $3,
           evaluation_minutes = special_vc_time_logs.evaluation_minutes + $4,
           angel_corridor_minutes = special_vc_time_logs.angel_corridor_minutes + $5,
           angel_evaluation_minutes = special_vc_time_logs.angel_evaluation_minutes + $6,
           corridor_sessions = special_vc_time_logs.corridor_sessions + $7,
           evaluation_sessions = special_vc_time_logs.evaluation_sessions + $8,
           updated_at = NOW()`,
        [userId, date, corridorMinutes, evaluationMinutes, angelCorridorMinutes, angelEvaluationMinutes, 
         vcType === 'corridor' ? sessionCount : 0, vcType === 'evaluation' ? sessionCount : 0]
      );
    } catch (error) {
      console.error('Error in updateSpecialVCTimeLog:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getSpecialVCStats(userId: string, startDate: string, endDate: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM special_vc_time_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3',
        [userId, startDate, endDate]
      );
      return result.rows;
    } catch (error) {
      console.error('Error in getSpecialVCStats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getSpecialVCRanking(vcType: string, startDate: string, endDate: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      let query: string;
      if (vcType === 'corridor') {
        query = `SELECT user_id, date, corridor_minutes as total_minutes, angel_corridor_minutes as total_angel_minutes, corridor_sessions as total_sessions FROM special_vc_time_logs WHERE date BETWEEN $1 AND $2 AND corridor_minutes > 0 ORDER BY corridor_minutes DESC`;
      } else if (vcType === 'evaluation') {
        query = `SELECT user_id, date, evaluation_minutes as total_minutes, angel_evaluation_minutes as total_angel_minutes, evaluation_sessions as total_sessions FROM special_vc_time_logs WHERE date BETWEEN $1 AND $2 AND evaluation_minutes > 0 ORDER BY evaluation_minutes DESC`;
      } else {
        // 'both'の場合
        query = `SELECT user_id, date, (corridor_minutes + evaluation_minutes) as total_minutes, (angel_corridor_minutes + angel_evaluation_minutes) as total_angel_minutes, (corridor_sessions + evaluation_sessions) as total_sessions FROM special_vc_time_logs WHERE date BETWEEN $1 AND $2 AND (corridor_minutes > 0 OR evaluation_minutes > 0) ORDER BY (corridor_minutes + evaluation_minutes) DESC`;
      }
      
      const result = await client.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('Error in getSpecialVCRanking:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 追加のトランザクション関連メソッド
  async addTransaction(fromUserId: string | null, toUserId: string, amount: number, type: string, description: string): Promise<void> {
    await this.createTransaction(fromUserId, toUserId, amount, type as any, description);
  }

  async getUserTransactions(userId: string, limit: number = 50): Promise<any[]> {
    return await this.getTransactionHistory(userId, limit);
  }

  // 接続終了
  async close(): Promise<void> {
    await this.pool.end();
  }
}