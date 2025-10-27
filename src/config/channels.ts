/**
 * チャンネル設定ファイル
 * 各種ログやシステム機能で使用するチャンネルIDを管理
 */

export interface ChannelConfig {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

/**
 * 通貨取引ログチャンネル設定
 * サーバー内通貨（Ru_men）のやりとりを記録するチャンネル
 */
export const CURRENCY_LOG_CHANNEL: ChannelConfig = {
  id: '1432371639319789648',
  name: '通貨ログ',
  description: 'サーバー内通貨（Ru_men）の取引ログを記録するチャンネル',
  isActive: true
};

/**
 * その他のシステムチャンネル設定
 * 必要に応じて追加のシステムチャンネルを定義
 */
export const SYSTEM_CHANNELS = {
  CURRENCY_LOG: CURRENCY_LOG_CHANNEL,
  // 将来的に他のログチャンネルも追加可能
  // ADMIN_LOG: { ... },
  // AUDIT_LOG: { ... },
};

/**
 * 指定されたチャンネル設定がアクティブかどうかを確認
 */
export function isChannelActive(channel: ChannelConfig): boolean {
  return channel.isActive;
}

/**
 * 通貨ログチャンネルIDを取得
 */
export function getCurrencyLogChannelId(): string | null {
  return CURRENCY_LOG_CHANNEL.isActive ? CURRENCY_LOG_CHANNEL.id : null;
}