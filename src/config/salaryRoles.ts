export interface SalaryRoleConfig {
  roleId: string;           // Discord ロールID（必須）
  roleName?: string;        // 表示用ロール名（オプション）
  monthlySalary: number;    // 月給額
  description: string;      // ロールの説明
  isActive: boolean;        // 有効/無効フラグ
}

/**
 * ロールID別月給設定
 * 管理者が手動で月給を支給する際の基準額
 * 
 * 使用方法:
 * 1. Discordサーバーでロールを作成
 * 2. ロールIDをコピー（開発者モード有効化→右クリック→IDをコピー）
 * 3. 以下の設定にロールIDと月給額を追加
 */
export const SALARY_ROLES: SalaryRoleConfig[] = [
  // サンプル設定（実際のロールIDに置き換えてください）
  {
    roleId: '1424768596726251651',           // 実際の管理者ロールIDに置き換え
    roleName: '最高神',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1428737130271871147',       // 実際のモデレーターロールIDに置き換え
    roleName: '女神',
    monthlySalary: 300000,
    description: '女神ロール - サーバー管理補助',
    isActive: true
  },
  {
    roleId: '1425862683521191937',       // 実際のモデレーターロールIDに置き換え
    roleName: '神徒',
    monthlySalary: 300000,
    description: '神徒ロール - サーバー管理補助',
    isActive: true
  },
  {
    roleId: '1430233479064326265',             // 実際のVIPロールIDに置き換え
    roleName: '祝印管理者',
    monthlySalary: 200000,
    description: '祝印管理者ロール - 特別会員',
    isActive: true
  },
  {
    roleId: '1425516413354774548',             // 実際のVIPロールIDに置き換え
    roleName: '選定管理者',
    monthlySalary: 200000,
    description: '選定管理者ロール - 特別会員',
    isActive: true
  },
  {
    roleId: '1425516209289302197',             // 実際のVIPロールIDに置き換え
    roleName: '先導管理者',
    monthlySalary: 200000,
    description: '先導管理者ロール - 特別会員',
    isActive: true
  },
   {
    roleId: '1429383633990455376',             // 実際のVIPロールIDに置き換え
    roleName: '先導管理代理',
    monthlySalary: 150000,
    description: '先導管理代理ロール - 特別会員',
    isActive: true
  },
   {
    roleId: '1425521423170011287',             // 実際のVIPロールIDに置き換え
    roleName: '回廊管理者',
    monthlySalary: 200000,
    description: '回廊管理者ロール - 特別会員',
    isActive: true
  },
    {
    roleId: '1429450537312714762',             // 実際のVIPロールIDに置き換え
    roleName: '回廊従者',
    monthlySalary: 150000,
    description: '回廊従者ロール - 特別会員',
    isActive: true
  },
 
  {
    roleId: 'PREMIUM_ROLE_ID',         // 実際のプレミアムロールIDに置き換え
    roleName: 'Premium',
    monthlySalary: 10000,
    description: 'プレミアムロール - 有料会員',
    isActive: true
  },
  {
    roleId: 'ACTIVE_ROLE_ID',          // 実際のアクティブロールIDに置き換え
    roleName: 'Active',
    monthlySalary: 7500,
    description: 'アクティブロール - 活発な参加者',
    isActive: true
  },
  {
    roleId: 'MEMBER_ROLE_ID',          // 実際のメンバーロールIDに置き換え
    roleName: 'Member',
    monthlySalary: 5000,
    description: '一般メンバーロール - 基本給',
    isActive: true
  },
  {
    roleId: 'NEWCOMER_ROLE_ID',        // 実際の新規メンバーロールIDに置き換え
    roleName: 'Newcomer',
    monthlySalary: 2500,
    description: '新規メンバーロール - 試用期間',
    isActive: true
  }
];

/**
 * ロールIDから月給設定を取得
 */
export function getSalaryByRoleId(roleId: string): SalaryRoleConfig | null {
  return SALARY_ROLES.find(role => 
    role.isActive && role.roleId === roleId
  ) || null;
}

/**
 * ユーザーの所持ロールから最高給与のロール設定を取得
 */
export function getHighestSalaryByRoleIds(userRoleIds: string[]): SalaryRoleConfig | null {
  const userSalaryRoles = SALARY_ROLES.filter(salaryRole => 
    salaryRole.isActive && userRoleIds.includes(salaryRole.roleId)
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
export function updateSalaryRoleById(
  roleId: string, 
  updates: Partial<SalaryRoleConfig>
): boolean {
  const roleIndex = SALARY_ROLES.findIndex(role => role.roleId === roleId);
  
  if (roleIndex === -1) return false;
  
  SALARY_ROLES[roleIndex] = { ...SALARY_ROLES[roleIndex], ...updates };
  return true;
}

/**
 * 新しいロール設定を追加
 */
export function addSalaryRoleById(roleConfig: SalaryRoleConfig): boolean {
  const exists = SALARY_ROLES.some(role => role.roleId === roleConfig.roleId);
  
  if (exists) return false;
  
  SALARY_ROLES.push(roleConfig);
  return true;
}

/**
 * ロールIDからロール名を取得（設定されていない場合はIDを返す）
 */
export function getRoleDisplayName(roleId: string): string {
  const roleConfig = getSalaryByRoleId(roleId);
  return roleConfig?.roleName || roleId;
}