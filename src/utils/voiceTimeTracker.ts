import { VoiceState, Client } from 'discord.js';
import { Database } from '../database';
import { hasAngelRole } from '../config/angelRole';

/**
 * 通話時間追跡システム
 * VoiceStateUpdateイベントで通話参加・退出を監視し、時間を記録
 */
export class VoiceTimeTracker {
  private client: Client;
  private database: Database;
  private activeSessions: Map<string, number> = new Map(); // userId -> sessionId

  constructor(client: Client, database: Database) {
    this.client = client;
    this.database = database;
    
    // VoiceStateUpdateイベントを監視
    this.client.on('voiceStateUpdate', this.handleVoiceStateUpdate.bind(this));
    
    console.log('VoiceTimeTracker initialized');
  }

  /**
   * VoiceStateUpdateイベントハンドラー
   */
  private async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    try {
      const userId = newState.member?.id || oldState.member?.id;
      if (!userId || newState.member?.user.bot) return;

      // VCに参加した場合
      if (newState.channel && !oldState.channel) {
        await this.handleVoiceJoin(newState);
      }
      // VCから退出した場合
      else if (!newState.channel && oldState.channel) {
        await this.handleVoiceLeave(oldState);
      }
      // VC間を移動した場合
      else if (newState.channel && oldState.channel && newState.channelId !== oldState.channelId) {
        await this.handleVoiceLeave(oldState);
        await this.handleVoiceJoin(newState);
      }
    } catch (error) {
      console.error('VoiceTimeTracker error:', error);
    }
  }

  /**
   * VC参加処理
   */
  private async handleVoiceJoin(voiceState: VoiceState): Promise<void> {
    if (!voiceState.member || !voiceState.channel) return;

    const userId = voiceState.member.id;
    const channelId = voiceState.channel.id;
    
    // 天使ロールを持っているかチェック
    const memberRoles = voiceState.member.roles.cache.map(role => role.id);
    const hasAngel = hasAngelRole(memberRoles);

    try {
      // セッション開始
      const sessionId = await this.database.startVoiceSession(userId, channelId, hasAngel);
      this.activeSessions.set(userId, sessionId);

      console.log(`[VOICE JOIN] ${voiceState.member.displayName} joined ${voiceState.channel.name} ${hasAngel ? '(天使ロール)' : ''}`);
    } catch (error) {
      console.error('Error starting voice session:', error);
    }
  }

  /**
   * VC退出処理
   */
  private async handleVoiceLeave(voiceState: VoiceState): Promise<void> {
    if (!voiceState.member || !voiceState.channel) return;

    const userId = voiceState.member.id;
    const sessionId = this.activeSessions.get(userId);

    if (!sessionId) return;

    try {
      // セッション終了
      await this.database.endVoiceSession(sessionId);
      this.activeSessions.delete(userId);

      // セッション情報を取得して日次ログを更新
      const session = await this.getCompletedSession(sessionId);
      if (session && session.duration_minutes && session.duration_minutes > 0) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const angelMinutes = session.has_angel_role ? session.duration_minutes : 0;
        
        await this.database.updateVoiceTimeLog(
          userId,
          today,
          session.duration_minutes,
          angelMinutes
        );

        console.log(`[VOICE LEAVE] ${voiceState.member.displayName} left ${voiceState.channel.name} (${session.duration_minutes}分) ${session.has_angel_role ? '(天使ロール)' : ''}`);
      }
    } catch (error) {
      console.error('Error ending voice session:', error);
    }
  }

  /**
   * 完了したセッション情報を取得
   */
  private async getCompletedSession(sessionId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.database['db'].get(
        'SELECT * FROM voice_sessions WHERE id = ?',
        [sessionId],
        (err: any, row: any) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * 指定ユーザーの通話時間統計を取得
   */
  async getUserVoiceStats(userId: string, startDate?: string, endDate?: string): Promise<{
    totalMinutes: number;
    angelRoleMinutes: number;
    totalSessions: number;
    dailyStats: any[];
  }> {
    const stats = await this.database.getVoiceTimeStats(userId, startDate, endDate);
    
    const totalMinutes = stats.reduce((sum, stat) => sum + stat.total_minutes, 0);
    const angelRoleMinutes = stats.reduce((sum, stat) => sum + stat.angel_role_minutes, 0);
    const totalSessions = stats.reduce((sum, stat) => sum + stat.sessions_count, 0);

    return {
      totalMinutes,
      angelRoleMinutes,
      totalSessions,
      dailyStats: stats
    };
  }

  /**
   * 天使ロール全体の通話時間統計を取得
   */
  async getAngelRoleStats(startDate?: string, endDate?: string): Promise<any[]> {
    return await this.database.getAngelRoleVoiceStats(startDate, endDate);
  }

  /**
   * 現在アクティブなセッションを取得
   */
  getActiveSessions(): Map<string, number> {
    return new Map(this.activeSessions);
  }

  /**
   * 指定ユーザーの現在のセッション情報を取得
   */
  async getCurrentSession(userId: string, channelId: string): Promise<any> {
    return await this.database.getActiveVoiceSession(userId, channelId);
  }

  /**
   * 日付範囲の文字列をフォーマット
   */
  formatDateRange(days: number): { startDate: string; endDate: string } {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  /**
   * 月の範囲を取得
   */
  getMonthRange(year: number, month: number): { startDate: string; endDate: string } {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  /**
   * リソースクリーンアップ
   */
  destroy(): void {
    this.activeSessions.clear();
    this.client.removeAllListeners('voiceStateUpdate');
    console.log('VoiceTimeTracker destroyed');
  }
}

// グローバルインスタンス
let voiceTimeTracker: VoiceTimeTracker | null = null;

/**
 * 通話時間追跡システムを初期化
 */
export function initializeVoiceTimeTracker(client: Client, database: Database): void {
  if (voiceTimeTracker) {
    voiceTimeTracker.destroy();
  }
  voiceTimeTracker = new VoiceTimeTracker(client, database);
}

/**
 * 通話時間追跡システムのインスタンスを取得
 */
export function getVoiceTimeTracker(): VoiceTimeTracker | null {
  return voiceTimeTracker;
}