import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const debugCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('debug-user')
    .setDescription('【管理者専用】現在のユーザー情報を表示（デバッグ用）'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック（特定ユーザーのみ）
    if (!hasAdminPermission(interaction.user.id)) {
      await interaction.reply({
        content: getAdminPermissionErrorMessage(),
        ephemeral: true
      });
      return;
    }

    const user = interaction.user;
    const member = interaction.member as any;
    
    // ユーザーのロール情報を取得
    const userRoles = member?.roles?.cache?.map((role: any) => `${role.name} (${role.id})`) || [];
    const rolesList = userRoles.length > 0 ? userRoles.join('\n') : 'ロールなし';
    
    const debugEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🔍 ユーザー情報デバッグ')
      .addFields(
        { name: 'ユーザーID', value: user.id, inline: true },
        { name: 'ユーザー名', value: user.username, inline: true },
        { name: 'ディスプレイ名', value: member?.displayName || 'N/A', inline: true },
        { name: 'タグ', value: user.tag, inline: true },
        { name: 'Bot', value: user.bot ? 'はい' : 'いいえ', inline: true },
        { name: 'システム', value: user.system ? 'はい' : 'いいえ', inline: true },
        { name: 'ロール', value: rolesList.length > 1024 ? rolesList.substring(0, 1021) + '...' : rolesList, inline: false }
      )
      .setTimestamp();

    console.log(`[DEBUG] User info for ${user.username}:`, {
      id: user.id,
      username: user.username,
      tag: user.tag,
      bot: user.bot,
      system: user.system,
      roles: userRoles
    });

    await interaction.reply({ embeds: [debugEmbed], ephemeral: true });
  },
};

export = debugCommand;