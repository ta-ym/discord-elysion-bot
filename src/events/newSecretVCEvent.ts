import { Events } from 'discord.js';
import { Event } from '../types';
import {
  handleDurationSelection,
  handlePartnerSearch,
  handlePartnerSelection,
  showManualIdInput,
  handleManualIdInput,
  deleteSecretVC
} from '../utils/newSecretVCManager';

const newSecretVCEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    try {
      // ボタンインタラクション
      if (interaction.isButton()) {
        const customId = interaction.customId;

        // 時間選択ボタン
        if (customId.startsWith('vc_duration_')) {
          const duration = parseInt(customId.split('_')[2]) as 6 | 12 | 24;
          await handleDurationSelection(interaction, duration);
          return;
        }

        // 手動ID入力ボタン
        if (customId.startsWith('manual_id_input_')) {
          const duration = parseInt(customId.split('_')[3]) as 6 | 12 | 24;
          await showManualIdInput(interaction, duration);
          return;
        }

        // VC削除ボタン
        if (customId.startsWith('delete_vc_')) {
          const channelId = customId.split('_')[2];
          await deleteSecretVC(interaction, channelId);
          return;
        }
      }

      // セレクトメニューインタラクション
      if (interaction.isStringSelectMenu()) {
        const customId = interaction.customId;

        // パートナー選択
        if (customId.startsWith('partner_select_')) {
          const duration = parseInt(customId.split('_')[2]) as 6 | 12 | 24;
          await handlePartnerSelection(interaction, duration);
          return;
        }
      }

      // モーダルインタラクション
      if (interaction.isModalSubmit()) {
        const customId = interaction.customId;

        // パートナー検索モーダル
        if (customId.startsWith('partner_search_modal_')) {
          const duration = parseInt(customId.split('_')[3]) as 6 | 12 | 24;
          await handlePartnerSearch(interaction, duration);
          return;
        }

        // 手動ID入力モーダル
        if (customId.startsWith('manual_id_modal_')) {
          const duration = parseInt(customId.split('_')[3]) as 6 | 12 | 24;
          await handleManualIdInput(interaction, duration);
          return;
        }
      }

    } catch (error) {
      console.error('新しいSecret VCイベントエラー:', error);
      
      try {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ エラーが発生しました。再度お試しください。',
            ephemeral: true
          });
        } else if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({
            content: '❌ エラーが発生しました。再度お試しください。'
          });
        }
      } catch (replyError) {
        console.error('エラーレスポンス送信失敗:', replyError);
      }
    }
  },
};

export default newSecretVCEvent;