import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';

const debugCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('debug-user')
    .setDescription('現在のユーザー情報を表示（デバッグ用）'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.user;
    const member = interaction.member;
    
    const debugEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🔍 ユーザー情報デバッグ')
      .addFields(
        { name: 'ユーザーID', value: user.id, inline: true },
        { name: 'ユーザー名', value: user.username, inline: true },
        { name: 'ディスプレイ名', value: member ? (member as any).displayName || 'N/A' : 'N/A', inline: true },
        { name: 'タグ', value: user.tag, inline: true },
        { name: 'Bot', value: user.bot ? 'はい' : 'いいえ', inline: true },
        { name: 'システム', value: user.system ? 'はい' : 'いいえ', inline: true }
      )
      .setTimestamp();

    console.log(`[DEBUG] User info for ${user.username}:`, {
      id: user.id,
      username: user.username,
      tag: user.tag,
      bot: user.bot,
      system: user.system
    });

    await interaction.reply({ embeds: [debugEmbed], ephemeral: true });
  },
};

export = debugCommand;