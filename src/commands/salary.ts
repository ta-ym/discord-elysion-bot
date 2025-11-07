import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, Role } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';
import { getActiveSalaryRoles, getSalaryByRoleId, getHighestSalaryByRoleIds, getRoleDisplayName } from '../config/salaryRoles';
import { checkCommandPermission } from '../utils/permissions';

const salaryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('salary')
    .setDescription('月給支給システム（管理者専用）')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('給与を支給するユーザー')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('対象ロール（設定済みロールのみ）')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('支給額（指定しない場合はロール規定額）')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('支給理由・備考')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック
    if (await checkCommandPermission(interaction, 'salary')) {
      return; // 権限なし
    }

    const targetUser = interaction.options.getUser('user', true);
    const specifiedRole = interaction.options.getRole('role') as Role | null;
    const specifiedAmount = interaction.options.getInteger('amount');
    const description = interaction.options.getString('description');

    try {
      const database = new Database();
      
      // サーバーメンバー情報を取得
      const targetMember = await interaction.guild?.members.fetch(targetUser.id);
      if (!targetMember) {
        await interaction.reply({
          content: '❌ 対象ユーザーがサーバーに見つかりません。',
          ephemeral: true
        });
        return;
      }

      // 今月の支給状況をチェック
      const existingSalary = await database.checkMonthlySalaryStatus(targetUser.id);
      if (existingSalary) {
        const embed = new EmbedBuilder()
          .setColor(0xFF6B6B)
          .setTitle('⚠️ 支給済み')
          .setDescription(`${targetUser.displayName} には今月既に給与が支給されています。`)
          .addFields(
            { name: '支給日', value: new Date(existingSalary.created_at).toLocaleDateString('ja-JP'), inline: true },
            { name: 'ロール', value: getRoleDisplayName(existingSalary.role_id), inline: true },
            { name: '金額', value: `${existingSalary.amount.toLocaleString()} Ru`, inline: true }
          );
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      let salaryRoleId: string;
      let salaryAmount: number;
      let displayRoleName: string;

      if (specifiedRole && specifiedAmount) {
        // ロールと金額が両方指定された場合
        const roleConfig = getSalaryByRoleId(specifiedRole.id);
        if (!roleConfig) {
          await interaction.reply({
            content: `❌ 指定されたロール "${specifiedRole.name}" は給与設定されていません。\n\`/salary-config\` で設定を追加してください。`,
            ephemeral: true
          });
          return;
        }
        salaryRoleId = specifiedRole.id;
        salaryAmount = specifiedAmount;
        displayRoleName = specifiedRole.name;
      } else if (specifiedRole) {
        // ロールのみ指定された場合
        const roleConfig = getSalaryByRoleId(specifiedRole.id);
        if (!roleConfig) {
          await interaction.reply({
            content: `❌ 指定されたロール "${specifiedRole.name}" は給与設定されていません。\n\`/salary-config\` で設定を追加してください。`,
            ephemeral: true
          });
          return;
        }
        salaryRoleId = roleConfig.roleId;
        salaryAmount = roleConfig.monthlySalary;
        displayRoleName = specifiedRole.name;
      } else if (specifiedAmount) {
        // 金額のみ指定された場合（ロールは自動判定）
        const userRoleIds = targetMember.roles.cache.map(role => role.id);
        const matchedRole = getHighestSalaryByRoleIds(userRoleIds);

        if (!matchedRole) {
          await interaction.reply({
            content: `❌ ユーザーが給与対象ロールを持っていません。\n利用可能なロール: ${getActiveSalaryRoles().map(r => getRoleDisplayName(r.roleId)).join(', ')}`,
            ephemeral: true
          });
          return;
        }
        
        salaryRoleId = matchedRole.roleId;
        salaryAmount = specifiedAmount;
        displayRoleName = getRoleDisplayName(matchedRole.roleId);
      } else {
        // 何も指定されていない場合（自動判定）
        const userRoleIds = targetMember.roles.cache.map(role => role.id);
        const matchedRole = getHighestSalaryByRoleIds(userRoleIds);

        if (!matchedRole) {
          await interaction.reply({
            content: `❌ ユーザーが給与対象ロールを持っていません。\n利用可能なロール: ${getActiveSalaryRoles().map(r => getRoleDisplayName(r.roleId)).join(', ')}`,
            ephemeral: true
          });
          return;
        }
        
        salaryRoleId = matchedRole.roleId;
        salaryAmount = matchedRole.monthlySalary;
        displayRoleName = getRoleDisplayName(matchedRole.roleId);
      }

      // 確認画面を表示
      const currentMonth = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
      
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x4ECDC4)
        .setTitle('💰 月給支給確認')
        .setDescription(`以下の内容で月給を支給しますか？`)
        .addFields(
          { name: '対象ユーザー', value: targetUser.displayName, inline: true },
          { name: '対象月', value: currentMonth, inline: true },
          { name: 'ロール', value: displayRoleName, inline: true },
          { name: '支給額', value: `${salaryAmount.toLocaleString()} Ru`, inline: true },
          { name: '支給者', value: interaction.user.displayName, inline: true },
          { name: '備考', value: description || 'なし', inline: true }
        );

      const confirmButton = new ButtonBuilder()
        .setCustomId(`confirm_salary_${targetUser.id}_${salaryRoleId}_${salaryAmount}_${interaction.user.id}`)
        .setLabel('支給を実行')
        .setStyle(ButtonStyle.Success);

      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_salary')
        .setLabel('キャンセル')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmButton, cancelButton);

      await interaction.reply({
        embeds: [confirmEmbed],
        components: [row],
        ephemeral: true
      });

    } catch (error) {
      console.error('Salary command error:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

export default salaryCommand;