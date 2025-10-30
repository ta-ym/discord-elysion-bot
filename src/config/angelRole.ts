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
    perMinute: 0.0625, // 1分あたり0.0625通貨（5÷80）
    bonusThresholds: [
      { minutes: 60, bonus: 1.25 },   // 1時間で1.25通貨ボーナス（100÷80）
      { minutes: 180, bonus: 3.75 },  // 3時間で3.75通貨ボーナス（300÷80）
      { minutes: 360, bonus: 7.5 },   // 6時間で7.5通貨ボーナス（600÷80）
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
  const baseReward = Math.round(minutes * config.rewardRates.perMinute * 100) / 100; // 小数点第2位で四捨五入
  let bonusReward = 0;
  const details: string[] = [];

  // ボーナス計算
  for (const threshold of config.rewardRates.bonusThresholds) {
    if (minutes >= threshold.minutes) {
      bonusReward += threshold.bonus;
      details.push(`${threshold.minutes}分達成ボーナス: ${threshold.bonus}通貨`);
    }
  }

  const totalReward = Math.round((baseReward + bonusReward) * 100) / 100; // 小数点第2位で四捨五入

  details.unshift(`基本報酬: ${minutes}分 × ${config.rewardRates.perMinute} = ${baseReward}通貨`);

  return {
    baseReward,
    bonusReward,
    totalReward,
    details
  };
}