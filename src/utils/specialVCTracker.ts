import { VoiceState } from 'discord.js';
import { Database } from '../database';
import { hasAngelRole } from '../config/angelRole';

// 天界カテゴリID
const TENKAI_CATEGORY_ID = '1424762646279753860';

// 回廊1-5のチャンネルID
const CORRIDOR_CHANNEL_IDS = [
  '1425134212981194804', // 回廊1
  '1425134360545198213', // 回廊2
  '1425354770322821201', // 回廊3
  '1434529423746662540', // 回廊4
  '1434881517779419277', // 回廊5
];

/**
 * 特別VC（回廊・評価）時間追跡システム
 */
export class SpecialVCTracker {
  private database: Database;
  private activeSessions: Map<string, number> = new Map(); // userId_channelId -> sessionId

  constructor(database: Database) {
    this.database = database;
    console.log('SpecialVCTracker initialized');
  }

  /**
   * VCチャンネルの種類を判定
   */
  private getVCType(channelId: string, channelName: string, parentId: string | null): 'corridor' | 'evaluation' | null {
    // 天界カテゴリ以外は対象外
    if (parentId !== TENKAI_CATEGORY_ID) {
      return null;
    }

    // 回廊1-5かチェック
    if (CORRIDOR_CHANNEL_IDS.includes(channelId)) {
      return 'corridor';
    }

    // チャンネル名に「評価」が含まれるかチェック
    if (channelName.includes('評価')) {
      return 'evaluation';
    }

    return null;
  }

  /**
   * VC参加処理
   */
  async handleVoiceJoin(voiceState: VoiceState): Promise<void> {
    if (!voiceState.member || !voiceState.channel || voiceState.member.user.bot) return;

    const vcType = this.getVCType(
      voiceState.channel.id,
      voiceState.channel.name,
      voiceState.channel.parentId
    );

    if (!vcType) return; // 対象外のVC

    const userId = voiceState.member.id;
    const channelId = voiceState.channel.id;
    const channelName = voiceState.channel.name;
    const sessionKey = `${userId}_${channelId}`;

    // 既にアクティブなセッションがある場合はスキップ
    if (this.activeSessions.has(sessionKey)) {
      return;
    }

    // 天使ロールチェック
    const memberRoles = voiceState.member.roles.cache.map(role => role.id);
    const hasAngel = hasAngelRole(memberRoles);

    try {
      // セッション開始
      const sessionId = await this.database.startSpecialVCSession(
        userId,
        channelId,
        channelName,
        vcType,
        hasAngel
      );
      this.activeSessions.set(sessionKey, sessionId);

      console.log(`[SPECIAL VC JOIN] ${voiceState.member.displayName} joined ${vcType} "${channelName}" ${hasAngel ? '(天使ロール)' : ''}`);
    } catch (error) {
      console.error('[SPECIAL VC] Error starting session:', error);
    }
  }

  /**
   * VC退出処理
   */
  async handleVoiceLeave(voiceState: VoiceState): Promise<void> {
    if (!voiceState.member || !voiceState.channel || voiceState.member.user.bot) return;

    const vcType = this.getVCType(
      voiceState.channel.id,
      voiceState.channel.name,
      voiceState.channel.parentId
    );

    if (!vcType) return; // 対象外のVC

    const userId = voiceState.member.id;
    const channelId = voiceState.channel.id;
    const sessionKey = `${userId}_${channelId}`;

    const sessionId = this.activeSessions.get(sessionKey);
    if (!sessionId) return;

    try {
      // セッション終了
      await this.database.endSpecialVCSession(sessionId);
      this.activeSessions.delete(sessionKey);

      // セッション情報を取得して日次ログを更新
      const session = await this.getCompletedSession(sessionId);
      if (session && session.duration_minutes && session.duration_minutes > 0) {
        const today = new Date().toISOString().split('T')[0];
        
        const corridorMinutes = vcType === 'corridor' ? session.duration_minutes : 0;
        const evaluationMinutes = vcType === 'evaluation' ? session.duration_minutes : 0;
        const angelCorridorMinutes = (vcType === 'corridor' && session.has_angel_role) ? session.duration_minutes : 0;
        const angelEvaluationMinutes = (vcType === 'evaluation' && session.has_angel_role) ? session.duration_minutes : 0;

        await this.database.updateSpecialVCTimeLog(
          userId,
          today,
          corridorMinutes,
          evaluationMinutes,
          angelCorridorMinutes,
          angelEvaluationMinutes,
          vcType
        );

        console.log(`[SPECIAL VC LEAVE] ${voiceState.member.displayName} left ${vcType} "${voiceState.channel.name}" (${session.duration_minutes}分) ${session.has_angel_role ? '(天使ロール)' : ''}`);
      }
    } catch (error) {
      console.error('[SPECIAL VC] Error ending session:', error);
    }
  }

