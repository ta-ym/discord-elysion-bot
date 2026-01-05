import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, Role, MessageFlags } from 'discord.js';
import { Command } from '../types';
import { 
  getActiveSalaryRoles, 
  getSalaryByRoleId, 
  updateSalaryRoleById, 
  addSalaryRoleById,
  SalaryRoleConfig,
  getRoleDisplayName 
} from '../config/salaryRoles';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const salaryConfigCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('salary-config')
    .setDescription('【管理者専用】月給ロール設定管理')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('現在の給与ロール設定一覧を表示'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('ロールの月給額を設定・更新')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('対象ロール')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('月給額（Ru）')
            .setRequired(true)
            .setMinValue(0))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('ロールの説明')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('新しい給与ロールを追加')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('対象ロール')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('月給額（Ru）')
            .setRequired(true)
            .setMinValue(0))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('ロールの説明')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('給与ロール設定を削除')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('削除するロール')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('ロールの有効/無効を切り替え')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('切り替えるロール')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック（特定ユーザーのみ）
    if (!hasAdminPermission(interaction.user.id)) {
      await interaction.reply({
        content: getAdminPermissionErrorMessage(),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'list':
          await handleList(interaction);
          break;
        case 'set':
          await handleSet(interaction);
          break;
        case 'add':
          await handleAdd(interaction);
          break;
        case 'remove':
          await handleRemove(interaction);
          break;
        case 'toggle':
          await handleToggle(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ 無効なサブコマンドです。',
            flags: MessageFlags.Ephemeral
          });
      }
    } catch (error) {
      console.error('Error in salary-config command:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },
};

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const activeRoles = getActiveSalaryRoles();
  
  if (activeRoles.length === 0) {
    await interaction.reply({
      content: '📝 設定された給与ロールがありません。\n`/salary-config add` で新しいロールを追加してください。',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  // 月給額で降順ソート
  const sortedRoles = activeRoles.sort((a, b) => b.monthlySalary - a.monthlySalary);

  const embed = new EmbedBuilder()
    .setColor(0x4ECDC4)
    .setTitle('💼 月給ロール設定一覧')
    .setDescription('現在設定されている給与ロールの一覧です')
    .setTimestamp();

  sortedRoles.forEach((role, index) => {
    embed.addFields({
      name: `${index + 1}. ${getRoleDisplayName(role.roleId)}`,
      value: `💰 **${role.monthlySalary.toLocaleString()} Ru/月**\n📝 ${role.description}\n🆔 ${role.roleId}\n🔸 ステータス: ${role.isActive ? '✅ 有効' : '❌ 無効'}`,
      inline: true
    });
  });

  embed.setFooter({ 
    text: `合計 ${activeRoles.length} ロール設定済み` 
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleSet(interaction: ChatInputCommandInteraction): Promise<void> {
  const role = interaction.options.getRole('role', true) as Role;
  const amount = interaction.options.getInteger('amount', true);
  const description = interaction.options.getString('description');

  const existingRole = getSalaryByRoleId(role.id);
  if (!existingRole) {
    await interaction.reply({
      content: `❌ ロール "${role.name}" の給与設定が見つかりません。新しいロールを追加する場合は \`/salary-config add\` を使用してください。`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const updates: Partial<SalaryRoleConfig> = { monthlySalary: amount };
  if (description) updates.description = description;

  const success = updateSalaryRoleById(role.id, updates);
  
  if (success) {
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ ロール設定更新完了')
      .addFields(
        { name: 'ロール', value: `<@&${role.id}>`, inline: true },
        { name: '新しい月給額', value: `${amount.toLocaleString()} Ru`, inline: true },
        { name: '説明', value: description || existingRole.description, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({
      content: '❌ ロール設定の更新に失敗しました。',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const role = interaction.options.getRole('role', true) as Role;
  const amount = interaction.options.getInteger('amount', true);
  const description = interaction.options.getString('description', true);

  const existingRole = getSalaryByRoleId(role.id);
  if (existingRole) {
    await interaction.reply({
      content: `❌ ロール "${role.name}" は既に給与設定されています。設定を変更する場合は \`/salary-config set\` を使用してください。`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const newRole: SalaryRoleConfig = {
    roleId: role.id,
    roleName: role.name,
    monthlySalary: amount,
    description,
    isActive: true
  };

  const success = addSalaryRoleById(newRole);
  
  if (success) {
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ 新しいロール追加完了')
      .addFields(
        { name: 'ロール', value: `<@&${role.id}>`, inline: true },
        { name: '月給額', value: `${amount.toLocaleString()} Ru`, inline: true },
        { name: '説明', value: description, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({
      content: '❌ ロールの追加に失敗しました。',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const role = interaction.options.getRole('role', true) as Role;

  const existingRole = getSalaryByRoleId(role.id);
  if (!existingRole) {
    await interaction.reply({
      content: `❌ ロール "${role.name}" の給与設定が見つかりません。`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const success = updateSalaryRoleById(role.id, { isActive: false });
  
  if (success) {
    const embed = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle('🗑️ ロール設定削除完了')
      .addFields(
        { name: 'ロール', value: `<@&${role.id}>`, inline: true },
        { name: '月給額', value: `${existingRole.monthlySalary.toLocaleString()} Ru`, inline: true },
        { name: 'ステータス', value: '❌ 無効化', inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({
      content: '❌ ロール設定の削除に失敗しました。',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleToggle(interaction: ChatInputCommandInteraction): Promise<void> {
  const role = interaction.options.getRole('role', true) as Role;

  const existingRole = getSalaryByRoleId(role.id);
  if (!existingRole) {
    await interaction.reply({
      content: `❌ ロール "${role.name}" の給与設定が見つかりません。`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const newStatus = !existingRole.isActive;
  const success = updateSalaryRoleById(role.id, { isActive: newStatus });
  
  if (success) {
    const embed = new EmbedBuilder()
      .setColor(newStatus ? 0x00FF00 : 0xFF6B6B)
      .setTitle(`${newStatus ? '✅' : '❌'} ロールステータス変更完了`)
      .addFields(
        { name: 'ロール', value: `<@&${role.id}>`, inline: true },
        { name: '新しいステータス', value: newStatus ? '✅ 有効' : '❌ 無効', inline: true },
        { name: '月給額', value: `${existingRole.monthlySalary.toLocaleString()} Ru`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({
      content: '❌ ロールステータスの変更に失敗しました。',
      flags: MessageFlags.Ephemeral
    });
  }
}

export default salaryConfigCommand;