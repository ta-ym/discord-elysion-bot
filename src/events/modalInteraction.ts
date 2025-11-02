import { Events } from 'discord.js';
import { Event } from '../types';
import { createTempVC } from '../utils/tempVCManager';

const modalInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    try {
      // 一時VC作成モーダル（プラン別）
      if (interaction.customId.startsWith('temp_vc_creation_modal_')) {
        const planType = interaction.customId.split('_')[4]; // 6h, 12h, 24h
        console.log(`[TEMP VC] Modal submitted by ${interaction.user.tag} for ${planType} plan`);
        await createTempVC(interaction, planType);
        console.log(`[TEMP VC] VC creation completed for ${interaction.user.tag} with ${planType} plan`);
        return;
      }

      // 既存の一時VC作成モーダル（互換性のため保持）
      if (interaction.customId === 'temp_vc_creation_modal') {
        console.log(`[TEMP VC] Legacy modal submitted by ${interaction.user.tag}`);
        await createTempVC(interaction, '12h'); // デフォルトで12時間プラン
        console.log(`[TEMP VC] Legacy VC creation completed for ${interaction.user.tag}`);
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