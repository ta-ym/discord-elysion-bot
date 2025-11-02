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
        console.log(`[TEMP VC] Modal submitted by ${interaction.user.tag}`);
        await createTempVC(interaction);
        console.log(`[TEMP VC] VC creation completed for ${interaction.user.tag}`);
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