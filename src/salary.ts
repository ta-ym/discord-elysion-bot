export interface SalaryConfig {
  roleId: string;
  roleName: string;
  dailySalary: number;
  color: string;
  emoji: string;
}

export interface SalaryClaim {
  id: number;
  user_id: string;
  role_id: string;
  amount: number;
  claim_date: string;
  created_at: string;
}

// デフォルトの給与設定（後で管理者が変更可能）
export const DEFAULT_SALARY_CONFIG: SalaryConfig[] = [
  {
    roleId: 'admin',
    roleName: '管理者',
    dailySalary: 1000,
    color: '#ff0000',
    emoji: '👑'
  },
  {
    roleId: 'moderator', 
    roleName: 'モデレーター',
    dailySalary: 500,
    color: '#00ff00',
    emoji: '🛡️'
  },
  {
    roleId: 'vip',
    roleName: 'VIP',
    dailySalary: 300,
    color: '#ffff00',
    emoji: '⭐'
  },
  {
    roleId: 'member',
    roleName: '一般メンバー',
    dailySalary: 100,
    color: '#0099ff',
    emoji: '👤'
  }
];

export class SalaryManager {
  private salaryConfig: Map<string, SalaryConfig>;

  constructor(config: SalaryConfig[] = DEFAULT_SALARY_CONFIG) {
    this.salaryConfig = new Map();
    config.forEach(conf => {
      this.salaryConfig.set(conf.roleId, conf);
    });
  }

  // ユーザーの最高ロールに基づく給与を取得
  getUserSalary(userRoles: string[]): SalaryConfig | null {
    // 優先順位順に確認（admin > moderator > vip > member）
    const priorities = ['admin', 'moderator', 'vip', 'member'];
    
    for (const priority of priorities) {
      if (userRoles.includes(priority) && this.salaryConfig.has(priority)) {
        return this.salaryConfig.get(priority)!;
      }
    }
    
    return null; // 対象ロールなし
  }

  // 設定を更新
  updateSalaryConfig(roleId: string, config: Partial<SalaryConfig>): void {
    const existing = this.salaryConfig.get(roleId);
    if (existing) {
      this.salaryConfig.set(roleId, { ...existing, ...config });
    }
  }

  // 全設定を取得
  getAllConfigs(): SalaryConfig[] {
    return Array.from(this.salaryConfig.values());
  }
}