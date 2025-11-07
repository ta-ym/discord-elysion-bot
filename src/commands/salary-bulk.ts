import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember, User } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';
import { getActiveSalaryRoles, getRoleDisplayName, getTotalSalaryByRoleIds, SalaryRoleConfig } from '../config/salaryRoles';
import { hasSalaryPermission, getSalaryPermissionErrorMessage } from '../utils/permissions';

// ユーザー分析結果の型定義
interface UserAnalysis {
  userId: string;
  username: string;
  displayName: string;
  roles: SalaryRoleConfig[];
  totalSalary: number;
  primaryRole: SalaryRoleConfig | null;
  alreadyPaid: boolean;
  canReceive: boolean;
  errorMessage?: string;
}

interface BulkAnalysisResult {
  users: UserAnalysis[];
  summary: {
    totalUsers: number;
    eligibleUsers: number;
    alreadyPaidUsers: number;
    errorUsers: number;
    totalSalaryAmount: number;
    uniqueRoles: Set<string>;
  };
}

// 全ユーザーの給与情報を分析する関数
async function analyzeAllUsers(
  guild: any, 
  database: Database, 
  targetMonth: string
): Promise<BulkAnalysisResult> {
  const users: UserAnalysis[] = [];
  const uniqueRoles = new Set<string>();
  let totalSalaryAmount = 0;
  let eligibleUsers = 0;
  let alreadyPaidUsers = 0;
  let errorUsers = 0;

  console.log(`[BULK ANALYSIS] Starting analysis for ${guild.memberCount} members`);
  
  // 全メンバーを分析
  for (const [, member] of guild.members.cache) {
    try {
      // ボットユーザーはスキップ
      if (member.user.bot) continue;

      const userRoleIds = member.roles.cache.map((r: any) => r.id);
      const salaryInfo = getTotalSalaryByRoleIds(userRoleIds);
      
      // 給与対象ロールを持っているかチェック
      if (salaryInfo.totalSalary === 0 || !salaryInfo.primaryRole) {
        continue; // 給与対象外のユーザーはリストに含めない
      }

      // 既に支給済みかチェック
      let alreadyPaid = false;
      try {
        const existingPayment = await database.checkMonthlySalaryStatus(member.user.id, targetMonth);
        alreadyPaid = existingPayment !== null;
      } catch (dbError) {
        console.warn(`[BULK ANALYSIS] Database check failed for ${member.user.username}:`, dbError);
      }

      const userAnalysis: UserAnalysis = {
        userId: member.user.id,
        username: member.user.username,
        displayName: member.displayName,
        roles: salaryInfo.roles,
        totalSalary: salaryInfo.totalSalary,
        primaryRole: salaryInfo.primaryRole,
        alreadyPaid,
        canReceive: !alreadyPaid
      };

      users.push(userAnalysis);

      // 統計情報を更新
      salaryInfo.roles.forEach(role => uniqueRoles.add(role.roleName || role.roleId));
      
      if (alreadyPaid) {
        alreadyPaidUsers++;
      } else {
        eligibleUsers++;
        totalSalaryAmount += salaryInfo.totalSalary;
      }

    } catch (error) {
      console.error(`[BULK ANALYSIS] Error analyzing user ${member.user.username}:`, error);
      
      users.push({
        userId: member.user.id,
        username: member.user.username,
        displayName: member.displayName,
        roles: [],
        totalSalary: 0,
        primaryRole: null,
        alreadyPaid: false,
        canReceive: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      
      errorUsers++;
    }
  }

  console.log(`[BULK ANALYSIS] Analysis complete: ${users.length} salary-eligible users found`);

  return {
    users: users.sort((a, b) => b.totalSalary - a.totalSalary), // 給与額でソート
    summary: {
      totalUsers: users.length,
      eligibleUsers,
      alreadyPaidUsers,
      errorUsers,
      totalSalaryAmount,
      uniqueRoles
    }
  };
}

// プレビュー結果を表示する関数
async function showPreviewResults(
  interaction: ChatInputCommandInteraction, 
  analysis: BulkAnalysisResult, 
  targetMonth: string
): Promise<void> {
  const { users, summary } = analysis;

  // サマリーEmbed
  const summaryEmbed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle('📊 一斉給与支給 事前確認')
    .setDescription(`**${targetMonth}** の給与支給対象者と金額の分析結果`)
    .addFields(
      { name: '👥 給与対象者', value: `${summary.totalUsers}人`, inline: true },
      { name: '💚 支給可能', value: `${summary.eligibleUsers}人`, inline: true },
      { name: '⏭️ 支給済み', value: `${summary.alreadyPaidUsers}人`, inline: true },
      { name: '💰 総支給予定額', value: `${summary.totalSalaryAmount.toLocaleString()} Ru`, inline: true },
      { name: '🏷️ 関連ロール数', value: `${summary.uniqueRoles.size}個`, inline: true },
      { name: '⚠️ エラー', value: `${summary.errorUsers}人`, inline: true }
    )
    .setFooter({ text: '詳細リストは下のボタンで確認できます' })
    .setTimestamp();

  // 支給対象者の詳細を追加
  if (summary.eligibleUsers > 0) {
    const eligibleList = users
      .filter(u => u.canReceive)
      .slice(0, 10) // 最初の10人のみ表示
      .map(u => `• **${u.displayName}**: ${u.totalSalary.toLocaleString()} Ru (${u.roles.length}ロール)`)
      .join('\n');
    
    summaryEmbed.addFields({
      name: `💚 支給対象者 (上位${Math.min(summary.eligibleUsers, 10)}人)`,
      value: eligibleList + (summary.eligibleUsers > 10 ? `\n... 他${summary.eligibleUsers - 10}人` : ''),
      inline: false
    });
  }

  // ボタン作成
  const buttonRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('salary_preview_eligible')
        .setLabel(`支給対象者 (${summary.eligibleUsers}人)`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('💚'),
      new ButtonBuilder()
        .setCustomId('salary_preview_paid')
        .setLabel(`支給済み (${summary.alreadyPaidUsers}人)`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏭️'),
      new ButtonBuilder()
        .setCustomId('salary_preview_roles')
        .setLabel('ロール別集計')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🏷️')
    );

  // 実行確認ボタン（支給対象者がいる場合のみ）
  if (summary.eligibleUsers > 0) {
    const executeRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`salary_bulk_execute_${targetMonth}`)
          .setLabel('⚡ 実際の給与支給を実行')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('💰')
      );

    await interaction.editReply({
      embeds: [summaryEmbed],
      components: [buttonRow, executeRow]
    });
  } else {
    await interaction.editReply({
      embeds: [summaryEmbed],
      components: [buttonRow]
    });
  }

  // 分析結果を記録
  console.log(`[BULK PREVIEW] Generated preview for ${users.length} users - ${summary.eligibleUsers} eligible, ${summary.alreadyPaidUsers} already paid`);
}

// 給与内訳をDMで送信する関数
async function sendSalaryBreakdownDM(user: User, salaryInfo: { totalSalary: number; roles: SalaryRoleConfig[]; primaryRole: SalaryRoleConfig | null }, targetMonth: string): Promise<void> {
  try {
    // DM送信可能かチェック
    const dmChannel = await user.createDM();
    
    // 計算式を明確に表示
    const calculationFormula = salaryInfo.roles.length > 1 ? 
      `${salaryInfo.roles.map(r => r.monthlySalary.toLocaleString()).join(' + ')} = ${salaryInfo.totalSalary.toLocaleString()} Ru` :
      `${salaryInfo.totalSalary.toLocaleString()} Ru`;

    const breakdownEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('💰 月給支給のお知らせ')
      .setDescription(`**${targetMonth}** の月給が支給されました！`)
      .addFields(
        { name: '💵 支給総額', value: `**${salaryInfo.totalSalary.toLocaleString()} Ru**`, inline: false },
        { name: '🧮 計算式', value: `\`${calculationFormula}\``, inline: false },
        { name: '📊 給与内訳', value: 
          salaryInfo.roles.map((role, index) => 
            `${index + 1}. **${role.roleName || role.roleId}**: ${role.monthlySalary.toLocaleString()} Ru`
          ).join('\n'), inline: false },
        { name: '🏆 メインロール', value: salaryInfo.primaryRole?.roleName || 'なし', inline: true },
        { name: '🔢 適用ロール数', value: `${salaryInfo.roles.length}個`, inline: true },
        { name: '📅 支給月', value: targetMonth, inline: true }
      )
      .setFooter({ text: '給与計算についてご質問がありましたら管理者にお声かけください' })
      .setTimestamp();

    // 計算が複雑な場合の注意書きを追加
    if (salaryInfo.roles.length > 1) {
      breakdownEmbed.addFields({
        name: '⚠️ 複数ロール適用',
        value: `あなたは${salaryInfo.roles.length}個の給与対象ロールを持っているため、全ての給与が合算されて支給されています。`,
        inline: false
      });
    }

    await dmChannel.send({ embeds: [breakdownEmbed] });
    console.log(`[SALARY-DM] Successfully sent salary breakdown to ${user.username} (${user.id})`);
    
  } catch (error) {
    console.warn(`[SALARY-DM] Failed to send DM to ${user.username} (${user.id}):`, error);
    // DMに失敗してもエラーを投げない（メイン処理を継続するため）
  }
}

const salaryBulkCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('salary-bulk')
    .setDescription('登録された全ロールのメンバーに一斉給与支給を行います')
    .addStringOption(option =>
      option.setName('month')
        .setDescription('支給対象月（YYYY-MM形式、省略時は今月）')
        .setRequired(false)
        .setMaxLength(7))
    .addBooleanOption(option =>
      option.setName('preview')
        .setDescription('事前確認モード：実際の支給を行わず、対象者と支給額のみを表示します')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const database = new Database();
    const isPreviewMode = interaction.options.getBoolean('preview') ?? false;
    
    // 権限チェック
    if (!hasSalaryPermission(member)) {
      await interaction.reply({
        content: getSalaryPermissionErrorMessage(),
        ephemeral: true
      });
      return;
    }

    // 最初にdeferReplyを実行
    await interaction.deferReply();

    try {
      const targetMonth = interaction.options.getString('month') || 
        new Date().toISOString().slice(0, 7); // YYYY-MM

      // 月形式のバリデーション
      if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
        await interaction.editReply({
          content: '❌ 月の形式が正しくありません。YYYY-MM形式で入力してください。（例: 2023-12）'
        });
        return;
      }

      // アクティブな給与ロール設定を取得
      const activeSalaryRoles = getActiveSalaryRoles();
      
      if (activeSalaryRoles.length === 0) {
        await interaction.editReply({
          content: '❌ アクティブな給与ロール設定が見つかりません。'
        });
        return;
      }

      // サーバーの全メンバーを取得
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply({
          content: '❌ サーバー情報の取得に失敗しました。'
        });
        return;
      }

      await guild.members.fetch(); // 全メンバーをキャッシュに読み込み

      // 全ユーザーの給与情報を分析
      const allUserAnalysis = await analyzeAllUsers(guild, database, targetMonth);
      
      // プレビューモードの場合は分析結果のみ表示
      if (isPreviewMode) {
        await showPreviewResults(interaction, allUserAnalysis, targetMonth);
        return;
      }

      // 分析結果を使用して給与支給を実行
      console.log(`[BULK SALARY] Executing salary payment for ${allUserAnalysis.summary.eligibleUsers} eligible users`);
      
      let totalProcessed = 0;
      let totalSuccess = 0;
      let totalSkipped = allUserAnalysis.summary.alreadyPaidUsers;
      let totalErrors = 0;
      let totalAmount = 0;

      // 分析済みユーザーを処理（より効率的）
      for (const userAnalysis of allUserAnalysis.users) {
        if (!userAnalysis.canReceive) {
          continue;
        }

        totalProcessed++;
        
        try {
          // 合算給与を支給
          console.log(`[SALARY-BULK] Processing user: ${userAnalysis.username} (${userAnalysis.userId})`);
          console.log(`[SALARY-BULK] Salary info:`, { 
            totalSalary: userAnalysis.totalSalary, 
            primaryRole: userAnalysis.primaryRole?.roleName,
            roleCount: userAnalysis.roles.length 
          });
          
          const roleNames = userAnalysis.roles.map(role => getRoleDisplayName(role.roleId)).join(', ');
          
          const salarySuccess = await database.payMonthlySalary(
            userAnalysis.userId,
            userAnalysis.primaryRole!.roleId,
            userAnalysis.totalSalary,
            interaction.user.id,
            `一斉給与支給 - 複数ロール合算 [${roleNames}]`
          );

          if (!salarySuccess) {
            throw new Error(`給与支給処理に失敗しました - User: ${userAnalysis.username} (${userAnalysis.userId})`);
          }

          // 個別DM送信
          const member = guild.members.cache.get(userAnalysis.userId);
          if (member) {
            sendSalaryBreakdownDM(member.user, {
              totalSalary: userAnalysis.totalSalary,
              roles: userAnalysis.roles,
              primaryRole: userAnalysis.primaryRole
            }, targetMonth).catch(dmError => {
              console.warn(`[SALARY-BULK] Failed to send DM to ${userAnalysis.username}:`, dmError);
            });
          }

          totalSuccess++;
          totalAmount += userAnalysis.totalSalary;

        } catch (error) {
          console.error(`[SALARY-BULK] Error processing salary for user ${userAnalysis.username} (${userAnalysis.userId}):`, error);
          totalErrors++;
        }
      }

      // 結果レポート作成
      const summaryEmbed = new EmbedBuilder()
        .setColor(totalErrors > 0 ? '#ffaa00' : '#00ff00')
        .setTitle('💰 一斉給与支給完了')
        .addFields(
          { name: '対象月', value: targetMonth, inline: true },
          { name: '処理対象', value: `${totalProcessed}人`, inline: true },
          { name: '支給成功', value: `${totalSuccess}人`, inline: true },
          { name: '既支給済み', value: `${totalSkipped}人`, inline: true },
          { name: 'エラー', value: `${totalErrors}人`, inline: true },
          { name: '総支給額', value: `${totalAmount.toLocaleString()} Ru`, inline: true }
        )
        .setDescription('詳細な結果は下のボタンから確認できます。')
        .setTimestamp()
        .setFooter({ text: `実行者: ${interaction.user.username}` });

      const detailButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('salary_bulk_details')
            .setLabel('詳細結果を表示')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📊')
        );

      await interaction.editReply({
        embeds: [summaryEmbed],
        components: [detailButton]
      });

      console.log(`[BULK SALARY] ${interaction.user.tag} executed bulk salary for ${targetMonth}: ${totalSuccess} success, ${totalSkipped} skipped, ${totalErrors} errors`);

    } catch (error) {
      console.error('Error in salary-bulk command:', error);
      try {
        await interaction.editReply({
          content: '❌ 一斉給与支給処理中にエラーが発生しました。'
        });
      } catch (replyError) {
        console.error('Error responding to interaction:', replyError);
      }
    }
  },
};

export default salaryBulkCommand;