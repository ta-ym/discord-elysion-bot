import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import { Command } from '../types';
import { 
  getActiveSalaryRoles, 
  getSalaryByRoleName, 
  updateSalaryRole, 
  addSalaryRole,
  SalaryRoleConfig 
} from '../config/salaryRoles';

const salaryConfigCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('salary-config')
    .setDescription('月給ロール設定管理（管理者専用）')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('現在の給与ロール設定一覧を表示'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('ロールの月給額を設定・更新')
        .addStringOption(option =>
          option.setName('role')
            .setDescription('ロール名')
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
        .addStringOption(option =>
          option.setName('role')
            .setDescription('ロール名')
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
        .setName('toggle')
        .setDescription('ロールの有効/無効を切り替え')
        .addStringOption(option =>
          option.setName('role')
            .setDescription('ロール名')
            .setRequired(true)))
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
        case 'toggle':
          await handleToggle(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ 無効なサブコマンドです。',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Error in salary-config command:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const activeRoles = getActiveSalaryRoles();
  
  if (activeRoles.length === 0) {
    await interaction.reply({
      content: '📝 設定された給与ロールがありません。',
      ephemeral: true
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
      name: `${index + 1}. ${role.roleName}`,
      value: `💰 **${role.monthlySalary.toLocaleString()} Ru/月**\n📝 ${role.description}\n🔸 ステータス: ${role.isActive ? '✅ 有効' : '❌ 無効'}`,
      inline: true
    });
  });

  embed.setFooter({ 
    text: `合計 ${activeRoles.length} ロール設定済み` 
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSet(interaction: ChatInputCommandInteraction): Promise<void> {
  const roleName = interaction.options.getString('role', true);
  const amount = interaction.options.getInteger('amount', true);
  const description = interaction.options.getString('description');

  const existingRole = getSalaryByRoleName(roleName);
  if (!existingRole) {
    await interaction.reply({
      content: `❌ ロール "${roleName}" が見つかりません。新しいロールを追加する場合は \`/salary-config add\` を使用してください。`,
      ephemeral: true
    });
    return;
  }

  const updates: Partial<SalaryRoleConfig> = { monthlySalary: amount };
  if (description) updates.description = description;

  const success = updateSalaryRole(roleName, updates);
  
  if (success) {
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ ロール設定更新完了')
      .addFields(
        { name: 'ロール名', value: roleName, inline: true },
        { name: '新しい月給額', value: `${amount.toLocaleString()} Ru`, inline: true },
        { name: '説明', value: description || existingRole.description, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else {
    await interaction.reply({
      content: '❌ ロール設定の更新に失敗しました。',
      ephemeral: true
    });
  }
}

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const roleName = interaction.options.getString('role', true);
  const amount = interaction.options.getInteger('amount', true);
  const description = interaction.options.getString('description', true);

  const existingRole = getSalaryByRoleName(roleName);
  if (existingRole) {
    await interaction.reply({
      content: `❌ ロール "${roleName}" は既に存在します。設定を変更する場合は \`/salary-config set\` を使用してください。`,
      ephemeral: true
    });
    return;
  }

  const newRole: SalaryRoleConfig = {
    roleName,
    monthlySalary: amount,
    description,
    isActive: true
  };

  const success = addSalaryRole(newRole);
  
  if (success) {
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ 新しいロール追加完了')
      .addFields(
        { name: 'ロール名', value: roleName, inline: true },
        { name: '月給額', value: `${amount.toLocaleString()} Ru`, inline: true },
        { name: '説明', value: description, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else {
    await interaction.reply({
      content: '❌ ロールの追加に失敗しました。',
      ephemeral: true
    });
  }
}

async function handleToggle(interaction: ChatInputCommandInteraction): Promise<void> {
  const roleName = interaction.options.getString('role', true);

  const existingRole = getSalaryByRoleName(roleName);
  if (!existingRole) {
    await interaction.reply({
      content: `❌ ロール "${roleName}" が見つかりません。`,
      ephemeral: true
    });
    return;
  }

  const newStatus = !existingRole.isActive;
  const success = updateSalaryRole(roleName, { isActive: newStatus });
  
  if (success) {
    const embed = new EmbedBuilder()
      .setColor(newStatus ? 0x00FF00 : 0xFF6B6B)
      .setTitle(`${newStatus ? '✅' : '❌'} ロールステータス変更完了`)
      .addFields(
        { name: 'ロール名', value: roleName, inline: true },
        { name: '新しいステータス', value: newStatus ? '✅ 有効' : '❌ 無効', inline: true },
        { name: '月給額', value: `${existingRole.monthlySalary.toLocaleString()} Ru`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else {
    await interaction.reply({
      content: '❌ ロールステータスの変更に失敗しました。',
      ephemeral: true
    });
  }
}

export default salaryConfigCommand;