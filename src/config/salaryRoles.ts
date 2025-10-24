export interface SalaryRoleConfig {
  roleName: string;
  roleId?: string; // オプション：特定のロールIDを設定する場合
  monthlySalary: number;
  description: string;
  isActive: boolean;
}

/**
 * ロール別月給設定
 * 管理者が手動で月給を支給する際の基準額
 */
export const SALARY_ROLES: SalaryRoleConfig[] = [
  {
    roleName: 'admin',
    monthlySalary: 30000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleName: 'moderator',
    monthlySalary: 20000,
    description: 'モデレーターロール - サーバー管理補助',
    isActive: true
  },
  {
    roleName: 'vip',
    monthlySalary: 15000,
    description: 'VIPロール - 特別会員',
    isActive: true
  },
  {
    roleName: 'premium',
    monthlySalary: 10000,
    description: 'プレミアムロール - 有料会員',
    isActive: true
  },
  {
    roleName: 'active',
    monthlySalary: 7500,
    description: 'アクティブロール - 活発な参加者',
    isActive: true
  },
  {
    roleName: 'member',
    monthlySalary: 5000,
    description: '一般メンバーロール - 基本給',
    isActive: true
  },
  {
    roleName: 'newcomer',
    monthlySalary: 2500,
    description: '新規メンバーロール - 試用期間',
    isActive: true
  }
];

/**
 * ロール名から月給設定を取得
 */
export function getSalaryByRoleName(roleName: string): SalaryRoleConfig | null {
  return SALARY_ROLES.find(role => 
    role.isActive && role.roleName.toLowerCase() === roleName.toLowerCase()
  ) || null;
}

/**
 * ユーザーの最高権限ロールに基づく月給を取得
 */
export function getHighestSalary(userRoles: string[]): SalaryRoleConfig | null {
  const userSalaryRoles = SALARY_ROLES.filter(salaryRole => 
    salaryRole.isActive && userRoles.some(userRole => 
      userRole.toLowerCase().includes(salaryRole.roleName.toLowerCase())
    )
  );

  if (userSalaryRoles.length === 0) return null;

  // 最高額の給与を返す
  return userSalaryRoles.reduce((highest, current) => 
    current.monthlySalary > highest.monthlySalary ? current : highest
  );
}

/**
 * 全てのアクティブなロール設定を取得
 */
export function getActiveSalaryRoles(): SalaryRoleConfig[] {
  return SALARY_ROLES.filter(role => role.isActive);
}

/**
 * ロール設定を動的に更新（実行時変更用）
 */
export function updateSalaryRole(
  roleName: string, 
  updates: Partial<SalaryRoleConfig>
): boolean {
  const roleIndex = SALARY_ROLES.findIndex(role => 
    role.roleName.toLowerCase() === roleName.toLowerCase()
  );
  
  if (roleIndex === -1) return false;
  
  SALARY_ROLES[roleIndex] = { ...SALARY_ROLES[roleIndex], ...updates };
  return true;
}

/**
 * 新しいロール設定を追加
 */
export function addSalaryRole(roleConfig: SalaryRoleConfig): boolean {
  const exists = SALARY_ROLES.some(role => 
    role.roleName.toLowerCase() === roleConfig.roleName.toLowerCase()
  );
  
  if (exists) return false;
  
  SALARY_ROLES.push(roleConfig);
  return true;
}