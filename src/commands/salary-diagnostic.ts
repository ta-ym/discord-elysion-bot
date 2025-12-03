import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { getTotalSalaryByRoleIds, SALARY_ROLES } from '../config/salaryRoles';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const salaryDiagnosticCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('salary-diagnostic')
    .setDescription('【管理者専用】指定されたユーザーの給与計算診断を行います')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('診断対象のユーザー')
        .setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック（特定ユーザーのみ）
    if (!hasAdminPermission(interaction.user.id)) {
      await interaction.reply({
        content: getAdminPermissionErrorMessage(),
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({
        content: '❌ このコマンドはサーバー内でのみ使用できます。',
        ephemeral: true
      });
      return;
    }

    try {
      // メンバー情報を取得
      const member = await guild.members.fetch(targetUser.id);
      
      // ユーザーの全ロールを取得
      const userRoles = member.roles.cache.filter(role => role.name !== '@everyone');
      const userRoleIds = userRoles.map(role => role.id);

      // 診断用Embed作成
      const diagnosticEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🔍 給与計算診断')
        .setDescription(`**${member.displayName}** の給与計算診断結果`)
        .addFields(
          { name: '👤 ユーザー情報', value: 
            `ユーザー名: ${targetUser.username}\n` +
            `表示名: ${member.displayName}\n` +
            `ユーザーID: ${targetUser.id}`, inline: false },
          { name: '🏷️ 保有ロール', value: 
            userRoles.size > 0 ? 
            userRoles.map(role => `• ${role.name}`).join('\n').slice(0, 1000) :
            'ロールなし', inline: false }
        );

      // 給与対象ロールをチェック
      const salaryRoles = SALARY_ROLES.filter(salaryRole => 
        salaryRole.isActive && userRoleIds.includes(salaryRole.roleId)
      );

      if (salaryRoles.length === 0) {
        diagnosticEmbed.addFields(
          { name: '❌ 給与対象ロール', value: '給与対象ロールがありません', inline: false },
          { name: '💰 計算結果', value: '支給額: **0 Ru**', inline: false }
        );
      } else {
        // getTotalSalaryByRoleIds関数を使って計算
        const salaryInfo = getTotalSalaryByRoleIds(userRoleIds);
        
        diagnosticEmbed.addFields(
          { name: '✅ 給与対象ロール', value: 
            salaryInfo.roles.map((role, index) => 
              `${index + 1}. **${role.roleName}**: ${role.monthlySalary.toLocaleString()} Ru`
            ).join('\n'), inline: false }
        );

        if (salaryInfo.roles.length > 1) {
          const calculation = salaryInfo.roles.map(r => r.monthlySalary.toLocaleString()).join(' + ');
          diagnosticEmbed.addFields(
            { name: '🧮 複数ロール合算計算', value: 
              `計算式: \`${calculation} = ${salaryInfo.totalSalary.toLocaleString()} Ru\``, inline: false }
          );
        }

        diagnosticEmbed.addFields(
          { name: '💰 最終計算結果', value: 
            `**総支給額**: ${salaryInfo.totalSalary.toLocaleString()} Ru\n` +
            `**適用ロール数**: ${salaryInfo.roles.length}個\n` +
            `**メインロール**: ${salaryInfo.primaryRole?.roleName || 'なし'}`, inline: false }
        );

        // 高額給与の場合の警告
        if (salaryInfo.totalSalary > 1000000) {
          diagnosticEmbed.addFields(
            { name: '⚠️ 高額給与警告', value: 
              `支給額が100万Ruを超えています (${salaryInfo.totalSalary.toLocaleString()} Ru)\n` +
              `複数の高位ロールによる合算です`, inline: false }
          );
        }
      }

      // 全体の給与ロール一覧も表示（参考用）
      const allActiveSalaryRoles = SALARY_ROLES.filter(r => r.isActive);
      const roleListText = allActiveSalaryRoles
        .slice(0, 10) // 最初の10個のみ表示
        .map(role => `• ${role.roleName}: ${role.monthlySalary.toLocaleString()} Ru`)
        .join('\n');
      
      diagnosticEmbed.addFields(
        { name: '📋 利用可能な給与ロール (上位10個)', value: 
          roleListText + (allActiveSalaryRoles.length > 10 ? `\n...他${allActiveSalaryRoles.length - 10}個` : ''), 
          inline: false }
      );

      diagnosticEmbed.setFooter({ text: '給与計算システム診断' });
      diagnosticEmbed.setTimestamp();

      await interaction.reply({ embeds: [diagnosticEmbed], ephemeral: true });

    } catch (error) {
      console.error('Salary diagnostic error:', error);
      await interaction.reply({
        content: '❌ 診断中にエラーが発生しました。ユーザーがサーバーに存在するか確認してください。',
        ephemeral: true
      });
    }
  },
};

export default salaryDiagnosticCommand;