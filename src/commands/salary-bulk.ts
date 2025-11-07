import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember, User } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';
import { getActiveSalaryRoles, getRoleDisplayName, getTotalSalaryByRoleIds, SalaryRoleConfig } from '../config/salaryRoles';
import { hasSalaryPermission, getSalaryPermissionErrorMessage } from '../utils/permissions';
import { getCurrencyLogger } from '../utils/currencyLogger';

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
        .setMaxLength(7)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const database = new Database();
    
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

      let processResults: {
        roleId: string;
        roleName: string;
        members: {
          userId: string;
          username: string;
          amount: number;
          status: 'success' | 'already_paid' | 'error';
          error?: string;
        }[];
      }[] = [];

      let totalProcessed = 0;
      let totalSuccess = 0;
      let totalSkipped = 0;
      let totalErrors = 0;
      let totalAmount = 0;

      // 各ロールごとに処理
      for (const roleConfig of activeSalaryRoles) {
        const role = guild.roles.cache.get(roleConfig.roleId);
        
        if (!role) {
          console.warn(`Role not found: ${roleConfig.roleId} (${roleConfig.roleName})`);
          continue;
        }

        const roleResult = {
          roleId: roleConfig.roleId,
          roleName: roleConfig.roleName || role.name,
          members: [] as any[]
        };

        // そのロールを持つメンバーを処理
        for (const [, member] of role.members) {
          totalProcessed++;
          
          try {
            // ユーザーの全給与ロールを取得（複数ロール持ちの場合は合算）
            const userRoleIds = member.roles.cache.map(r => r.id);
            const salaryInfo = getTotalSalaryByRoleIds(userRoleIds);
            
            if (salaryInfo.totalSalary === 0 || !salaryInfo.primaryRole) continue;

            const roleNames = salaryInfo.roles.map(role => getRoleDisplayName(role.roleId)).join(', ');

            // 合算給与を支給（データベースの payMonthlySalary を使用）
            console.log(`[SALARY-BULK] Processing user: ${member.user.username} (${member.user.id})`);
            console.log(`[SALARY-BULK] Salary info:`, { 
              totalSalary: salaryInfo.totalSalary, 
              primaryRole: salaryInfo.primaryRole?.roleName,
              roleCount: salaryInfo.roles.length 
            });
            
            const salarySuccess = await database.payMonthlySalary(
              member.user.id,
              salaryInfo.primaryRole.roleId,
              salaryInfo.totalSalary,
              interaction.user.id,
              `一斉給与支給 - 複数ロール合算 [${roleNames}]`
            );

            if (!salarySuccess) {
              throw new Error(`給与支給処理に失敗しました - User: ${member.user.username} (${member.user.id})`);
            }

            roleResult.members.push({
              userId: member.user.id,
              username: member.user.username,
              displayName: member.displayName,
              amount: salaryInfo.totalSalary,
              salaryBreakdown: salaryInfo.roles, // 給与内訳を保存
              status: 'success'
            });

            // 個別DM送信（非同期、エラーが発生してもメイン処理は継続）
            sendSalaryBreakdownDM(member.user, salaryInfo, targetMonth).catch(dmError => {
              console.warn(`[SALARY-BULK] Failed to send DM to ${member.user.username}:`, dmError);
            });

            totalSuccess++;
            totalAmount += salaryInfo.totalSalary;

          } catch (error) {
            console.error(`[SALARY-BULK] Error processing salary for user ${member.user.username} (${member.user.id}):`, error);
            console.error(`[SALARY-BULK] Error details:`, {
              userId: member.user.id,
              username: member.user.username,
              errorType: error instanceof Error ? error.constructor.name : typeof error,
              errorMessage: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            });
            
            roleResult.members.push({
              userId: member.user.id,
              username: member.user.username,
              displayName: member.displayName,
              amount: 0,
              salaryBreakdown: [], // エラー時は空配列
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            totalErrors++;
          }
        }

        if (roleResult.members.length > 0) {
          processResults.push(roleResult);
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

      // 通貨ログに一括実行サマリーを記録
      if (totalSuccess > 0) {
        const logger = getCurrencyLogger();
        if (logger) {
          // 成功した取引をまとめてログに記録
          const successfulTransactions = processResults.flatMap(roleResult =>
            roleResult.members
              .filter(member => member.status === 'success')
              .map(member => ({
                fromUserId: null,
                toUserId: member.userId,
                amount: member.amount,
                type: 'bulk_salary' as const,
                description: `一斉給与支給 (${targetMonth})`,
                executedBy: interaction.user.id
              }))
          );

          await logger.logBulkTransactions(
            successfulTransactions,
            `📊 一斉給与支給実行 (${targetMonth})`
          );
        }
      }

      const detailButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('salary_bulk_details')
            .setLabel('詳細結果を表示')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📊'),
          new ButtonBuilder()
            .setCustomId('salary_bulk_summary')
            .setLabel('計算サマリー')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔍')
        );

      await interaction.editReply({
        embeds: [summaryEmbed],
        components: [detailButton]
      });

      // 詳細結果をデータベースに保存（給与内訳を含む）
      try {
        const { globalDatabase } = await import('../index');
        
        // processResultsを詳細保存用にフラット化
        const detailedResults = processResults.flatMap(roleResult => 
          roleResult.members.map((member: any) => ({
            userId: member.userId,
            status: member.status,
            amount: member.amount,
            reason: member.status === 'success' ? 
              `ロール: ${member.salaryBreakdown?.map((r: SalaryRoleConfig) => `${r.roleName}(${r.monthlySalary.toLocaleString()}Ru)`).join(', ')}` :
              member.error || member.reason
          }))
        );
        
        await globalDatabase.saveBulkSalaryResults(detailedResults, interaction.user.id);
        console.log(`[BULK SALARY] Saved ${detailedResults.length} detailed results to database`);
      } catch (saveError) {
        console.error('[BULK SALARY] Failed to save results to database:', saveError);
        // 保存エラーが発生してもコマンド処理は継続
      }

      console.log(`[BULK SALARY] ${interaction.user.tag} executed bulk salary for ${targetMonth}: ${totalSuccess} success, ${totalSkipped} skipped, ${totalErrors} errors`);

    } catch (error) {
      console.error('Error in salary-bulk command:', error);
      try {
        // interactionがまだ応答していない場合のみ応答
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ 一斉給与支給処理中にエラーが発生しました。',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ 一斉給与支給処理中にエラーが発生しました。'
          });
        }
      } catch (replyError) {
        console.error('Error responding to interaction:', replyError);
      }
    }
  },
};

export default salaryBulkCommand;