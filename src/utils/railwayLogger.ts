import { Client, TextChannel } from 'discord.js';
import axios from 'axios';

interface RailwayLog {
  id: string;
  timestamp: string;
  message: string;
  severity: string;
  attributes: Record<string, any>;
}

interface RailwayLogsResponse {
  logs: RailwayLog[];
  hasNextPage: boolean;
  nextCursor?: string;
}

export class RailwayLogger {
  private client: Client | null = null;
  private logChannelId: string | null = null;
  private railwayToken: string | null = null;
  private projectId: string | null = null;
  private serviceId: string | null = null;
  private isPolling: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastCursor: string | null = null;
  private seenLogIds: Set<string> = new Set();

  constructor() {
    console.log('[RAILWAY LOGGER] Constructor called');
  }

  // Discordクライアントを設定
  setClient(client: Client): void {
    this.client = client;
    
    // クライアント設定時に環境変数を読み込み
    this.logChannelId = process.env['SYSTEM_LOG_CHANNEL_ID'] || null;
    this.railwayToken = process.env['RAILWAY_TOKEN'] || null;
    this.projectId = process.env['RAILWAY_PROJECT_ID'] || null;
    this.serviceId = process.env['RAILWAY_SERVICE_ID'] || null;

    console.log('[RAILWAY LOGGER] Discord client set');
    console.log('[RAILWAY LOGGER] Configuration:', {
      hasToken: !!this.railwayToken,
      hasProjectId: !!this.projectId,
      hasServiceId: !!this.serviceId,
      channelId: this.logChannelId,
      tokenLength: this.railwayToken?.length || 0
    });
  }

  // Railway APIでログを取得
  private async fetchRailwayLogs(cursor?: string): Promise<RailwayLogsResponse | null> {
    if (!this.railwayToken || !this.projectId || !this.serviceId) {
      console.warn('[RAILWAY LOGGER] Missing Railway configuration');
      return null;
    }

    try {
      const query = `
        query GetLogs($projectId: String!, $serviceId: String!, $cursor: String) {
          logs(
            projectId: $projectId
            serviceId: $serviceId
            first: 50
            after: $cursor
            orderBy: { timestamp: DESC }
          ) {
            edges {
              node {
                id
                timestamp
                message
                severity
                attributes
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const response = await axios.post(
        'https://backboard.railway.app/graphql',
        {
          query,
          variables: {
            projectId: this.projectId,
            serviceId: this.serviceId,
            cursor
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.railwayToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.errors) {
        console.error('[RAILWAY LOGGER] GraphQL errors:', response.data.errors);
        return null;
      }

      const logs = response.data.data.logs.edges.map((edge: any) => edge.node);
      const pageInfo = response.data.data.logs.pageInfo;

      return {
        logs,
        hasNextPage: pageInfo.hasNextPage,
        nextCursor: pageInfo.endCursor
      };
    } catch (error) {
      console.error('[RAILWAY LOGGER] Failed to fetch logs:', error);
      return null;
    }
  }

  // Discordにログを送信
  private async sendLogToDiscord(log: RailwayLog): Promise<void> {
    if (!this.client || !this.logChannelId) return;

    try {
      const channel = await this.client.channels.fetch(this.logChannelId) as TextChannel;
      if (!channel || !channel.isTextBased()) return;

      const timestamp = new Date(log.timestamp).toLocaleString('ja-JP', { 
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const formattedMessage = `[RAILWAY] [${log.severity}] ${timestamp} - ${log.message}`;
      
      // メッセージが2000文字を超える場合は分割
      if (formattedMessage.length > 2000) {
        const chunks = formattedMessage.match(/.{1,2000}/g) || [];
        for (const chunk of chunks) {
          await channel.send(chunk);
        }
      } else {
        await channel.send(formattedMessage);
      }
    } catch (error) {
      console.error('[RAILWAY LOGGER] Failed to send log to Discord:', error);
    }
  }

  // 新しいログをポーリング
  private async pollForNewLogs(): Promise<void> {
    try {
      const response = await this.fetchRailwayLogs(this.lastCursor || undefined);
      if (!response) return;

      // 新しいログのみを処理（重複を避ける）
      const newLogs = response.logs.filter(log => !this.seenLogIds.has(log.id));
      
      for (const log of newLogs.reverse()) { // 古いものから順番に送信
        this.seenLogIds.add(log.id);
        await this.sendLogToDiscord(log);
        
        // レート制限を避けるため少し待機
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // カーソルを更新
      if (response.nextCursor) {
        this.lastCursor = response.nextCursor;
      }

      // 見たログIDが多すぎる場合は古いものを削除
      if (this.seenLogIds.size > 1000) {
        const idsArray = Array.from(this.seenLogIds);
        this.seenLogIds = new Set(idsArray.slice(-500)); // 最新500個を保持
      }
    } catch (error) {
      console.error('[RAILWAY LOGGER] Error during polling:', error);
    }
  }

  // ログポーリングを開始
  startPolling(intervalMs: number = 30000): void {
    if (this.isPolling) {
      console.log('[RAILWAY LOGGER] Already polling');
      return;
    }

    if (!this.railwayToken || !this.projectId || !this.serviceId) {
      console.warn('[RAILWAY LOGGER] Cannot start polling - missing Railway configuration');
      return;
    }

    console.log(`[RAILWAY LOGGER] Starting log polling every ${intervalMs}ms`);
    this.isPolling = true;

    // 初回実行
    this.pollForNewLogs();

    // 定期実行
    this.pollingInterval = setInterval(() => {
      this.pollForNewLogs();
    }, intervalMs);
  }

  // ログポーリングを停止
  stopPolling(): void {
    if (!this.isPolling) return;

    console.log('[RAILWAY LOGGER] Stopping log polling');
    this.isPolling = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // 手動でログを取得して送信
  async fetchAndSendLogs(limit: number = 10): Promise<void> {
    const response = await this.fetchRailwayLogs();
    if (!response) {
      console.log('[RAILWAY LOGGER] No logs available');
      return;
    }

    const recentLogs = response.logs.slice(0, limit);
    console.log(`[RAILWAY LOGGER] Sending ${recentLogs.length} recent logs`);

    for (const log of recentLogs.reverse()) {
      await this.sendLogToDiscord(log);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // 設定状況を確認
  getStatus(): {
    isConfigured: boolean;
    isPolling: boolean;
    hasClient: boolean;
    channelId: string | null;
    seenLogsCount: number;
  } {
    return {
      isConfigured: !!(this.railwayToken && this.projectId && this.serviceId),
      isPolling: this.isPolling,
      hasClient: !!this.client,
      channelId: this.logChannelId,
      seenLogsCount: this.seenLogIds.size
    };
  }
}

// グローバルインスタンス
export const railwayLogger = new RailwayLogger();