import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';
import { getActiveSalaryRoles, getSalaryByRoleName, getHighestSalary } from '../config/salaryRoles';

const salaryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('salary')
    .setDescription('月給支給システム（管理者専用）')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('給与を支給するユーザー')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('role')
        .setDescription('対象ロール名（設定済みロールのみ）')
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
    const member = interaction.member as GuildMember;
    
    if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: '❌ このコマンドは管理者のみ使用できます。',
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const specifiedRole = interaction.options.getString('role');
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
            { name: 'ロール', value: existingSalary.role_name, inline: true },
            { name: '金額', value: `${existingSalary.amount.toLocaleString()} Ru`, inline: true }
          );
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      let salaryRole: string;
      let salaryAmount: number;

      if (specifiedRole && specifiedAmount) {
        // ロールと金額が両方指定された場合
        const roleConfig = getSalaryByRoleName(specifiedRole);
        if (!roleConfig) {
          await interaction.reply({
            content: `❌ 指定されたロール "${specifiedRole}" は設定されていません。\n利用可能なロール: ${getActiveSalaryRoles().map(r => r.roleName).join(', ')}`,
            ephemeral: true
          });
          return;
        }
        salaryRole = specifiedRole;
        salaryAmount = specifiedAmount;
      } else if (specifiedRole) {
        // ロールのみ指定された場合
        const roleConfig = getSalaryByRoleName(specifiedRole);
        if (!roleConfig) {
          await interaction.reply({
            content: `❌ 指定されたロール "${specifiedRole}" は設定されていません。\n利用可能なロール: ${getActiveSalaryRoles().map(r => r.roleName).join(', ')}`,
            ephemeral: true
          });
          return;
        }
        salaryRole = roleConfig.roleName;
        salaryAmount = roleConfig.monthlySalary;
      } else if (specifiedAmount) {
        // 金額のみ指定された場合（ロールは自動判定）
        const userRoles = targetMember.roles.cache.map(role => role.name);
        const matchedRole = getHighestSalary(userRoles);

        if (!matchedRole) {
          await interaction.reply({
            content: `❌ ユーザーが給与対象ロールを持っていません。\n利用可能なロール: ${getActiveSalaryRoles().map(r => r.roleName).join(', ')}`,
            ephemeral: true
          });
          return;
        }
        
        salaryRole = matchedRole.roleName;
        salaryAmount = specifiedAmount;
      } else {
        // 何も指定されていない場合（自動判定）
        const userRoles = targetMember.roles.cache.map(role => role.name);
        const matchedRole = getHighestSalary(userRoles);

        if (!matchedRole) {
          await interaction.reply({
            content: `❌ ユーザーが給与対象ロールを持っていません。\n利用可能なロール: ${getActiveSalaryRoles().map(r => r.roleName).join(', ')}`,
            ephemeral: true
          });
          return;
        }
        
        salaryRole = matchedRole.roleName;
        salaryAmount = matchedRole.monthlySalary;
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
          { name: 'ロール', value: salaryRole, inline: true },
          { name: '支給額', value: `${salaryAmount.toLocaleString()} Ru`, inline: true },
          { name: '支給者', value: interaction.user.displayName, inline: true },
          { name: '備考', value: description || 'なし', inline: true }
        );

      const confirmButton = new ButtonBuilder()
        .setCustomId(`confirm_salary_${targetUser.id}_${salaryRole}_${salaryAmount}_${interaction.user.id}`)
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