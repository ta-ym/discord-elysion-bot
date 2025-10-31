import { Events } from 'discord.js';
import { Event } from '../types';
import { 
  handleDurationSelection,
  createSecretVC
} from '../utils/secretVCManager';
import { 
  createPublicVC
} from '../utils/publicVCManager';
import { Database } from '../database';

const selectMenuInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    try {
      // 時間選択メニュー
      if (interaction.isStringSelectMenu() && interaction.customId === 'vc_duration_select') {
        console.log(`[DEBUG] vc_duration_select triggered by ${interaction.user.tag}, values: ${interaction.values}`);
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

      // 公開VC作成モーダル
      if (interaction.isModalSubmit() && interaction.customId === 'public_vc_creation_modal') {
        const vcName = interaction.fields.getTextInputValue('vc_name');
        const vcDescription = interaction.fields.getTextInputValue('vc_description');
        
        await createPublicVC(interaction, vcName, vcDescription || undefined);
        return;
      }

      // 公開VC編集モーダル
      if (interaction.isModalSubmit() && interaction.customId.startsWith('public_vc_edit_modal_')) {
        const channelId = interaction.customId.split('_')[4];
        const vcName = interaction.fields.getTextInputValue('vc_name');
        const vcDescription = interaction.fields.getTextInputValue('vc_description');
        
        const database = new Database();
        try {
          // チャンネル名を更新
          const channel = await interaction.guild?.channels.fetch(channelId);
          if (channel && 'setName' in channel) {
            await channel.setName(vcName);
          }

          // データベースを更新
          await database.updatePublicVC(channelId, vcName, vcDescription || undefined);

          await interaction.reply({
            content: '✅ 公開VCの設定を更新しました。',
            ephemeral: true
          });
        } catch (error) {
          console.error('公開VC更新エラー:', error);
          await interaction.reply({
            content: '❌ 設定の更新に失敗しました。',
            ephemeral: true
          });
        }
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