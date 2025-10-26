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
    roleId: '1424768596726251651',         
    roleName: '最高神',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1428737130271871147',         
    roleName: '女神',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425862683521191937', 
    roleName: '神徒',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1424764701002170368',         
    roleName: '神官',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1424769583419490394',         
    roleName: '妖精さん',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425122228688654367',         
    roleName: '大天使',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1424766502019797054',         
    roleName: 'ネフィリム',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425516413354774548',         
    roleName: '選定管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425516078536065084',         
    roleName: '聖庫管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425521423170011287',         
    roleName: '回廊管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425516209289302197',         
    roleName: '先導管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1430233479064326265',         
    roleName: '祝印管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1428713909174669312',         
    roleName: '天使管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425869955647275059',         
    roleName: '冥界管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1426934729537753269',         
    roleName: '秘の扉管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425515887435186327',         
    roleName: '遊戯管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425515923455873215',         
    roleName: '賭博管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425516036278718626',         
    roleName: '庭園管理者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1429383633990455376',         
    roleName: '先導管理代理',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1429450537312714762',         
    roleName: '回廊従者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1426591044140794028',         
    roleName: '冥界従者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1429450223637364808',         
    roleName: '天使従者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425535260539617500',         
    roleName: '先導者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1426197289449553942',         
    roleName: '先導者見習い',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425518162388062282',         
    roleName: '上級選定者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425518223293419671',         
    roleName: '中級選定者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425518333050097724',         
    roleName: '下級選定者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1425522944708182128',         
    roleName: '見習い選定者',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1424764397842202676',         
    roleName: 'Server Booster',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1430596803878981795',         
    roleName: 'シスター',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
  {
    roleId: '1430597622703456389',         
    roleName: '神父',
    monthlySalary: 500000,
    description: '管理者ロール - 最高権限',
    isActive: true
  },
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