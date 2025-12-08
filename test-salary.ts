import { SALARY_ROLES, getTotalSalaryByRoleIds } from './src/config/salaryRoles';

console.log('=== 給与ロール設定一覧 ===');
const activeRoles = SALARY_ROLES.filter(role => role.isActive);
activeRoles.forEach((role, index) => {
  console.log(`${index + 1}. ${role.roleName} (${role.roleId}): ${role.monthlySalary.toLocaleString()} Ru`);
});

console.log('\n=== 2,540,000 Ru の組み合わせ計算 ===');

console.log('計算パターン1: 主要高位ロール');
const pattern1 = [
  { name: '最高神', salary: 1000000 },
  { name: '女神', salary: 500000 },
  { name: '神徒', salary: 500000 },
  { name: '神官', salary: 200000 },
];
const sum1 = pattern1.reduce((sum, role) => sum + role.salary, 0);
console.log('ロール:', pattern1.map(r => r.name).join(' + '));
console.log('計算:', pattern1.map(r => r.salary.toLocaleString()).join(' + '), '=', sum1.toLocaleString(), 'Ru');
console.log('差額:', (2540000 - sum1).toLocaleString(), 'Ru');

console.log('\n計算パターン2: 専門管理者ロール追加');
const pattern2 = [
  ...pattern1,
  { name: '評価管理者', salary: 50000 },
  { name: '聖庫管理者', salary: 50000 },
  { name: '先導管理者', salary: 50000 },
  { name: '本메ンバー', salary: 50000 },
];
const sum2 = pattern2.reduce((sum, role) => sum + role.salary, 0);
console.log('ロール:', pattern2.map(r => r.name).join(' + '));
console.log('計算:', pattern2.map(r => r.salary.toLocaleString()).join(' + '), '=', sum2.toLocaleString(), 'Ru');
console.log('差額:', (2540000 - sum2).toLocaleString(), 'Ru');

console.log('\n計算パターン3: 小額ロール追加');
const pattern3 = [
  ...pattern2,
  { name: '妖精さん', salary: 20000 },
  { name: '天使管理者', salary: 20000 },
  { name: '冥界管理者', salary: 20000 },
  { name: '遊戯管理者', salary: 20000 },
  { name: '賭博管理者', salary: 20000 },
  { name: '庭園管理者', salary: 20000 },
];
const sum3 = pattern3.reduce((sum, role) => sum + role.salary, 0);
console.log('ロール:', pattern3.map(r => r.name).join(' + '));
console.log('計算:', pattern3.map(r => r.salary.toLocaleString()).join(' + '), '=', sum3.toLocaleString(), 'Ru');
console.log('差額:', (2540000 - sum3).toLocaleString(), 'Ru');

console.log('\n計算パターン4: 従者ロール追加');
const pattern4 = [
  ...pattern3,
  { name: '回廊従者', salary: 15000 },
  { name: '冥界従者', salary: 15000 },
  { name: '天使従者', salary: 15000 },
  { name: '上級選定者', salary: 50000 },
];
const sum4 = pattern4.reduce((sum, role) => sum + role.salary, 0);
console.log('ロール:', pattern4.map(r => r.name).join(' + '));
console.log('ロール数:', pattern4.length);
console.log('計算:', sum4.toLocaleString(), 'Ru');
console.log('差額:', (2540000 - sum4).toLocaleString(), 'Ru');

// 実際のgetTotalSalaryByRoleIds関数をテスト
console.log('\n=== 実際の関数テスト ===');
const testRoleIds = [
  '1424768596726251651', // 最高神
  '1428737130271871147', // 女神
  '1425862683521191937', // 神徒
  '1424764701002170368', // 神官
  '1425122228688654367', // 本メンバー
  '1424769583419490394', // 妖精さん
  '1425516413354774548', // 評価管理者
  '1425516078536065084', // 聖庫管理者
  '1425516209289302197', // 先導管理者
  '1428713909174669312', // 天使管理者
  '1425869955647275059', // 冥界管理者
  '1425515887435186327', // 遊戯管理者
  '1425515923455873215', // 賭博管理者
  '1425516036278718626', // 庭園管理者
];

const result = getTotalSalaryByRoleIds(testRoleIds);
console.log('入力ロールID数:', testRoleIds.length);
console.log('マッチしたロール数:', result.roles.length);
console.log('適用されたロール:');
result.roles.forEach(role => {
  console.log(`  - ${role.roleName}: ${role.monthlySalary.toLocaleString()} Ru`);
});
console.log('総支給額:', result.totalSalary.toLocaleString(), 'Ru');
console.log('メインロール:', result.primaryRole?.roleName);

export {};