import { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { Event } from '../types';
import {
  showPublicVCCreationModal,
  showPublicVCList,
  deletePublicVC,
  showPublicVCEditModal
} from '../utils/publicVCManager';
import { changeVCLimit } from '../utils/tempVCManager';

// 処理済みインタラクションIDを記録するSet（メモリ内、最大1000件）
const processedInteractions = new Set<string>();
const MAX_PROCESSED_INTERACTIONS = 1000;

const buttonInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isButton()) return;

    console.log(`[BUTTON] Button interaction received: ${interaction.customId} by ${interaction.user.tag}`);

    // 重複処理を防ぐため、既に処理済みのインタラクションかチェック
    const interactionKey = `${interaction.id}_${interaction.user.id}`;
    if (processedInteractions.has(interactionKey)) {
      console.log(`[BUTTON] Interaction ${interactionKey} already processed, skipping`);
      return;
    }

    // インタラクションIDを記録
    processedInteractions.add(interactionKey);
    
    // 古いエントリを削除してメモリ使用量を制限
    if (processedInteractions.size > MAX_PROCESSED_INTERACTIONS) {
      const entries = Array.from(processedInteractions);
      processedInteractions.clear();
      // 後半の500件を保持
      entries.slice(-500).forEach(entry => processedInteractions.add(entry));
    }

    try {
      // 一時VC作成プラン選択
      if (interaction.customId === 'create_temp_vc') {
        console.log(`[TEMP VC] Processing plan selection button click by ${interaction.user.tag}`);
        
        try {
          const planEmbed = {
            color: 0x00ff00,
            title: '🔒 プライベート一時VC作成',
            description: '作成する一時VCの料金プランを選択してください\n\n**特徴:**\n• 権限のある人以外からは見えません\n• 最大2人まで参加可能\n• 時間経過で自動削除',
            fields: [
              {
                name: '⏰ 6時間プラン',
                value: '料金: **5,000 Ru**\n有効期限: 6時間',
                inline: true
              },
              {
                name: '⏰ 12時間プラン',
                value: '料金: **10,000 Ru**\n有効期限: 12時間',
                inline: true
              },
              {
                name: '⏰ 24時間プラン',
                value: '料金: **30,000 Ru**\n有効期限: 24時間',
                inline: true
              }
            ],
            footer: {
              text: '料金は作成時に自動で引き落とされます'
            }
          };

          const planButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('temp_vc_6h')
                .setLabel('6時間 (5,000 Ru)')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏰'),
              new ButtonBuilder()
                .setCustomId('temp_vc_12h')
                .setLabel('12時間 (10,000 Ru)')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⏰'),
              new ButtonBuilder()
                .setCustomId('temp_vc_24h')
                .setLabel('24時間 (30,000 Ru)')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⏰')
            );

          console.log(`[TEMP VC] About to show plan selection to ${interaction.user.tag}`);
          await interaction.reply({
            embeds: [planEmbed],
            components: [planButtons],
            ephemeral: true
          });
          console.log(`[TEMP VC] Plan selection shown to ${interaction.user.tag}`);
          return;
        } catch (planError) {
          console.error(`[TEMP VC] Error showing plan selection:`, planError);
          throw planError;
        }
      }

      // 一時VC料金プラン選択後のモーダル表示
      if (interaction.customId.startsWith('temp_vc_')) {
        const planType = interaction.customId.split('_')[2]; // 6h, 12h, 24h
        console.log(`[TEMP VC] Processing ${planType} plan selection by ${interaction.user.tag}`);
        
        try {
          const modal = new ModalBuilder()
            .setCustomId(`temp_vc_creation_modal_${planType}`)
            .setTitle(`一時VC作成 (${planType === '6h' ? '6時間' : planType === '12h' ? '12時間' : '24時間'}プラン)`);

          const channelNameInput = new TextInputBuilder()
            .setCustomId('channel_name')
            .setLabel('チャンネル名')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('チャンネル名を入力してください（30文字以内）')
            .setRequired(true)
            .setMaxLength(30);

          const nameRow = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(channelNameInput);

          modal.addComponents(nameRow);

          console.log(`[TEMP VC] About to show modal for ${planType} plan to ${interaction.user.tag}`);
          await interaction.showModal(modal);
          console.log(`[TEMP VC] Modal successfully shown for ${planType} plan to ${interaction.user.tag}`);
          return;
        } catch (modalError) {
          console.error(`[TEMP VC] Error creating/showing modal for ${planType} plan:`, modalError);
          throw modalError;
        }
      }

      // 公開VC作成・管理
      if (interaction.customId === 'create_public_vc') {
        await showPublicVCCreationModal(interaction);
        return;
      }

      if (interaction.customId === 'list_public_vcs') {
        await showPublicVCList(interaction);
        return;
      }

      // 公開VC削除
      if (interaction.customId.startsWith('delete_public_vc_')) {
        const channelId = interaction.customId.split('_')[3];
        await deletePublicVC(interaction, channelId);
        return;
      }

      // 公開VC設定変更
      if (interaction.customId.startsWith('edit_public_vc_')) {
        const channelId = interaction.customId.split('_')[3];
        await showPublicVCEditModal(interaction, channelId);
        return;
      }

      // VC人数制限設定
      if (interaction.customId.startsWith('vc_limit_')) {
        const limitType = interaction.customId.split('_')[2];
        let newLimit: number;
        
        switch (limitType) {
          case '2':
            newLimit = 2;
            break;
          case '3':
            newLimit = 3;
            break;
          case '5':
            newLimit = 5;
            break;
          case '10':
            newLimit = 10;
            break;
          case 'unlimited':
            newLimit = 0;
            break;
          default:
            await interaction.reply({
              content: '❌ 無効な人数設定です。',
              ephemeral: true
            });
            return;
        }

        await changeVCLimit(interaction, newLimit);
        return;
      }

      // Pay コマンド確認ボタン処理
      if (interaction.customId.startsWith('pay_confirm_')) {
        console.log(`[PAY] Processing pay confirmation by ${interaction.user.tag}`);
        
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[PAY] Interaction already processed for ${interaction.user.tag}`);
          return;
        }
        
        const parts = interaction.customId.split('_');
        if (parts.length !== 5) { // pay_confirm_{userId}_{amount}_{timestamp}
          await interaction.reply({
            content: '❌ 無効な支払い情報です。',
            ephemeral: true
          });
          return;
        }

        const targetUserId = parts[2];
        const amount = parseInt(parts[3]);
        
        if (isNaN(amount) || amount <= 0) {
          await interaction.reply({
            content: '❌ 無効な金額です。',
            ephemeral: true
          });
          return;
        }

        try {
          // インタラクションを即座にdefer
          await interaction.deferUpdate();
          
          // DatabaseインスタンスとPayment処理をインポート
          const { globalDatabase } = await import('../index');
          
          const targetUser = await interaction.client.users.fetch(targetUserId);
          if (!targetUser) {
            await interaction.editReply({
              content: '❌ 対象ユーザーが見つかりません。',
              embeds: [],
              components: []
            });
            return;
          }

          // 支払い実行
          await globalDatabase.addTransaction(
            interaction.user.id,
            targetUserId,
            amount,
            'admin_give',
            `支払い処理 (管理者: ${interaction.user.displayName})`
          );

          // 成功メッセージ
          await interaction.editReply({
            content: `✅ **支払い完了**\n\n👤 **対象:** ${targetUser.displayName}\n💰 **金額:** ${amount.toLocaleString()} Ru\n👨‍💼 **支払い者:** ${interaction.user.displayName}`,
            embeds: [],
            components: []
          });

          console.log(`[PAY] Payment completed: ${interaction.user.tag} paid ${amount} Ru to ${targetUser.tag}`);
          return;
        } catch (error) {
          console.error('[PAY] Payment execution error:', error);
          
          try {
            if (interaction.deferred) {
              await interaction.editReply({
                content: '❌ 支払い処理中にエラーが発生しました。',
                embeds: [],
                components: []
              });
            } else {
              await interaction.reply({
                content: '❌ 支払い処理中にエラーが発生しました。',
                ephemeral: true
              });
            }
          } catch (replyError) {
            console.error('[PAY] Failed to send error reply:', replyError);
          }
          return;
        }
      }

      // Pay コマンドキャンセルボタン処理
      if (interaction.customId === 'pay_cancel') {
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[PAY] Cancel interaction already processed for ${interaction.user.tag}`);
          return;
        }
        
        await interaction.update({
          content: '❌ 支払いをキャンセルしました。',
          embeds: [],
          components: []
        });
        return;
      }

      // Salary Rollback 確認ボタン処理
      if (interaction.customId.startsWith('salary_rollback_confirm_')) {
        console.log(`[SALARY-ROLLBACK] Processing rollback confirmation by ${interaction.user.tag}`);
        
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-ROLLBACK] Interaction already processed for ${interaction.user.tag}`);
          return;
        }

        const parts = interaction.customId.split('_');
        if (parts.length !== 6) { // salary_rollback_confirm_{userId}_{month}_{adminId}
          await interaction.reply({
            content: '❌ 無効なロールバック情報です。',
            ephemeral: true
          });
          return;
        }

        const targetUserId = parts[3];
        const targetMonth = parts[4];
        const adminId = parts[5];

        // 権限チェック - 実行者が管理者IDと一致するかチェック
        if (interaction.user.id !== adminId) {
          await interaction.reply({
            content: '❌ この操作を実行する権限がありません。',
            ephemeral: true
          });
          return;
        }

        try {
          await interaction.deferUpdate();
          
          // ロールバック処理を実行
          const { executeSalaryRollback } = await import('../commands/salary-rollback');
          const result = await executeSalaryRollback(targetUserId, targetMonth, adminId);
          
          if (result.success) {
            // 成功時の通知
            const { getCurrencyLogger } = await import('../utils/currencyLogger');
            const logger = getCurrencyLogger();
            if (logger) {
              const targetUser = await interaction.client.users.fetch(targetUserId);
              await logger.logTransaction({
                fromUserId: adminId,
                toUserId: targetUserId,
                amount: -(result.amount || 0),
                type: 'admin_give',
                description: `月給ロールバック (${targetMonth}) - 対象: ${targetUser.displayName || targetUser.username}`
              });
            }

            await interaction.editReply({
              content: `✅ ${result.message}`,
              embeds: [],
              components: []
            });
          } else {
            await interaction.editReply({
              content: `❌ ${result.message}`,
              embeds: [],
              components: []
            });
          }

        } catch (error) {
          console.error('[SALARY-ROLLBACK] Error processing rollback:', error);
          await interaction.editReply({
            content: '❌ ロールバック処理中にエラーが発生しました。',
            embeds: [],
            components: []
          });
        }
        return;
      }

      // Salary Rollback キャンセルボタン処理
      if (interaction.customId.startsWith('salary_rollback_cancel_')) {
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-ROLLBACK] Cancel interaction already processed for ${interaction.user.tag}`);
          return;
        }
        
        await interaction.update({
          content: '❌ ロールバックをキャンセルしました。',
          embeds: [],
          components: []
        });
        return;
      }

      // Salary Rollback All 確認ボタン処理
      if (interaction.customId.startsWith('salary_rollback_all_confirm_')) {
        console.log(`[SALARY-ROLLBACK-ALL] Processing rollback all confirmation by ${interaction.user.tag}`);
        
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-ROLLBACK-ALL] Interaction already processed for ${interaction.user.tag}`);
          return;
        }

        // カスタムIDから月を抽出
        const month = interaction.customId.replace('salary_rollback_all_confirm_', '');

        try {
          const { executeSalaryRollbackAll } = await import('../commands/salary-rollback-all');
          await executeSalaryRollbackAll(interaction, month);
        } catch (error) {
          console.error('[SALARY-ROLLBACK-ALL] Error processing rollback all:', error);
          
          const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ エラー')
            .setDescription('全員ロールバック処理中にエラーが発生しました。')
            .setTimestamp();

          await interaction.update({
            embeds: [errorEmbed],
            components: []
          });
        }
        return;
      }

      // Salary Rollback All キャンセルボタン処理
      if (interaction.customId.startsWith('salary_rollback_all_cancel_')) {
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-ROLLBACK-ALL] Cancel interaction already processed for ${interaction.user.tag}`);
          return;
        }
        
        const cancelEmbed = new EmbedBuilder()
          .setColor('#999999')
          .setTitle('❌ 全員ロールバックをキャンセルしました')
          .setDescription('全員の月給ロールバックは実行されませんでした。')
          .setTimestamp();
        
        await interaction.update({
          embeds: [cancelEmbed],
          components: []
        });
        return;
      }

    } catch (error) {
      console.error(`[BUTTON] Button interaction error for ${interaction.customId}:`, error);
      console.error(`[BUTTON] Error details:`, {
        customId: interaction.customId,
        user: interaction.user.tag,
        guild: interaction.guild?.name,
        channel: interaction.channel?.id,
        replied: interaction.replied,
        deferred: interaction.deferred
      });
      
      try {
        // インタラクションが既に処理されている場合はスキップ
        if (interaction.replied || interaction.deferred) {
          console.log(`[BUTTON] Interaction already processed, skipping error reply`);
          return;
        }
        
        await interaction.reply({
          content: '❌ エラーが発生しました。しばらく待ってから再度お試しください。',
          ephemeral: true
        });
      } catch (replyError) {
        console.error('[BUTTON] Failed to send error reply:', replyError);
      }
    }
  },
};

export = buttonInteractionEvent;