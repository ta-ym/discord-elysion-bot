/**
 * 新規参加者向け通貨システム設定
 */

export interface NewMemberCurrencyConfig {
  // 初期残高設定
  initialBalance: number;
  
  // ログチャンネルID
  logChannelId: string | null;
  
  // 歓迎メッセージ送信設定
  sendWelcomeMessage: boolean;
  
  // DM送信を試行するか
  tryDirectMessage: boolean;
  
  // システムチャンネルへのフォールバック
  fallbackToSystemChannel: boolean;
}

/**
 * デフォルト設定
 */
export const DEFAULT_NEW_MEMBER_CONFIG: NewMemberCurrencyConfig = {
  initialBalance: 10000, // 10,000Ru
  logChannelId: '1434872826992590949', // 通貨ログチャンネル（実際のIDに変更してください）
  sendWelcomeMessage: true,
  tryDirectMessage: true,
  fallbackToSystemChannel: true,
};

/**
 * 環境変数から設定を取得
 */
export function getNewMemberConfig(): NewMemberCurrencyConfig {
  return {
    initialBalance: parseInt(process.env['NEW_MEMBER_INITIAL_BALANCE'] || '10000'),
    logChannelId: process.env['CURRENCY_LOG_CHANNEL_ID'] || DEFAULT_NEW_MEMBER_CONFIG.logChannelId,
    sendWelcomeMessage: process.env['SEND_WELCOME_MESSAGE'] !== 'false',
    tryDirectMessage: process.env['TRY_DIRECT_MESSAGE'] !== 'false',
    fallbackToSystemChannel: process.env['FALLBACK_TO_SYSTEM_CHANNEL'] !== 'false',
  };
}