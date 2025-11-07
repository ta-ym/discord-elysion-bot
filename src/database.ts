
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
  private pgDb: PostgreSQLDatabase | null;

  constructor() {
    // PostgreSQL専用モード - SQLiteフォールバックなし
    if (!process.env['DATABASE_URL']) {
      throw new Error('DATABASE_URL environment variable is required for PostgreSQL-only mode');
    }

    // DATABASE_URLの形式をチェック
    const dbUrl = process.env['DATABASE_URL'];
    if (dbUrl.includes('username:password@host:port') || dbUrl === 'postgresql://username:password@host:port/database') {
      throw new Error('DATABASE_URL is not properly configured - contains placeholder values');
    }
    
    console.log('=== PostgreSQL専用モード ===');
    console.log('PostgreSQL接続情報: {');
    console.log(`  url: '${dbUrl.replace(/\/\/[^:]+:[^@]+@/, '//****:****@')}',`);
    console.log(`  isProduction: ${process.env['NODE_ENV'] === 'production'}`);
    console.log('}');
    console.log('PostgreSQL通貨システムを初期化中...');
    
    this.pgDb = new PostgreSQLDatabase();
    
    // PostgreSQL接続の健全性チェック（フォールバックなし）
    setTimeout(async () => {
      try {
        await this.checkPostgreSQLHealth();
        console.log('PostgreSQL接続確認完了 - 正常に動作しています');
      } catch (healthError) {
        console.error('PostgreSQL健全性チェック失敗:', healthError);
        console.error('重要: PostgreSQL専用モードのため、SQLiteフォールバックは無効です');
        console.error('PostgreSQL接続を修復してください');
      }
    }, 3000);
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

  // ユーザー関連メソッド（PostgreSQL専用）
  async getUser(discordId: string): Promise<User | null> {
    if (!this.pgDb) {
      throw new Error('PostgreSQL connection not available - PostgreSQL-only mode requires working database connection');
    }
    return await this.pgDb.getUser(discordId);
  }

  async createUser(discordId: string): Promise<User> {
    if (!this.pgDb) {
      throw new Error('PostgreSQL connection not available - PostgreSQL-only mode requires working database connection');
    }
    return await this.pgDb.createUser(discordId);
  }

  async updateUserBalance(discordId: string, newBalance: number): Promise<void> {
    if (!this.pgDb) {
      throw new Error('PostgreSQL connection not available - PostgreSQL-only mode requires working database connection');
    }
    return await this.pgDb.updateUserBalance(discordId, newBalance);
  }

  // システムによる支給（管理者IDなし）
  async giveMoney(toId: string, amount: number, description: string): Promise<void> {
    if (!this.pgDb) {
      throw new Error('PostgreSQL connection not available - PostgreSQL-only mode requires working database connection');
    }
    return await this.pgDb.giveMoney(toId, amount, description);
  }

  // 注意: 日次給与システムは廃止され、月給システムのみ使用されています

  // 月給支給メソッド
  async payMonthlySalary(userId: string, roleId: string, amount: number, paidBy: string, description?: string): Promise<boolean> {
    if (!this.pgDb) {
      throw new Error('PostgreSQL database connection is required');
    }
    
    console.log(`[DATABASE] Using PostgreSQL for payMonthlySalary: ${userId}`);
    return await this.pgDb.payMonthlySalary(userId, roleId, amount, paidBy, description);
  }



  async getMonthlySalaryHistory(userId: string, limit: number = 12): Promise<MonthlySalaryClaim[]> {
    if (!this.pgDb) {
      throw new Error('PostgreSQL database connection is required');
    }
    
    return await this.pgDb.getMonthlySalaryHistory(userId, limit);
  }

  // 注意: getAllMonthlySalaryHistoryは現在未実装
  // PostgreSQLDatabaseクラスに対応するメソッドを追加する必要があります

  // 指定月の支給状況確認
  async checkMonthlySalaryStatus(userId: string, month?: string): Promise<MonthlySalaryClaim | null> {
    if (!this.pgDb) {
      throw new Error('PostgreSQL connection not available - PostgreSQL-only mode requires working database connection');
    }
    return await this.pgDb.checkMonthlySalaryStatus(userId, month);
  }
}