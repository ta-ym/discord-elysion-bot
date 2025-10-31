import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types';
import { startVCCreation } from '../utils/newSecretVCManager';

const createVcCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('create-vc')
    .setDescription('シークレットボイスチャンネルを作成します'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    // ボタンインタラクションに変換して処理
    const fakeButtonInteraction = {
      ...interaction,
      isButton: () => true,
      deferReply: interaction.deferReply.bind(interaction),
      editReply: interaction.editReply.bind(interaction),
      user: interaction.user,
      guild: interaction.guild,
      channel: interaction.channel
    } as any;

    await startVCCreation(fakeButtonInteraction);
  },
};

export default createVcCommand;