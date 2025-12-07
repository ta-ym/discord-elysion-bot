import { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { Event, BulkSalaryResult } from '../types';
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

// ユーザー固有のボタン操作をタイムスタンプベースで記録（重複クリック防止）
const userButtonActions = new Map<string, number>();
const BUTTON_COOLDOWN_MS = 2000; // 2秒のクールダウン

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

    // ユーザー固有のボタンアクションのクールダウンチェック（特に危険な操作）
    const isDangerousAction = interaction.customId.includes('balance_reset_all_confirm') || 
                             interaction.customId.includes('salary_rollback_all_confirm');
    
    if (isDangerousAction) {
      const userActionKey = `${interaction.user.id}_${interaction.customId.split('_').slice(0, -1).join('_')}`;
      const lastActionTime = userButtonActions.get(userActionKey);
      const currentTime = Date.now();
      
      if (lastActionTime && (currentTime - lastActionTime) < BUTTON_COOLDOWN_MS) {
        console.log(`[BUTTON] User ${interaction.user.tag} attempted rapid clicking on dangerous action: ${interaction.customId}, blocked`);
        
        // 簡潔なメッセージで重複クリックを知らせる
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '⏳ 処理中です。しばらくお待ちください...',
              ephemeral: true
            });
          }
        } catch (error) {
          console.error('[BUTTON] Failed to reply to rapid click:', error);
        }
        return;
      }
      
      // アクションタイムスタンプを記録
      userButtonActions.set(userActionKey, currentTime);
      
      // 古いエントリをクリーンアップ（メモリ効率化）
      if (userButtonActions.size > 100) {
        const cutoffTime = currentTime - (BUTTON_COOLDOWN_MS * 5);
        for (const [key, timestamp] of userButtonActions.entries()) {
          if (timestamp < cutoffTime) {
            userButtonActions.delete(key);
          }
        }
      }
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
                value: '料金: **2,000 Ru**\n有効期限: 6時間',
                inline: true
              },
              {
                name: '⏰ 12時間プラン',
                value: '料金: **5,000 Ru**\n有効期限: 12時間',
                inline: true
              },
              {
                name: '⏰ 24時間プラン',
                value: '料金: **10,000 Ru**\n有効期限: 24時間',
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
                .setLabel('6時間 (2,000 Ru)')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏰'),
              new ButtonBuilder()
                .setCustomId('temp_vc_12h')
                .setLabel('12時間 (5,000 Ru)')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⏰'),
              new ButtonBuilder()
                .setCustomId('temp_vc_24h')
                .setLabel('24時間 (10,000 Ru)')
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

      // 複製VC名前変更
      if (interaction.customId.startsWith('clone_vc_rename_')) {
        const channelId = interaction.customId.split('_')[3];
        
        const modal = new ModalBuilder()
          .setCustomId(`clone_vc_rename_modal_${channelId}`)
          .setTitle('🎤 チャンネル名変更');

        const nameInput = new TextInputBuilder()
          .setCustomId('new_channel_name')
          .setLabel('新しいチャンネル名')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('例: プライベートルーム')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(100);

        const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
        return;
      }

      // 複製VCステータス変更
      if (interaction.customId.startsWith('clone_vc_status_')) {
        const channelId = interaction.customId.split('_')[3];
        
        const modal = new ModalBuilder()
          .setCustomId(`clone_vc_status_modal_${channelId}`)
          .setTitle('💬 チャンネルステータス変更');

        const statusInput = new TextInputBuilder()
          .setCustomId('new_channel_status')
          .setLabel('新しいチャンネルステータス')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('例: 🎮 ゲーム中 | 📚 勉強会 | 💤 休憩中')
          .setRequired(false)
          .setMinLength(0)
          .setMaxLength(1024);

        const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(statusInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
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

      // Balance Reset All 確認ボタン処理
      if (interaction.customId.startsWith('balance_reset_all_confirm_')) {
        console.log(`[BALANCE-RESET-ALL] Processing balance reset all confirmation by ${interaction.user.tag}`);
        
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[BALANCE-RESET-ALL] Interaction already processed for ${interaction.user.tag}`);
          return;
        }

        // カスタムIDから金額を抽出
        const targetAmountStr = interaction.customId.replace('balance_reset_all_confirm_', '');
        const targetAmount = parseInt(targetAmountStr);
        
        if (isNaN(targetAmount) || targetAmount < 0) {
          console.error(`[BALANCE-RESET-ALL] Invalid target amount: ${targetAmountStr}`);
          await interaction.reply({
            content: '❌ 無効な金額設定です。',
            ephemeral: true
          });
          return;
        }

        try {
          // まず処理中であることを通知（インタラクション処理を素早く開始）
          const processingEmbed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('⏳ 全員残高リセット処理を開始しています...')
            .setDescription(`${targetAmount.toLocaleString()}Ruへのリセット処理を開始しています。\n**この処理には時間がかかる場合があります。**`)
            .setTimestamp();

          await interaction.update({
            embeds: [processingEmbed],
            components: []
          });

          const { executeBalanceResetAll } = await import('../commands/balance-reset-all');
          await executeBalanceResetAll(interaction, targetAmount);
        } catch (error) {
          console.error('[BALANCE-RESET-ALL] Error processing balance reset all:', error);
          
          const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ エラー')
            .setDescription('全員残高リセット処理中にエラーが発生しました。\n\n**詳細:**\n```\n' + (error as Error).message + '\n```')
            .setTimestamp();

          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({
                embeds: [errorEmbed],
                components: []
              });
            } else {
              await interaction.update({
                embeds: [errorEmbed],
                components: []
              });
            }
          } catch (replyError) {
            console.error('[BALANCE-RESET-ALL] Failed to send error reply:', replyError);
          }
        }
        return;
      }

      // Balance Reset All キャンセルボタン処理
      if (interaction.customId.startsWith('balance_reset_all_cancel_')) {
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[BALANCE-RESET-ALL] Cancel interaction already processed for ${interaction.user.tag}`);
          return;
        }
        
        const cancelEmbed = new EmbedBuilder()
          .setColor('#999999')
          .setTitle('❌ 全員残高リセットをキャンセルしました')
          .setDescription('全員の残高リセットは実行されませんでした。')
          .setTimestamp();
        
        await interaction.update({
          embeds: [cancelEmbed],
          components: []
        });
        return;
      }

      // Salary Bulk Details 表示ボタン処理
      if (interaction.customId === 'salary_bulk_details') {
        console.log(`[SALARY-BULK] Processing bulk salary details request by ${interaction.user.tag}`);
        
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-BULK] Details interaction already processed for ${interaction.user.tag}`);
          return;
        }

        try {
          await interaction.deferReply({ ephemeral: true });
          
          // データベースから最新の一斉給与結果を取得
          const { globalDatabase } = await import('../index');
          const bulkResults: BulkSalaryResult[] = await globalDatabase.getLatestBulkSalaryResults(interaction.user.id);
          
          if (!bulkResults || bulkResults.length === 0) {
            await interaction.editReply({
              content: '❌ 詳細結果が見つかりませんでした。結果は実行から1時間で自動削除されます。'
            });
            return;
          }

          // 結果を分類
          const successResults = bulkResults.filter((r: BulkSalaryResult) => r.status === 'success');
          const skippedResults = bulkResults.filter((r: BulkSalaryResult) => r.status === 'skipped');
          const errorResults = bulkResults.filter((r: BulkSalaryResult) => r.status === 'error');

          const embeds: EmbedBuilder[] = [];

          // 成功結果の詳細
          if (successResults.length > 0) {
            const successEmbed = new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle(`✅ 支給成功 (${successResults.length}件)`)
              .setDescription(
                successResults
                  .slice(0, 20) // Discord の field 制限により最大20件（詳細情報のため少なめ）
                  .map((r: BulkSalaryResult) => {
                    const breakdownInfo = r.reason ? ` (内訳: ${r.reason})` : '';
                    return `👤 <@${r.user_id}> - **${r.amount?.toLocaleString()} Ru**${breakdownInfo}`;
                  })
                  .join('\n') + 
                (successResults.length > 20 ? `\n\n... および他 ${successResults.length - 20} 件` : '')
              );
            embeds.push(successEmbed);
          }

          // スキップ結果の詳細
          if (skippedResults.length > 0) {
            const skippedEmbed = new EmbedBuilder()
              .setColor('#ffaa00')
              .setTitle(`⚠️ スキップ (${skippedResults.length}件)`)
              .setDescription(
                skippedResults
                  .slice(0, 25)
                  .map((r: BulkSalaryResult) => `👤 <@${r.user_id}> - ${r.reason || '既に支給済み'}`)
                  .join('\n') +
                (skippedResults.length > 25 ? `\n\n... および他 ${skippedResults.length - 25} 件` : '')
              );
            embeds.push(skippedEmbed);
          }

          // エラー結果の詳細
          if (errorResults.length > 0) {
            const errorEmbed = new EmbedBuilder()
              .setColor('#ff0000')
              .setTitle(`❌ エラー (${errorResults.length}件)`)
              .setDescription(
                errorResults
                  .slice(0, 25)
                  .map((r: BulkSalaryResult) => `👤 <@${r.user_id}> - ${r.reason || 'エラー発生'}`)
                  .join('\n') +
                (errorResults.length > 25 ? `\n\n... および他 ${errorResults.length - 25} 件` : '')
              );
            embeds.push(errorEmbed);
          }

          await interaction.editReply({
            embeds: embeds
          });

        } catch (error) {
          console.error('[SALARY-BULK] Error retrieving bulk salary details:', error);
          await interaction.editReply({
            content: '❌ 詳細結果の取得中にエラーが発生しました。'
          });
        }
        return;
      }

      // Salary Bulk Summary 表示ボタン処理
      if (interaction.customId === 'salary_bulk_summary') {
        console.log(`[SALARY-BULK] Processing bulk salary summary request by ${interaction.user.tag}`);
        
        // インタラクションが既に処理済みかチェック
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-BULK] Summary interaction already processed for ${interaction.user.tag}`);
          return;
        }

        try {
          await interaction.deferReply({ ephemeral: true });
          
          // データベースから最新の一斉給与結果を取得
          const { globalDatabase } = await import('../index');
          const bulkResults: BulkSalaryResult[] = await globalDatabase.getLatestBulkSalaryResults(interaction.user.id);
          
          if (!bulkResults || bulkResults.length === 0) {
            await interaction.editReply({
              content: '❌ 計算サマリー情報が見つかりませんでした。結果は実行から1時間で自動削除されます。'
            });
            return;
          }

          // 成功結果のみを分析
          const successResults = bulkResults.filter((r: BulkSalaryResult) => r.status === 'success');
          
          if (successResults.length === 0) {
            await interaction.editReply({
              content: '❌ 成功した給与支給がないため、計算サマリーを表示できません。'
            });
            return;
          }

          // 給与額別の分析
          const salaryDistribution = new Map<number, number>();
          const roleAnalysis = new Map<string, { count: number; totalAmount: number }>();
          let totalPaid = 0;
          let maxSalary = 0;
          let minSalary = Number.MAX_VALUE;

          successResults.forEach((result: BulkSalaryResult) => {
            const amount = result.amount || 0;
            totalPaid += amount;
            maxSalary = Math.max(maxSalary, amount);
            minSalary = Math.min(minSalary, amount);
            
            // 給与額の分布
            salaryDistribution.set(amount, (salaryDistribution.get(amount) || 0) + 1);

            // ロール分析（reason から解析）
            if (result.reason && result.reason.includes('ロール:')) {
              const roleInfo = result.reason.split('ロール: ')[1];
              if (roleInfo) {
                const roles = roleInfo.split(', ');
                roles.forEach(roleStr => {
                  const roleName = roleStr.split('(')[0];
                  if (!roleAnalysis.has(roleName)) {
                    roleAnalysis.set(roleName, { count: 0, totalAmount: 0 });
                  }
                  const analysis = roleAnalysis.get(roleName)!;
                  analysis.count += 1;
                  analysis.totalAmount += amount;
                });
              }
            }
          });

          const averageSalary = Math.round(totalPaid / successResults.length);

          // 給与分布の上位5種類
          const topSalaries = Array.from(salaryDistribution.entries())
            .sort(([,countA], [,countB]) => countB - countA)
            .slice(0, 5)
            .map(([amount, count]) => `${amount.toLocaleString()}Ru × ${count}人`)
            .join('\n');

          // ロール分析の上位5ロール
          const topRoles = Array.from(roleAnalysis.entries())
            .sort(([,a], [,b]) => b.count - a.count)
            .slice(0, 5)
            .map(([role, data]) => `${role} × ${data.count}人`)
            .join('\n');

          const summaryEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🔍 給与計算サマリー')
            .addFields(
              { name: '📊 基本統計', value: 
                `支給成功: **${successResults.length}人**\n` +
                `総支給額: **${totalPaid.toLocaleString()} Ru**\n` +
                `平均給与: **${averageSalary.toLocaleString()} Ru**`, inline: true },
              { name: '💰 給与範囲', value: 
                `最高額: **${maxSalary.toLocaleString()} Ru**\n` +
                `最低額: **${minSalary.toLocaleString()} Ru**\n` +
                `差額: **${(maxSalary - minSalary).toLocaleString()} Ru**`, inline: true },
              { name: '📈 給与分布 (上位5種)', value: topSalaries || 'データなし', inline: false },
              { name: '🏷️ ロール分析 (上位5ロール)', value: topRoles || 'データなし', inline: false },
              { name: '⚠️ 注意', value: 
                '複数ロールを持つユーザーは合算給与が支給されています。\n' +
                '給与計算に疑問がある場合は、個別にDMで詳細をご確認ください。', inline: false }
            )
            .setFooter({ text: '給与システムの透明性を保つため、定期的にサマリーをご確認ください' })
            .setTimestamp();

          await interaction.editReply({
            embeds: [summaryEmbed]
          });

        } catch (error) {
          console.error('[SALARY-BULK] Error retrieving bulk salary summary:', error);
          await interaction.editReply({
            content: '❌ 計算サマリーの取得中にエラーが発生しました。'
          });
        }
        return;
      }

      // Salary Bulk Preview ボタン処理
      if (interaction.customId === 'salary_preview_eligible') {
        console.log(`[SALARY-PREVIEW] Processing eligible users request by ${interaction.user.tag}`);
        
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-PREVIEW] Eligible interaction already processed for ${interaction.user.tag}`);
          return;
        }

        try {
          await interaction.deferReply({ ephemeral: true });

          // 現在の月を取得（または最近の分析結果から）
          const currentMonth = new Date().toISOString().slice(0, 7);
          
          // ギルドと必要なデータを取得
          const guild = interaction.guild;
          if (!guild) {
            await interaction.editReply({
              content: '❌ サーバー情報の取得に失敗しました。'
            });
            return;
          }

          await guild.members.fetch();

          // 給与分析を実行
          const { getTotalSalaryByRoleIds } = await import('../config/salaryRoles');
          const { Database } = await import('../database');
          
          const database = new Database();
          
          const eligibleUsers: Array<{
            userId: string;
            username: string;
            displayName: string;
            totalSalary: number;
            roleCount: number;
            canReceive: boolean;
          }> = [];

          // メンバーを分析
          for (const [, member] of guild.members.cache) {
            if (member.user.bot) continue;

            const userRoleIds = member.roles.cache.map((r: any) => r.id);
            const salaryInfo = getTotalSalaryByRoleIds(userRoleIds);
            
            if (salaryInfo.totalSalary === 0 || !salaryInfo.primaryRole) {
              continue;
            }

            // 既に支給済みかチェック
            let alreadyPaid = false;
            try {
              const existingPayment = await database.checkMonthlySalaryStatus(member.user.id, currentMonth);
              alreadyPaid = existingPayment !== null;
            } catch (dbError) {
              console.warn(`[SALARY-PREVIEW] Database check failed for ${member.user.username}:`, dbError);
            }

            if (!alreadyPaid) {
              eligibleUsers.push({
                userId: member.user.id,
                username: member.user.username,
                displayName: member.displayName,
                totalSalary: salaryInfo.totalSalary,
                roleCount: salaryInfo.roles.length,
                canReceive: true
              });
            }
          }

          // 給与額でソート
          eligibleUsers.sort((a, b) => b.totalSalary - a.totalSalary);

          if (eligibleUsers.length === 0) {
            await interaction.editReply({
              content: '📋 現在、給与支給対象となるユーザーはいません。'
            });
            return;
          }

          // Embedを作成（最大25人まで表示）
          const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`💚 給与支給対象者 (${eligibleUsers.length}人)`)
            .setDescription(`**${currentMonth}** の給与支給が可能なユーザー一覧`)
            .setTimestamp();

          const displayUsers = eligibleUsers.slice(0, 25);
          const userList = displayUsers.map((user, index) => 
            `${index + 1}. **${user.displayName}** - ${user.totalSalary.toLocaleString()} Ru (${user.roleCount}ロール)`
          ).join('\n');

          embed.addFields({
            name: '👥 対象者リスト',
            value: userList + (eligibleUsers.length > 25 ? `\n\n... 他${eligibleUsers.length - 25}人` : ''),
            inline: false
          });

          // 統計情報を追加
          const totalAmount = eligibleUsers.reduce((sum, user) => sum + user.totalSalary, 0);
          const averageAmount = Math.round(totalAmount / eligibleUsers.length);
          const maxAmount = Math.max(...eligibleUsers.map(u => u.totalSalary));
          const minAmount = Math.min(...eligibleUsers.map(u => u.totalSalary));

          embed.addFields({
            name: '📊 統計情報',
            value: `総支給予定額: **${totalAmount.toLocaleString()} Ru**\n平均給与: **${averageAmount.toLocaleString()} Ru**\n最高額: **${maxAmount.toLocaleString()} Ru**\n最低額: **${minAmount.toLocaleString()} Ru**`,
            inline: false
          });

          await interaction.editReply({
            embeds: [embed]
          });

        } catch (error) {
          console.error('[SALARY-PREVIEW] Error processing eligible users:', error);
          await interaction.editReply({
            content: '❌ 支給対象者の取得中にエラーが発生しました。'
          });
        }
        return;
      }

      if (interaction.customId === 'salary_preview_paid') {
        console.log(`[SALARY-PREVIEW] Processing paid users request by ${interaction.user.tag}`);
        
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-PREVIEW] Paid interaction already processed for ${interaction.user.tag}`);
          return;
        }

        await interaction.reply({
          content: '⚠️ 支給済みユーザーの詳細表示機能は現在開発中です。\n`/salary-bulk preview:true` コマンドで基本情報をご確認いただけます。',
          ephemeral: true
        });
        return;
      }

      if (interaction.customId === 'salary_preview_roles') {
        console.log(`[SALARY-PREVIEW] Processing roles analysis request by ${interaction.user.tag}`);
        
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-PREVIEW] Roles interaction already processed for ${interaction.user.tag}`);
          return;
        }

        await interaction.reply({
          content: '⚠️ ロール別集計機能は現在開発中です。\n`/salary-bulk preview:true` コマンドで基本情報をご確認いただけます。',
          ephemeral: true
        });
        return;
      }

      // Salary Bulk Execute ボタン処理（プレビュー後の実行）
      if (interaction.customId.startsWith('salary_bulk_execute_')) {
        console.log(`[SALARY-BULK-EXECUTE] Processing execution request by ${interaction.user.tag}`);
        
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-BULK-EXECUTE] Execute interaction already processed for ${interaction.user.tag}`);
          return;
        }

        const targetMonth = interaction.customId.replace('salary_bulk_execute_', '');
        
        try {
          // 確認メッセージを表示
          const confirmEmbed = new EmbedBuilder()
            .setColor('#ff6600')
            .setTitle('⚠️ 給与一斉支給の実行確認')
            .setDescription(`**${targetMonth}** の給与一斉支給を実行しますか？\n\n**この操作は取り消すことができません。**`)
            .addFields(
              { name: '📅 対象月', value: targetMonth, inline: true },
              { name: '👨‍💼 実行者', value: `${interaction.user.displayName}`, inline: true },
              { name: '⚠️ 重要な注意', value: 
                '• 実行後は取り消しができません\n' +
                '• 既に支給済みのユーザーはスキップされます\n' +
                '• 処理には時間がかかる場合があります', inline: false }
            )
            .setFooter({ text: '本当に実行してよろしいですか？' })
            .setTimestamp();

          const confirmRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`salary_bulk_confirm_${targetMonth}`)
                .setLabel('🚀 実行する')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('💰'),
              new ButtonBuilder()
                .setCustomId('salary_bulk_cancel')
                .setLabel('❌ キャンセル')
                .setStyle(ButtonStyle.Secondary)
            );

          await interaction.reply({
            embeds: [confirmEmbed],
            components: [confirmRow],
            ephemeral: true
          });
          
        } catch (error) {
          console.error('[SALARY-BULK-EXECUTE] Error showing confirmation:', error);
          await interaction.reply({
            content: '❌ 確認画面の表示中にエラーが発生しました。',
            ephemeral: true
          });
        }
        return;
      }

      // Salary Bulk Confirm ボタン処理（実行確認後）
      if (interaction.customId.startsWith('salary_bulk_confirm_')) {
        console.log(`[SALARY-BULK-CONFIRM] Processing confirmation by ${interaction.user.tag}`);
        
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-BULK-CONFIRM] Confirm interaction already processed for ${interaction.user.tag}`);
          return;
        }

        const targetMonth = interaction.customId.replace('salary_bulk_confirm_', '');
        
        try {
          // 実際の実行処理を呼び出し
          const { executeSalaryBulkFromPreview } = await import('../commands/salary-bulk');
          await executeSalaryBulkFromPreview(interaction, targetMonth);
        } catch (error) {
          console.error('[SALARY-BULK-CONFIRM] Error executing salary bulk:', error);
          
          const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ 実行エラー')
            .setDescription('給与一斉支給の実行中にエラーが発生しました。')
            .setTimestamp();

          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({
                embeds: [errorEmbed],
                components: []
              });
            } else {
              await interaction.update({
                embeds: [errorEmbed],
                components: []
              });
            }
          } catch (replyError) {
            console.error('[SALARY-BULK-CONFIRM] Failed to send error reply:', replyError);
          }
        }
        return;
      }

      // Salary Bulk Cancel ボタン処理
      if (interaction.customId === 'salary_bulk_cancel') {
        if (interaction.replied || interaction.deferred) {
          console.log(`[SALARY-BULK-CANCEL] Cancel interaction already processed for ${interaction.user.tag}`);
          return;
        }
        
        const cancelEmbed = new EmbedBuilder()
          .setColor('#999999')
          .setTitle('❌ 給与一斉支給をキャンセルしました')
          .setDescription('給与一斉支給の実行はキャンセルされました。')
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