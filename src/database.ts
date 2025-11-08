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
  private pgDb: PostgreSQLDatabase;

  constructor() {
    // PostgreSQL専用データベースの初期化
    if (!process.env['DATABASE_URL']) {
      throw new Error('DATABASE_URL環境変数が必要です。PostgreSQL専用モードで動作します。');
    }

    const dbUrl = process.env['DATABASE_URL'];
    if (dbUrl.includes('username:password@host:port') || dbUrl === 'postgresql://username:password@host:port/database') {
      throw new Error('PostgreSQL設定が無効です。正しいDATABASE_URLを設定してください。');
    }

    console.log('=== PostgreSQL専用モード ===');
    console.log('全ての機能がPostgreSQLで動作します');
    console.log(`PostgreSQL URL: '${dbUrl.replace(/\/\/[^:]+:[^@]+@/, '//****:****@')}'`);
    
    this.pgDb = new PostgreSQLDatabase();

    // PostgreSQL接続の健全性チェック
    setTimeout(async () => {
      try {
        await this.checkPostgreSQLHealth();
        console.log('PostgreSQL接続確認完了 - 全機能利用可能');
      } catch (healthError) {
        console.error('PostgreSQL接続失敗:', healthError);
        throw new Error('PostgreSQLに接続できません。アプリケーションを終了します。');
      }
    }, 3000);
  }

  // PostgreSQL健全性チェック
  private async checkPostgreSQLHealth(): Promise<void> {
    await this.pgDb.healthCheck();
    console.log('PostgreSQL健全性チェック完了');
  }

  // ユーザー関連メソッド（PostgreSQL専用）
  async getUser(discordId: string): Promise<User | null> {
    return await this.pgDb.getUser(discordId);
  }

  async createUser(discordId: string): Promise<User> {
    return await this.pgDb.createUser(discordId);
  }

  async updateUserBalance(discordId: string, newBalance: number): Promise<void> {
    return await this.pgDb.updateUserBalance(discordId, newBalance);
  }

  // システムによる支給（管理者IDなし）
  async giveMoney(toId: string, amount: number, description: string): Promise<void> {
    return await this.pgDb.giveMoney(toId, amount, description);
  }

  // 月給支給メソッド（PostgreSQL専用）
  async payMonthlySalary(userId: string, roleId: string, amount: number, paidBy: string, description?: string): Promise<boolean> {
    return await this.pgDb.payMonthlySalary(userId, roleId, amount, paidBy, description);
  }

  async getMonthlySalaryHistory(userId: string, limit: number = 12): Promise<MonthlySalaryClaim[]> {
    return await this.pgDb.getMonthlySalaryHistory(userId, limit);
  }

  // 指定月の支給状況確認
  async checkMonthlySalaryStatus(userId: string, month?: string): Promise<MonthlySalaryClaim | null> {
    return await this.pgDb.checkMonthlySalaryStatus(userId, month);
  }

  // トランザクション関連メソッド
  async addTransaction(fromUserId: string | null, toUserId: string, amount: number, type: Transaction['type'], description: string): Promise<void> {
    return await this.pgDb.addTransaction(fromUserId, toUserId, amount, type, description);
  }

  async getUserTransactions(userId: string, limit: number = 50): Promise<Transaction[]> {
    return await this.pgDb.getUserTransactions(userId, limit);
  }

  async transferMoney(fromId: string, toId: string, amount: number, description: string): Promise<boolean> {
    return await this.pgDb.transferMoney(fromId, toId, amount, description);
  }

  // ユーザー残高設定メソッド（PostgreSQL専用）
  async setUserBalance(discordId: string, newBalance: number): Promise<void> {
    return await this.pgDb.setUserBalance(discordId, newBalance);
  }

  // 全ユーザー取得メソッド（balance-reset-all用、PostgreSQL専用）
  async getAllUsers(): Promise<User[]> {
    return await this.pgDb.getAllUsers();
  }

  // 給与関連の追加メソッド
  async getSalaryDetails(userId: string, month: string): Promise<any[]> {
    return await this.pgDb.getSalaryDetails(userId, month);
  }

  async deleteMonthlySalaryClaim(userId: string, month: string): Promise<void> {
    await this.pgDb.deleteMonthlySalaryClaim(userId, month);
  }

  // Bulk Salary Results関連
  async getLatestBulkSalaryResults(userId: string): Promise<any[]> {
    return await this.pgDb.getLatestBulkSalaryResults(userId);
  }

  // VC関連メソッド
  async getTempVC(channelId: string): Promise<TempVC | null> {
    return await this.pgDb.getTempVC(channelId);
  }

  async addPublicVC(channelId: string, creatorId: string, channelName: string, description?: string): Promise<void> {
    return await this.pgDb.addPublicVC(channelId, creatorId, channelName, description);
  }

  async getActivePublicVCs(): Promise<PublicVC[]> {
    return await this.pgDb.getActivePublicVCs();
  }

  async getPublicVC(channelId: string): Promise<PublicVC | null> {
    return await this.pgDb.getPublicVC(channelId);
  }

  async removePublicVC(channelId: string): Promise<void> {
    return await this.pgDb.removePublicVC(channelId);
  }

  async addTempVC(channelId: string, creatorId: string, channelName: string, durationHours: number, cost: number, expiresAt: Date): Promise<void> {
    return await this.pgDb.addTempVC(channelId, creatorId, channelName, durationHours, cost, expiresAt);
  }

  async getExpiredTempVCs(): Promise<TempVC[]> {
    return await this.pgDb.getExpiredTempVCs();
  }

  async removeTempVC(channelId: string): Promise<void> {
    return await this.pgDb.removeTempVC(channelId);
  }

  // Voice session tracking methods
  async startVoiceSession(userId: string, channelId: string, hasAngel: boolean): Promise<number> {
    return await this.pgDb.startVoiceSession(userId, channelId, hasAngel);
  }

  async endVoiceSession(sessionId: number): Promise<void> {
    return await this.pgDb.endVoiceSession(sessionId);
  }

  async updateVoiceTimeLog(userId: string, date: string, totalMinutes: number, angelMinutes: number): Promise<void> {
    return await this.pgDb.updateVoiceTimeLog(userId, date, totalMinutes, angelMinutes);
  }

  async getVoiceTimeStats(userId: string, startDate: string, endDate: string): Promise<any[]> {
    return await this.pgDb.getVoiceTimeStats(userId, startDate, endDate);
  }

  async getAngelRoleVoiceStats(startDate: string, endDate: string): Promise<any[]> {
    return await this.pgDb.getAngelRoleVoiceStats(startDate, endDate);
  }

  async getActiveVoiceSession(userId: string, channelId: string): Promise<any> {
    return await this.pgDb.getActiveVoiceSession(userId, channelId);
  }

  // Special VC methods
  async startSpecialVCSession(userId: string, channelId: string, channelName: string, vcType: string, hasAngel: boolean): Promise<number> {
    return await this.pgDb.startSpecialVCSession(userId, channelId, channelName, vcType, hasAngel);
  }

  async endSpecialVCSession(sessionId: number): Promise<void> {
    return await this.pgDb.endSpecialVCSession(sessionId);
  }

  async updateSpecialVCTimeLog(userId: string, date: string, corridorMinutes: number, evaluationMinutes: number, angelCorridorMinutes: number, angelEvaluationMinutes: number, vcType: string): Promise<void> {
    return await this.pgDb.updateSpecialVCTimeLog(userId, date, corridorMinutes, evaluationMinutes, angelCorridorMinutes, angelEvaluationMinutes, vcType);
  }

  async getSpecialVCStats(userId: string, startDate: string, endDate: string): Promise<any[]> {
    return await this.pgDb.getSpecialVCStats(userId, startDate, endDate);
  }

  async getSpecialVCRanking(vcType: string, startDate: string, endDate: string): Promise<any[]> {
    return await this.pgDb.getSpecialVCRanking(vcType, startDate, endDate);
  }
}