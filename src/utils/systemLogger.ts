import { Client, EmbedBuilder, TextChannel } from 'discord.js';

export class SystemLogger {
  private client: Client | null = null;
  private logChannelId: string | null = null;
  private originalConsoleLog: typeof console.log;
  private originalConsoleError: typeof console.error;
  private originalConsoleWarn: typeof console.warn;

  constructor() {
    this.logChannelId = process.env['SYSTEM_LOG_CHANNEL_ID'] || null;
    
    console.log('[SYSTEM LOGGER] Initializing with channel ID:', this.logChannelId);
    console.log('[SYSTEM LOGGER] Environment variables:', {
      SYSTEM_LOG_CHANNEL_ID: process.env['SYSTEM_LOG_CHANNEL_ID'],
      NODE_ENV: process.env['NODE_ENV']
    });
    
    // 元のconsoleメソッドを保存
    this.originalConsoleLog = console.log;
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;
  }

  // Discordクライアントを設定
  setClient(client: Client): void {
    this.client = client;
    
    // クライアント設定時に環境変数を再読み込み
    this.logChannelId = process.env['SYSTEM_LOG_CHANNEL_ID'] || null;
    
    console.log('[SYSTEM LOGGER] Discord client set for system logging');
    console.log('[SYSTEM LOGGER] Channel ID:', this.logChannelId);
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

      // レベルに応じて色を設定
      const colors = {
        INFO: 0x3498db,    // 青
        WARN: 0xf39c12,    // オレンジ
        ERROR: 0xe74c3c,   // 赤
        SUCCESS: 0x2ecc71  // 緑
      };

      // レベルに応じて絵文字を設定
      const emojis = {
        INFO: 'ℹ️',
        WARN: '⚠️',
        ERROR: '❌',
        SUCCESS: '✅'
      };

      const embed = new EmbedBuilder()
        .setColor(colors[level])
        .setTitle(`${emojis[level]} システムログ - ${level}`)
        .setDescription(`\`\`\`\n${message.substring(0, 1900)}\`\`\``)
        .setTimestamp()
        .setFooter({ text: 'Elysion Bot System Logger' });

      // メッセージが長すぎる場合は複数に分割
      if (message.length > 1900) {
        embed.addFields({
          name: '⚠️ メッセージが切り詰められました',
          value: `完全なメッセージ長: ${message.length} 文字`,
          inline: false
        });
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      // ログ送信エラーは元のconsole.errorで出力（無限ループ防止）
      this.originalConsoleError('[SYSTEM LOGGER] Failed to send log to Discord:', error);
    }
  }

  // システム起動ログを送信
  async sendStartupLog(): Promise<void> {
    const startupMessage = `🚀 Elysion Bot が起動しました\n` +
      `📅 起動時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n` +
      `🌐 環境: ${process.env['NODE_ENV'] || 'development'}\n` +
      `📝 PostgreSQL: ${process.env['DISABLE_POSTGRESQL'] === 'true' ? '無効 (SQLite使用)' : '有効'}\n` +
      `🔧 Node.js: ${process.version}`;

    await this.sendToDiscord('SUCCESS', startupMessage);
  }

  // システム終了ログを送信
  async sendShutdownLog(): Promise<void> {
    const shutdownMessage = `🛑 Elysion Bot がシャットダウンします\n` +
      `📅 終了時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`;

    await this.sendToDiscord('WARN', shutdownMessage);
  }

  // エラーログを送信
  async sendErrorLog(error: Error, context?: string): Promise<void> {
    const errorMessage = `💥 エラーが発生しました\n` +
      `${context ? `📍 コンテキスト: ${context}\n` : ''}` +
      `🔍 エラー名: ${error.name}\n` +
      `📝 メッセージ: ${error.message}\n` +
      `📊 スタックトレース:\n${error.stack}`;

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