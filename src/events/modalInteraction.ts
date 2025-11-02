import { Events } from 'discord.js';
import { Event } from '../types';
import { createTempVC } from '../utils/tempVCManager';

const modalInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    try {
      // 一時VC作成モーダル
      if (interaction.customId === 'temp_vc_creation_modal') {
        await createTempVC(interaction);
        return;
      }

    } catch (error) {
      console.error('Error in modal interaction:', error);
      try {
        await interaction.reply({ content: '❌ 処理中にエラーが発生しました。', ephemeral: true });
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  },
};

export = modalInteractionEvent;