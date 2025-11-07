import { Client, GatewayIntentBits } from 'discord.js';
import { getTotalSalaryByRoleIds, SALARY_ROLES } from './src/config/salaryRoles';

// Discord botクライアントを作成
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

async function calculateUserSalary(userId: string) {
  try {
    console.log('=== ユーザー給与計算 ===');
    console.log(`対象ユーザーID: ${userId}`);
    
    // Botをログイン
    await client.login(process.env['DISCORD_TOKEN']);
    console.log('Botにログインしました');

    // ギルドを取得（最初のギルドを使用）
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('ギルドが見つかりません');
      return;
    }
    console.log(`ギルド: ${guild.name}`);

    // メンバーを取得
    const member = await guild.members.fetch(userId);
    if (!member) {
      console.error('メンバーが見つかりません');
      return;
    }
    
    console.log(`\n=== ユーザー情報 ===`);
    console.log(`ユーザー名: ${member.user.username}`);
    console.log(`表示名: ${member.displayName}`);
    console.log(`ニックネーム: ${member.nickname || 'なし'}`);
    
    // ユーザーの全ロールを取得
    const userRoles = member.roles.cache;
    console.log(`\n=== 保有ロール一覧 (${userRoles.size}個) ===`);
    
    const userRoleIds: string[] = [];
    userRoles.forEach(role => {
      if (role.name !== '@everyone') { // @everyoneロールを除外
        console.log(`- ${role.name} (ID: ${role.id})`);
        userRoleIds.push(role.id);
      }
    });

    // 給与対象ロールをチェック
    console.log(`\n=== 給与対象ロール照合 ===`);
    const salaryRoles = SALARY_ROLES.filter(salaryRole => 
      salaryRole.isActive && userRoleIds.includes(salaryRole.roleId)
    );
    
    if (salaryRoles.length === 0) {
      console.log('❌ 給与対象ロールがありません');
      console.log('\n利用可能な給与ロール:');
      SALARY_ROLES.filter(r => r.isActive).forEach(role => {
        console.log(`  - ${role.roleName} (${role.monthlySalary.toLocaleString()} Ru)`);
      });
    } else {
      console.log(`✅ ${salaryRoles.length}個の給与対象ロールが見つかりました:`);
      salaryRoles.forEach((role, index) => {
        console.log(`${index + 1}. ${role.roleName}: ${role.monthlySalary.toLocaleString()} Ru`);
      });
      
      // getTotalSalaryByRoleIds関数を使って計算
      const salaryInfo = getTotalSalaryByRoleIds(userRoleIds);
      
      console.log(`\n=== 給与計算結果 ===`);
      console.log(`総支給額: ${salaryInfo.totalSalary.toLocaleString()} Ru`);
      console.log(`適用ロール数: ${salaryInfo.roles.length}個`);
      console.log(`メインロール: ${salaryInfo.primaryRole?.roleName || 'なし'}`);
      
      if (salaryInfo.roles.length > 1) {
        console.log(`\n=== 計算内訳 ===`);
        const calculation = salaryInfo.roles.map(r => r.monthlySalary.toLocaleString()).join(' + ');
        console.log(`計算式: ${calculation} = ${salaryInfo.totalSalary.toLocaleString()} Ru`);
        
        console.log(`詳細内訳:`);
        salaryInfo.roles.forEach((role, index) => {
          console.log(`  ${index + 1}. ${role.roleName}: ${role.monthlySalary.toLocaleString()} Ru`);
        });
      }
      
      // 高額給与の場合の警告
      if (salaryInfo.totalSalary > 1000000) {
        console.log(`\n⚠️  警告: 高額給与 (${salaryInfo.totalSalary.toLocaleString()} Ru)`);
        console.log(`複数の高位ロールによる合算の可能性があります`);
      }
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    client.destroy();
  }
}

// ユーザーIDが引数で指定されているかチェック
const userId = process.argv[2] || '1383840008372355232';
calculateUserSalary(userId);

export {};