  /**
   * VC移動処理
   */
  async handleVoiceMove(oldState: VoiceState, newState: VoiceState): Promise<void> {
    // 古いチャンネルから退出処理
    if (oldState.channel) {
      await this.handleVoiceLeave(oldState);
    }

    // 新しいチャンネルに参加処理
    if (newState.channel) {
      await this.handleVoiceJoin(newState);
    }
  }

  /**
   * 完了したセッション情報を取得
   */
  private async getCompletedSession(sessionId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.database['db'].get(
        'SELECT * FROM special_vc_sessions WHERE id = ?',
        [sessionId],
        (err: any, row: any) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * ユーザーの特別VC統計を取得
   */
  async getUserSpecialVCStats(userId: string, startDate?: string, endDate?: string): Promise<{
    totalCorridorMinutes: number;
    totalEvaluationMinutes: number;
    totalMinutes: number;
    corridorSessions: number;
    evaluationSessions: number;
    angelCorridorMinutes: number;
    angelEvaluationMinutes: number;
    dailyStats: any[];
  }> {
    const stats = await this.database.getSpecialVCStats(userId, startDate, endDate);
    
    const totalCorridorMinutes = stats.reduce((sum, stat) => sum + stat.corridor_minutes, 0);
    const totalEvaluationMinutes = stats.reduce((sum, stat) => sum + stat.evaluation_minutes, 0);
    const corridorSessions = stats.reduce((sum, stat) => sum + stat.corridor_sessions, 0);
    const evaluationSessions = stats.reduce((sum, stat) => sum + stat.evaluation_sessions, 0);
    const angelCorridorMinutes = stats.reduce((sum, stat) => sum + stat.total_angel_corridor_minutes, 0);
    const angelEvaluationMinutes = stats.reduce((sum, stat) => sum + stat.total_angel_evaluation_minutes, 0);

    return {
      totalCorridorMinutes,
      totalEvaluationMinutes,
      totalMinutes: totalCorridorMinutes + totalEvaluationMinutes,
      corridorSessions,
      evaluationSessions,
      angelCorridorMinutes,
      angelEvaluationMinutes,
      dailyStats: stats
    };
  }

  /**
   * 特別VCランキングを取得
   */
  async getSpecialVCRanking(vcType: 'corridor' | 'evaluation' | 'both' = 'both', startDate?: string, endDate?: string): Promise<any[]> {
    return await this.database.getSpecialVCRanking(vcType, startDate, endDate);
  }

  /**
   * アクティブセッション数を取得
   */
  getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  /**
   * 現在の統計サマリーを取得
   */
  async getCurrentSummary(): Promise<{
    activeSessions: number;
    activeCorridorSessions: number;
    activeEvaluationSessions: number;
  }> {
    let activeCorridorSessions = 0;
    let activeEvaluationSessions = 0;

    // この実装は簡略化されており、実際にはチャンネル情報を保持する必要がある
    // 詳細な実装が必要な場合は、activeSessions に追加情報を保存する

    return {
      activeSessions: this.activeSessions.size,
      activeCorridorSessions,
      activeEvaluationSessions
    };
  }
}

// グローバルインスタンス
let specialVCTracker: SpecialVCTracker | null = null;

/**
 * 特別VC追跡システムを初期化
 */
export function initializeSpecialVCTracker(database: Database): void {
  if (specialVCTracker) {
    // 既存のインスタンスをクリア
    specialVCTracker = null;
  }
  specialVCTracker = new SpecialVCTracker(database);
}

/**
 * 特別VC追跡システムのインスタンスを取得
 */
export function getSpecialVCTracker(): SpecialVCTracker | null {
  return specialVCTracker;
}