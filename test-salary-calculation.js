// 給与計算のテストスクリプト
// Node.jsで直接実行するため、salaryRoles.tsの内容を手動でコピー

console.log('=== 給与ロール設定一覧 ===');
SALARY_ROLES.forEach((role, index) => {
  if (role.isActive) {
    console.log(`${index + 1}. ${role.roleName} (${role.roleId}): ${role.monthlySalary.toLocaleString()} Ru`);
  }
});

console.log('\n=== テストケース1: 単一ロール（女神のみ） ===');
const goddessRoleId = '1428737130271871147';
const singleRoleTest = getTotalSalaryByRoleIds([goddessRoleId]);
console.log('入力ロールID:', [goddessRoleId]);
console.log('計算結果:', singleRoleTest);
console.log('総支給額:', singleRoleTest.totalSalary.toLocaleString(), 'Ru');

console.log('\n=== テストケース2: 複数ロール（高位ロール組み合わせ） ===');
const multipleHighRoles = [
  '1424768596726251651', // 最高神 1,000,000
  '1428737130271871147', // 女神 500,000
  '1425862683521191937', // 神徒 500,000
  '1424764701002170368', // 神官 200,000
];
const multipleRoleTest = getTotalSalaryByRoleIds(multipleHighRoles);
console.log('入力ロールID:', multipleHighRoles);
console.log('各ロールの詳細:');
multipleRoleTest.roles.forEach(role => {
  console.log(`  - ${role.roleName}: ${role.monthlySalary.toLocaleString()} Ru`);
});
console.log('計算式:', multipleRoleTest.roles.map(r => r.monthlySalary.toLocaleString()).join(' + '), '=', multipleRoleTest.totalSalary.toLocaleString(), 'Ru');
console.log('総支給額:', multipleRoleTest.totalSalary.toLocaleString(), 'Ru');
console.log('メインロール:', multipleRoleTest.primaryRole?.roleName);

console.log('\n=== テストケース3: 2,540,000 Ru を再現するロール組み合わせ ===');
// 2,540,000 Ruになる可能性のある組み合わせを探す
const targetAmount = 2540000;
console.log('目標金額:', targetAmount.toLocaleString(), 'Ru');

// すべてのアクティブなロールの組み合わせを試す
const activeRoles = SALARY_ROLES.filter(role => role.isActive);
console.log('アクティブロール数:', activeRoles.length);

// 可能な組み合わせを生成して目標額に近いものを探す
function findCombinations(roles, target, maxRoles = 10) {
  const results = [];
  
  function backtrack(start, currentCombo, currentSum) {
    if (currentSum === target) {
      results.push([...currentCombo]);
      return;
    }
    
    if (currentSum > target || currentCombo.length >= maxRoles) {
      return;
    }
    
    for (let i = start; i < roles.length; i++) {
      currentCombo.push(roles[i]);
      backtrack(i + 1, currentCombo, currentSum + roles[i].monthlySalary);
      currentCombo.pop();
    }
  }
  
  backtrack(0, [], 0);
  return results;
}

console.log('2,540,000 Ruになる組み合わせを探索中...');
const combinations = findCombinations(activeRoles, targetAmount);

if (combinations.length > 0) {
  console.log(`見つかった組み合わせ数: ${combinations.length}`);
  combinations.slice(0, 3).forEach((combo, index) => {
    console.log(`\n組み合わせ ${index + 1}:`);
    combo.forEach(role => {
      console.log(`  - ${role.roleName}: ${role.monthlySalary.toLocaleString()} Ru`);
    });
    const total = combo.reduce((sum, role) => sum + role.monthlySalary, 0);
    console.log(`  合計: ${total.toLocaleString()} Ru`);
  });
} else {
  console.log('2,540,000 Ru ちょうどになる組み合わせは見つかりませんでした');
  
  // 近い金額の組み合わせを探す
  console.log('\n近い金額の組み合わせを探索中...');
  const closeResults = [];
  
  function findClose(roles, target, tolerance = 100000) {
    for (let i = 0; i < Math.min(1000, Math.pow(2, roles.length)); i++) {
      const combo = [];
      let sum = 0;
      
      for (let j = 0; j < roles.length; j++) {
        if (i & (1 << j)) {
          combo.push(roles[j]);
          sum += roles[j].monthlySalary;
        }
      }
      
      if (Math.abs(sum - target) <= tolerance && combo.length > 0) {
        closeResults.push({ combo, sum, diff: Math.abs(sum - target) });
      }
    }
    
    return closeResults.sort((a, b) => a.diff - b.diff);
  }
  
  const closeMatches = findClose(activeRoles, targetAmount);
  
  if (closeMatches.length > 0) {
    console.log('近い金額の組み合わせ (上位3つ):');
    closeMatches.slice(0, 3).forEach((match, index) => {
      console.log(`\n候補 ${index + 1} (差額: ${match.diff.toLocaleString()} Ru):`);
      match.combo.forEach(role => {
        console.log(`  - ${role.roleName}: ${role.monthlySalary.toLocaleString()} Ru`);
      });
      console.log(`  合計: ${match.sum.toLocaleString()} Ru`);
    });
  }
}

console.log('\n=== テストケース4: 実際の getTotalSalaryByRoleIds 関数のテスト ===');
// 2,540,000 Ruに近い組み合わせで実際の関数をテスト
const testRoleIds = [
  '1424768596726251651', // 最高神 1,000,000
  '1428737130271871147', // 女神 500,000
  '1425862683521191937', // 神徒 500,000
  '1424764701002170368', // 神官 200,000
  '1425122228688654367', // 本メンバー 50,000
  '1424769583419490394', // 妖精さん 20,000
  '1425516413354774548', // 評価管理者 50,000
  '1425516078536065084', // 聖庫管理者 50,000
  '1425516209289302197', // 先導管理者 50,000
  '1428713909174669312', // 天使管理者 20,000
  '1425869955647275059', // 冥界管理者 20,000
  '1425515887435186327', // 遊戯管理者 20,000
  '1425515923455873215', // 賭博管理者 20,000
  '1425516036278718626', // 庭園管理者 20,000
  '1429450537312714762', // 回廊従者 15,000
];

console.log('大量ロール組み合わせテスト:');
const massiveRoleTest = getTotalSalaryByRoleIds(testRoleIds);
console.log('入力ロール数:', testRoleIds.length);
console.log('適用されたロール数:', massiveRoleTest.roles.length);
console.log('適用されたロール:');
massiveRoleTest.roles.forEach(role => {
  console.log(`  - ${role.roleName}: ${role.monthlySalary.toLocaleString()} Ru`);
});
console.log('総支給額:', massiveRoleTest.totalSalary.toLocaleString(), 'Ru');
console.log('メインロール:', massiveRoleTest.primaryRole?.roleName);

// 手動計算との比較
const manualSum = massiveRoleTest.roles.reduce((sum, role) => sum + role.monthlySalary, 0);
console.log('手動計算結果:', manualSum.toLocaleString(), 'Ru');
console.log('関数計算結果:', massiveRoleTest.totalSalary.toLocaleString(), 'Ru');
console.log('計算一致:', manualSum === massiveRoleTest.totalSalary ? '✅' : '❌');