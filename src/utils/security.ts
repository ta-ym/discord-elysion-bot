import { ChatInputCommandInteraction, GuildMember, PermissionFlagsBits } from 'discord.js';

export class SecurityUtils {
  // 管理者権限チェック
  static isAdmin(interaction: ChatInputCommandInteraction): boolean {
    const member = interaction.member as GuildMember;
    return member?.permissions.has(PermissionFlagsBits.Administrator) || false;
  }

  // レート制限チェック（簡単な実装）
  private static rateLimits = new Map<string, { count: number; resetTime: number }>();
  
  static checkRateLimit(userId: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
    const now = Date.now();
    const userLimit = this.rateLimits.get(userId);
    
    if (!userLimit || now > userLimit.resetTime) {
      this.rateLimits.set(userId, { count: 1, resetTime: now + windowMs });
      return true;
    }
    
    if (userLimit.count >= maxRequests) {
      return false;
    }
    
    userLimit.count++;
    return true;
  }

  // 入力値検証
  static validateAmount(amount: number): { valid: boolean; error?: string } {
    if (amount <= 0) {
      return { valid: false, error: '金額は1以上である必要があります。' };
    }
    
    if (amount > 1000000) {
      return { valid: false, error: '一度に処理できる金額の上限を超えています。' };
    }
    
    if (!Number.isInteger(amount)) {
      return { valid: false, error: '金額は整数である必要があります。' };
    }
    
    return { valid: true };
  }

  // チャンネル名検証
  static validateChannelName(name: string): { valid: boolean; error?: string } {
    if (name.length === 0) {
      return { valid: false, error: 'チャンネル名は空にできません。' };
    }
    
    if (name.length > 100) {
      return { valid: false, error: 'チャンネル名は100文字以下である必要があります。' };
    }
    
    // 不適切な文字のチェック
    const invalidChars = /[<>@#&!]/;
    if (invalidChars.test(name)) {
      return { valid: false, error: 'チャンネル名に不適切な文字が含まれています。' };
    }
    
    return { valid: true };
  }

  // ユーザーID検証
  static validateUserId(userId: string): { valid: boolean; error?: string } {
    if (!/^\d{17,19}$/.test(userId)) {
      return { valid: false, error: '有効なユーザーIDを入力してください。' };
    }
    
    return { valid: true };
  }

  // ログ記録
  static logSensitiveAction(action: string, userId: string, details: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[SECURITY LOG] ${timestamp} - ${action} by ${userId}:`, details);
  }
}

export class ErrorHandler {
  static async handleCommandError(
    interaction: ChatInputCommandInteraction,
    error: Error,
    context: string
  ): Promise<void> {
    console.error(`[ERROR] ${context}:`, error);
    
    const errorMessage = '❌ 処理中にエラーが発生しました。しばらく時間をおいてから再度お試しください。';
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      console.error('[ERROR] Failed to send error message:', replyError);
    }
  }

  static logDatabaseError(operation: string, error: Error, context?: any): void {
    console.error(`[DB ERROR] ${operation}:`, error);
    if (context) {
      console.error('[DB ERROR] Context:', context);
    }
  }
}