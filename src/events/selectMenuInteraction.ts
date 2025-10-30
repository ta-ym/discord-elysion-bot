import { Events } from 'discord.js';
import { Event } from '../types';
import { 
  handleDurationSelection,
  createSecretVC
} from '../utils/secretVCManager';

const selectMenuInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    try {
      // 時間選択メニュー
      if (interaction.isStringSelectMenu() && interaction.customId === 'vc_duration_select') {
        await handleDurationSelection(interaction);
        return;
      }

      // メンバー選択メニュー
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('vc_member_select_')) {
        const duration = parseInt(interaction.customId.split('_')[3]);
        const partnerId = interaction.values[0];
        await createSecretVC(interaction, duration, partnerId);
        return;
      }

      // パートナー検索モーダル
      if (interaction.isModalSubmit() && interaction.customId.startsWith('vc_partner_modal_')) {
        const duration = parseInt(interaction.customId.split('_')[3]);
        const partnerInput = interaction.fields.getTextInputValue('partner_input');

        // ユーザーIDまたは名前で検索
        let partnerId: string | undefined;
        
        if (/^\d{17,19}$/.test(partnerInput)) {
          // ユーザーIDの場合
          partnerId = partnerInput;
        } else {
          // ユーザー名の場合、ギルドメンバーから検索
          const guild = interaction.guild;
          if (guild) {
            const members = await guild.members.fetch();
            const foundMember = members.find((member: any) => 
              member.user.username.toLowerCase().includes(partnerInput.toLowerCase()) ||
              member.displayName.toLowerCase().includes(partnerInput.toLowerCase())
            );
            if (foundMember) {
              partnerId = foundMember.id;
            }
          }
        }

        if (!partnerId) {
          await interaction.reply({
            content: '❌ 指定されたユーザーが見つかりませんでした。',
            ephemeral: true
          });
          return;
        }

        await createSecretVC(interaction, duration, partnerId);
        return;
      }

    } catch (error) {
      console.error('Select menu/modal interaction error:', error);
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: '❌ エラーが発生しました。',
          ephemeral: true
        });
      }
    }
  },
};

export default selectMenuInteractionEvent;