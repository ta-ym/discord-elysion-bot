import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';
import { getActiveSalaryRoles, getRoleDisplayName } from '../config/salaryRoles';
import { hasSalaryPermission, getSalaryPermissionErrorMessage } from '../utils/permissions';

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

    try {
      const targetMonth = interaction.options.getString('month') || 
        new Date().toISOString().slice(0, 7); // YYYY-MM

      // 月形式のバリデーション
      if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
        await interaction.reply({
          content: '❌ 月の形式が正しくありません。YYYY-MM形式で入力してください。（例: 2023-12）',
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply();

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
            // 既に今月給与を受け取っているかチェック
            const existingSalary = await database.checkMonthlySalaryStatus(member.user.id, targetMonth);
            
            if (existingSalary) {
              roleResult.members.push({
                userId: member.user.id,
                username: member.user.username,
                amount: 0,
                status: 'already_paid'
              });
              totalSkipped++;
              continue;
            }

            // ユーザーの最高給与ロールを取得（複数ロール持ちの場合）
            const userRoleIds = member.roles.cache.map(r => r.id);
            const userSalaryRoles = activeSalaryRoles.filter(sr => 
              userRoleIds.includes(sr.roleId)
            );
            
            if (userSalaryRoles.length === 0) continue;

            // 最高額の給与を選択
            const highestSalaryRole = userSalaryRoles.reduce((highest, current) => 
              current.monthlySalary > highest.monthlySalary ? current : highest
            );

            // 給与を支給（データベースの payMonthlySalary を使用）
            const salarySuccess = await database.payMonthlySalary(
              member.user.id,
              highestSalaryRole.roleId,
              highestSalaryRole.monthlySalary,
              interaction.user.id,
              `一斉給与支給 - ${getRoleDisplayName(highestSalaryRole.roleId)}`
            );

            if (!salarySuccess) {
              throw new Error('給与支給処理に失敗しました');
            }

            roleResult.members.push({
              userId: member.user.id,
              username: member.user.username,
              amount: highestSalaryRole.monthlySalary,
              status: 'success'
            });

            totalSuccess++;
            totalAmount += highestSalaryRole.monthlySalary;

          } catch (error) {
            console.error(`Error processing salary for user ${member.user.id}:`, error);
            
            roleResult.members.push({
              userId: member.user.id,
              username: member.user.username,
              amount: 0,
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

      // 詳細結果のデータを一時保存（実際の実装では Redis などを使用）
      (interaction as any).bulkResults = processResults;

      console.log(`[BULK SALARY] ${interaction.user.tag} executed bulk salary for ${targetMonth}: ${totalSuccess} success, ${totalSkipped} skipped, ${totalErrors} errors`);

    } catch (error) {
      console.error('Error in salary-bulk command:', error);
      await interaction.editReply({
        content: '❌ 一斉給与支給処理中にエラーが発生しました。'
      });
    }
  },
};

export default salaryBulkCommand;