/**
 * 天使ロール設定
 * 通話時間追跡と報酬システムの設定
 */

export interface AngelRoleConfig {
  roleId: string;
  name: string;
  rewardRates: {
    perMinute: number; // 1分あたりの報酬
    bonusThresholds: {
      minutes: number;
      bonus: number;
    }[];
  };
  trackingEnabled: boolean;
}

/**
 * 天使ロール設定
 */
export const ANGEL_ROLE_CONFIG: AngelRoleConfig = {
  roleId: '1428053870365642863',
  name: '天使',
  rewardRates: {
    perMinute: 5, // 1分あたり5通貨
    bonusThresholds: [
      { minutes: 60, bonus: 100 },   // 1時間で100通貨ボーナス
      { minutes: 180, bonus: 300 },  // 3時間で300通貨ボーナス
      { minutes: 360, bonus: 600 },  // 6時間で600通貨ボーナス
    ]
  },
  trackingEnabled: true
};

/**
 * 天使ロールIDを取得
 */
export function getAngelRoleId(): string {
  return ANGEL_ROLE_CONFIG.roleId;
}

/**
 * 天使ロール設定を取得
 */
export function getAngelRoleConfig(): AngelRoleConfig {
  return ANGEL_ROLE_CONFIG;
}

/**
 * 指定されたユーザーが天使ロールを持っているかチェック
 */
export function hasAngelRole(userRoles: string[]): boolean {
  return userRoles.includes(ANGEL_ROLE_CONFIG.roleId);
}

/**
 * 通話時間に基づく報酬を計算
 */
export function calculateVoiceReward(minutes: number): {
  baseReward: number;
  bonusReward: number;
  totalReward: number;
  details: string[];
} {
  const config = ANGEL_ROLE_CONFIG;
  const baseReward = Math.floor(minutes * config.rewardRates.perMinute);
  let bonusReward = 0;
  const details: string[] = [];

  // ボーナス計算
  for (const threshold of config.rewardRates.bonusThresholds) {
    if (minutes >= threshold.minutes) {
      bonusReward += threshold.bonus;
      details.push(`${threshold.minutes}分達成ボーナス: ${threshold.bonus}通貨`);
    }
  }

  const totalReward = baseReward + bonusReward;

  details.unshift(`基本報酬: ${minutes}分 × ${config.rewardRates.perMinute} = ${baseReward}通貨`);

  return {
    baseReward,
    bonusReward,
    totalReward,
    details
  };
}