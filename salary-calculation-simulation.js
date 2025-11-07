// ユーザーID 1383840008372355232 の給与計算シミュレーション

// salaryRoles.tsから給与設定を抽出
const SALARY_ROLES = [
  { roleId: '1424768596726251651', roleName: '最高神', monthlySalary: 1000000, isActive: true },
  { roleId: '1428737130271871147', roleName: '女神', monthlySalary: 500000, isActive: true },
  { roleId: '1425862683521191937', roleName: '神徒', monthlySalary: 500000, isActive: true },
  { roleId: '1424764701002170368', roleName: '神官', monthlySalary: 200000, isActive: true },
  { roleId: '1424769583419490394', roleName: '妖精さん', monthlySalary: 20000, isActive: true },
  { roleId: '1425122228688654367', roleName: '本メンバー', monthlySalary: 50000, isActive: true },
  { roleId: '1424766502019797054', roleName: '仮メンバー', monthlySalary: 10000, isActive: true },
  { roleId: '1425516413354774548', roleName: '評価管理者', monthlySalary: 50000, isActive: true },
  { roleId: '1425516078536065084', roleName: '聖庫管理者', monthlySalary: 50000, isActive: true },
  { roleId: '1425516209289302197', roleName: '先導管理者', monthlySalary: 50000, isActive: true },
  { roleId: '1428713909174669312', roleName: '天使管理者', monthlySalary: 20000, isActive: true },
  { roleId: '1425869955647275059', roleName: '冥界管理者', monthlySalary: 20000, isActive: true },
  { roleId: '1425515887435186327', roleName: '遊戯管理者', monthlySalary: 20000, isActive: true },
  { roleId: '1425515923455873215', roleName: '賭博管理者', monthlySalary: 20000, isActive: true },
  { roleId: '1425516036278718626', roleName: '庭園管理者', monthlySalary: 20000, isActive: true },
  { roleId: '1429450537312714762', roleName: '回廊従者', monthlySalary: 15000, isActive: true },
  { roleId: '1426591044140794028', roleName: '冥界従者', monthlySalary: 15000, isActive: true },
  { roleId: '1429450223637364808', roleName: '天使従者', monthlySalary: 15000, isActive: true },
  { roleId: '1425518162388062282', roleName: '上級選定者', monthlySalary: 50000, isActive: true },
  { roleId: '1425518223293419671', roleName: '中級選定者', monthlySalary: 30000, isActive: true },
  { roleId: '1425518333050097724', roleName: '下級選定者', monthlySalary: 20000, isActive: true },
  { roleId: '1425522944708182128', roleName: '見習い選定者', monthlySalary: 10000, isActive: true },
  { roleId: '1424764397842202676', roleName: 'Server Booster', monthlySalary: 10000, isActive: true },
];

console.log('=== 給与計算シミュレーション ===');
console.log('対象ユーザーID: 1383840008372355232');
console.log('\n=== 利用可能な給与ロール ===');
SALARY_ROLES.forEach((role, index) => {
  console.log(`${index + 1}. ${role.roleName} (${role.roleId}): ${role.monthlySalary.toLocaleString()} Ru`);
});

console.log('\n=== 実際の使用方法 ===');
console.log('1. Discordサーバーで /salary-diagnostic @ユーザー名 を実行');
console.log('2. または /salary-details を使って個別確認');
console.log('3. Bot経由でユーザーの実際のロールを取得');

console.log('\n=== 手動確認手順 ===');
console.log('1. Discordサーバーでユーザーを右クリック');
console.log('2. 「プロフィール」を選択');
console.log('3. ロールタブで現在のロールを確認');
console.log('4. 上記のSALARY_ROLESと照合');
console.log('5. 該当するロールのmonthlySalaryを合算');

// getTotalSalaryByRoleIds関数の動作をシミュレート
function simulateGetTotalSalaryByRoleIds(userRoleIds) {
  console.log(`\n=== 給与計算シミュレーション ===`);
  console.log('入力ロールID:', userRoleIds);
  
  const userSalaryRoles = SALARY_ROLES.filter(salaryRole => 
    salaryRole.isActive && userRoleIds.includes(salaryRole.roleId)
  );

  if (userSalaryRoles.length === 0) {
    console.log('❌ 給与対象ロールがありません');
    return { totalSalary: 0, roles: [], primaryRole: null };
  }

  console.log(`✅ ${userSalaryRoles.length}個の給与対象ロールが見つかりました:`);
  userSalaryRoles.forEach((role, index) => {
    console.log(`${index + 1}. ${role.roleName}: ${role.monthlySalary.toLocaleString()} Ru`);
  });

  const totalSalary = userSalaryRoles.reduce((total, role) => total + role.monthlySalary, 0);
  const primaryRole = userSalaryRoles.reduce((highest, current) => 
    current.monthlySalary > highest.monthlySalary ? current : highest
  );

  if (userSalaryRoles.length > 1) {
    const calculation = userSalaryRoles.map(r => r.monthlySalary.toLocaleString()).join(' + ');
    console.log(`\n計算式: ${calculation} = ${totalSalary.toLocaleString()} Ru`);
  }

  console.log(`\n最終結果:`);
  console.log(`- 総支給額: ${totalSalary.toLocaleString()} Ru`);
  console.log(`- メインロール: ${primaryRole.roleName}`);
  console.log(`- 適用ロール数: ${userSalaryRoles.length}個`);

  return { totalSalary, roles: userSalaryRoles, primaryRole };
}

// テストケース
console.log('\n=== テストケース実行 ===');

console.log('\nテストケース1: 高位ロール組み合わせ');
simulateGetTotalSalaryByRoleIds([
  '1424768596726251651', // 最高神
  '1428737130271871147', // 女神
  '1425862683521191937', // 神徒
]);

console.log('\nテストケース2: 単一ロール');
simulateGetTotalSalaryByRoleIds([
  '1428737130271871147', // 女神のみ
]);

console.log('\nテストケース3: 存在しないロール');
simulateGetTotalSalaryByRoleIds([
  '9999999999999999999', // 存在しないID
]);

console.log('\n=== 重要な注意事項 ===');
console.log('⚠️  実際のユーザーロールを確認するには、Botコマンドを使用してください');
console.log('⚠️  このシミュレーションは給与計算ロジックの動作確認用です');
console.log('⚠️  実際の支給はBotで実行する必要があります');