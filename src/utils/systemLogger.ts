import { Client, TextChannel } from 'discord.js';

export class SystemLogger {
  private client: Client | null = null;
  private logChannelId: string | null = null;
  private originalConsoleLog: typeof console.log;
  private originalConsoleError: typeof console.error;
  private originalConsoleWarn: typeof console.warn;

  constructor() {
    // 元のconsoleメソッドを保存
    this.originalConsoleLog = console.log;
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;
    
    console.log('[SYSTEM LOGGER] Constructor called');
  }

  // Discordクライアントを設定
  setClient(client: Client): void {
    this.client = client;
    
    // クライアント設定時に環境変数を読み込み
    this.logChannelId = process.env['SYSTEM_LOG_CHANNEL_ID'] || null;
    
    console.log('[SYSTEM LOGGER] Discord client set for system logging');
    console.log('[SYSTEM LOGGER] Channel ID:', this.logChannelId);
    console.log('[SYSTEM LOGGER] Environment check:', {
      SYSTEM_LOG_CHANNEL_ID: process.env['SYSTEM_LOG_CHANNEL_ID'],
      NODE_ENV: process.env['NODE_ENV']
    });
  }

  // コンソールログをオーバーライドしてDiscordにも送信
  interceptConsole(): void {
    if (!this.logChannelId) {
      console.log('[SYSTEM LOGGER] No log channel ID specified, console interception disabled');
      return;
    }

    // console.logをオーバーライド
    console.log = (...args: any[]) => {
      this.originalConsoleLog(...args);
      this.sendToDiscord('INFO', args.join(' '));
    };

    // console.errorをオーバーライド
    console.error = (...args: any[]) => {
      this.originalConsoleError(...args);
      this.sendToDiscord('ERROR', args.join(' '));
    };

    // console.warnをオーバーライド
    console.warn = (...args: any[]) => {
      this.originalConsoleWarn(...args);
      this.sendToDiscord('WARN', args.join(' '));
    };

    console.log('[SYSTEM LOGGER] Console interception enabled');
  }

  // Discordに直接ログを送信
  async sendToDiscord(level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string): Promise<void> {
    if (!this.client || !this.logChannelId) return;

    try {
      const channel = await this.client.channels.fetch(this.logChannelId) as TextChannel;
      if (!channel || !channel.isTextBased()) return;

      const formattedMessage = `[${level}] ${message}`;
      
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
      // ログ送信エラーは元のconsole.errorで出力（無限ループ防止）
      this.originalConsoleError('[SYSTEM LOGGER] Failed to send log to Discord:', error);
    }
  }

  // システム起動ログを送信
  async sendStartupLog(): Promise<void> {
    const startupMessage = `[STARTUP] Elysion Bot 起動 - ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} - ENV: ${process.env['NODE_ENV'] || 'development'} - PostgreSQL: ${process.env['DISABLE_POSTGRESQL'] === 'true' ? '無効(SQLite使用)' : '有効'} - Node.js: ${process.version}`;

    await this.sendToDiscord('SUCCESS', startupMessage);
  }

  // システム終了ログを送信
  async sendShutdownLog(): Promise<void> {
    const shutdownMessage = `[SHUTDOWN] Elysion Bot 終了 - ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`;

    await this.sendToDiscord('WARN', shutdownMessage);
  }

  // エラーログを送信
  async sendErrorLog(error: Error, context?: string): Promise<void> {
    const errorMessage = `[ERROR] ${context ? `[${context}] ` : ''}${error.name}: ${error.message}${error.stack ? `\nStack: ${error.stack}` : ''}`;

    await this.sendToDiscord('ERROR', errorMessage);
  }

  // コンソールインターセプトを無効化
  restoreConsole(): void {
    console.log = this.originalConsoleLog;
    console.error = this.originalConsoleError;
    console.warn = this.originalConsoleWarn;
    console.log('[SYSTEM LOGGER] Console interception disabled');
  }
}

// グローバルインスタンス
export const systemLogger = new SystemLogger();