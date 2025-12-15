import { 
  CommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from 'discord.js';
import { Database } from '../database';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

// データベースインスタンスを遅延初期化
let database: Database | null = null;

function getDatabase(): Database {
  if (!database) {
    database = new Database();
  }
  return database;
}

export const data = new SlashCommandBuilder()
  .setName('balance-reset-all')
  .setDescription('【超危険】全員の残高を10000Ruに設定します')
  .addStringOption(option =>
    option.setName('confirmation')
      .setDescription('確認用：この操作を実行するには "RESET_ALL_BALANCES_TO_10000" と入力してください')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('amount')
      .setDescription('設定する残高（デフォルト：10000Ru）')
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(1000000));
  // 一時的に管理者権限制限を無効化してテスト
  // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) return;

  // 権限チェック（特定ユーザーのみ）
  if (!hasAdminPermission(interaction.user.id)) {
    await interaction.reply({
      content: getAdminPermissionErrorMessage(),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  // インタラクションを先にdeferして15分の時間制限を確保
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const confirmation = interaction.options.getString('confirmation');
    const targetAmount = interaction.options.getInteger('amount') ?? 10000;
    
    // 確認文字列のチェック
    if (confirmation !== 'RESET_ALL_BALANCES_TO_10000') {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ 確認エラー')
        .setDescription('この超危険な操作を実行するには、確認用フィールドに `RESET_ALL_BALANCES_TO_10000` と正確に入力してください。')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // 全ユーザーの現在の残高を取得
    console.log('[BALANCE-RESET-ALL] Fetching all users for balance reset...');
    
    // サーバーの全メンバーと既存データベースユーザーを統合取得
    let allUsers: any[] = [];
    try {
      allUsers = await getAllUsers(interaction);
    } catch (error) {
      console.error('[BALANCE-RESET-ALL] Error fetching users:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ データベースエラー')
        .setDescription('ユーザーデータの取得中にエラーが発生しました。')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    if (allUsers.length === 0) {
      const noUsersEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('⚠️ ユーザーなし')
        .setDescription('残高を変更するユーザーが見つかりませんでした。')
        .setTimestamp();

      await interaction.editReply({ embeds: [noUsersEmbed] });
      return;
    }

    // ユーザー分類統計
    const existingUsers = allUsers.filter(user => !user.isNewUser);
    const newUsers = allUsers.filter(user => user.isNewUser);
    
    // 現在の残高統計を計算
    const currentBalances = existingUsers.map(user => user.balance || 0);
    const totalCurrentBalance = currentBalances.reduce((sum, balance) => sum + balance, 0);
    const averageCurrentBalance = existingUsers.length > 0 ? Math.round(totalCurrentBalance / existingUsers.length) : 0;
    const minBalance = currentBalances.length > 0 ? Math.min(...currentBalances) : 0;
    const maxBalance = currentBalances.length > 0 ? Math.max(...currentBalances) : 0;
    
    // 変更後の統計
    const totalNewBalance = allUsers.length * targetAmount;
    const balanceDifference = totalNewBalance - totalCurrentBalance;

    // 確認用Embed
    const confirmEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🚨 【超危険な操作】全員残高リセット確認')
      .setDescription(`**この操作は極めて危険です。全てのユーザーの残高が変更されます。**`)
      .addFields(
        { name: '🎯 設定残高', value: `${targetAmount.toLocaleString()}Ru`, inline: true },
        { name: '👥 対象ユーザー数', value: `${allUsers.length}人`, inline: true },
        { name: '📊 システム全体への影響', value: `${balanceDifference >= 0 ? '+' : ''}${balanceDifference.toLocaleString()}Ru`, inline: true },
        { name: '� ユーザー分類', value: 
          `既存ユーザー: ${existingUsers.length}人\n` +
          `新規ユーザー: ${newUsers.length}人\n` +
          `合計: ${allUsers.length}人`, inline: false },
        { name: '�📈 既存ユーザーの残高統計', value: 
          existingUsers.length > 0 ? 
          `平均: ${averageCurrentBalance.toLocaleString()}Ru\n` +
          `最小: ${minBalance.toLocaleString()}Ru\n` +
          `最大: ${maxBalance.toLocaleString()}Ru\n` +
          `既存総計: ${totalCurrentBalance.toLocaleString()}Ru` :
          '既存ユーザーなし', inline: false },
        { name: '📉 変更後の状況', value: 
          `全員: ${targetAmount.toLocaleString()}Ru\n` +
          `新総合計: ${totalNewBalance.toLocaleString()}Ru`, inline: false },
        { name: '⚠️ 重要な警告', value: 
          '• この操作は**全ユーザーの残高を強制的に変更**します\n' +
          '• **経済バランスが完全に破綻**する可能性があります\n' +
          '• **全ての取引履歴は保持**されますが残高は初期化されます\n' +
          '• この操作は**絶対に取り消すことができません**\n' +
          '• **サーバー経済の完全なリセット**になります', inline: false }
      )
      .setFooter({ text: '本当に実行しますか？この操作を元に戻すことは絶対にできません。' })
      .setTimestamp();

    // 確認ボタン
    const confirmRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`balance_reset_all_confirm_${targetAmount}`)
          .setLabel('🚨 実行する（完全不可逆）')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`balance_reset_all_cancel_${targetAmount}`)
          .setLabel('❌ キャンセル')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.editReply({ 
      embeds: [confirmEmbed], 
      components: [confirmRow]
    });

  } catch (error) {
    console.error('Balance reset all command error:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ エラー')
      .setDescription('コマンドの実行中にエラーが発生しました。')
      .setTimestamp();

    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else if (!interaction.replied) {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
}

// Discordサーバーの全メンバーを取得するヘルパー関数（タイムアウト対応）
async function getAllServerMembers(interaction: CommandInteraction): Promise<any[]> {
  try {
    console.log('[BALANCE-RESET-ALL] Fetching all server members...');
    
    if (!interaction.guild) {
      console.error('[BALANCE-RESET-ALL] Guild not found');
      return [];
    }

    const guild = interaction.guild;
    
    // タイムアウト付きでメンバーを取得（分割取得）
    try {
      console.log('[BALANCE-RESET-ALL] Starting guild member fetch with timeout...');
      
      // タイムアウト処理付きの分割取得
      await Promise.race([
        guild.members.fetch({ limit: 1000, time: 30000 }), // 30秒タイムアウト、最大1000人ずつ
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Guild member fetch timeout after 30 seconds')), 30000)
        )
      ]);

      console.log(`[BALANCE-RESET-ALL] Successfully fetched ${guild.members.cache.size} members`);
    } catch (fetchError) {
      console.warn('[BALANCE-RESET-ALL] Member fetch failed, trying alternative approach:', fetchError);
      
      // 最後の手段：既存のキャッシュを使用し、それも無い場合は部分的なフェッチを試行
      if (guild.members.cache.size === 0) {
        try {
          console.log('[BALANCE-RESET-ALL] Attempting partial member fetch...');
          // より小さな制限でフェッチを試行
          await guild.members.fetch({ limit: 100, time: 10000 });
        } catch (partialError) {
          console.error('[BALANCE-RESET-ALL] Partial fetch also failed:', partialError);
          // それでも失敗した場合は空配列を返す
          if (guild.members.cache.size === 0) {
            console.error('[BALANCE-RESET-ALL] No members available, cannot proceed');
            return [];
          }
        }
      }
      
      console.log(`[BALANCE-RESET-ALL] Using ${guild.members.cache.size} cached members`);
    }
    
    const allMembers = guild.members.cache
      .filter(member => !member.user.bot) // ボットを除外
      .map(member => ({
        discord_id: member.user.id,
        username: member.user.username,
        displayName: member.displayName
      }));

    console.log(`[BALANCE-RESET-ALL] Found ${allMembers.length} server members (excluding bots)`);
    return allMembers;

  } catch (error) {
    console.error('[BALANCE-RESET-ALL] Error fetching server members:', error);
    return [];
  }
}

// データベースの既存ユーザーを取得するヘルパー関数
async function getExistingUsers(): Promise<any[]> {
  try {
    console.log('[BALANCE-RESET-ALL] Fetching existing users from database...');
    
    const db = getDatabase();
    
    // Databaseクラスの統合されたgetAllUsersメソッドを使用
    try {
      console.log('[BALANCE-RESET-ALL] Using database.getAllUsers method');
      const users = await db.getAllUsers();
      console.log(`[BALANCE-RESET-ALL] Database: Fetched ${users.length} existing users`);
      return users.map((user: any) => ({ discord_id: user.discord_id, balance: user.balance || 10000 }));
    } catch (dbError) {
      console.error('[BALANCE-RESET-ALL] Database getAllUsers failed:', dbError);
      return [];
    }
  } catch (error) {
    console.error('[BALANCE-RESET-ALL] Error in getExistingUsers:', error);
    return [];
  }
}

// 全ユーザー（サーバーメンバー）の残高情報を統合取得
async function getAllUsers(interaction: CommandInteraction): Promise<any[]> {
  try {
    // 1. サーバーの全メンバーを取得
    const serverMembers = await getAllServerMembers(interaction);
    if (serverMembers.length === 0) {
      console.log('[BALANCE-RESET-ALL] No server members found');
      return [];
    }

    // 2. 既存のデータベースユーザーを取得
    const existingUsers = await getExistingUsers();
    const existingUserMap = new Map(existingUsers.map(user => [user.discord_id, user.balance || 10000]));

    // 3. サーバーメンバーと既存ユーザーを統合
    const allUsers = serverMembers.map(member => ({
      discord_id: member.discord_id,
      username: member.username,
      displayName: member.displayName,
      balance: existingUserMap.get(member.discord_id) || 10000, // デフォルト残高
      isNewUser: !existingUserMap.has(member.discord_id)
    }));

    console.log(`[BALANCE-RESET-ALL] Total users: ${allUsers.length} (${allUsers.filter(u => u.isNewUser).length} new, ${allUsers.filter(u => !u.isNewUser).length} existing)`);
    return allUsers;

  } catch (error) {
    console.error('[BALANCE-RESET-ALL] Error in getAllUsers:', error);
    return [];
  }
}

// 実行中の操作を追跡するSet（メモリ内）
const activeResetOperations = new Set<string>();

// 全員残高リセット実行関数
export async function executeBalanceResetAll(interaction: any, targetAmount: number) {
  const db = getDatabase();
  
  // 重複実行を防ぐためのチェック
  const operationKey = `${interaction.user.id}_balance_reset_all_${targetAmount}`;
  
  if (activeResetOperations.has(operationKey)) {
    console.log(`[BALANCE-RESET-ALL] Operation already in progress for user ${interaction.user.tag}, skipping`);
    
    const busyEmbed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('⏳ 処理中')
      .setDescription('同じ操作が既に実行中です。完了をお待ちください。')
      .setTimestamp();

    // インタラクション状態をチェックしてから適切な方法で応答
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [busyEmbed], components: [] });
      } else {
        await interaction.update({ embeds: [busyEmbed], components: [] });
      }
    } catch (replyError) {
      console.error('[BALANCE-RESET-ALL] Failed to send busy message:', replyError);
    }
    return;
  }
  
  // 操作開始を記録
  activeResetOperations.add(operationKey);
  
  try {
    // 再度全ユーザーを取得
    const allUsers = await getAllUsers(interaction);

    if (allUsers.length === 0) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ リセット失敗')
        .setDescription('リセット対象のユーザーが見つかりませんでした。')
        .setTimestamp();

      // インタラクション状態をチェックしてから適切な方法で応答
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed], components: [] });
        } else {
          await interaction.update({ embeds: [errorEmbed], components: [] });
        }
      } catch (replyError) {
        console.error('[BALANCE-RESET-ALL] Failed to send error message:', replyError);
      }
      return;
    }

    // プログレス表示（詳細版）
    const progressEmbed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('⏳ 全員残高リセット実行中...')
      .setDescription(`${allUsers.length}人の残高を${targetAmount.toLocaleString()}Ruにリセットしています...`)
      .addFields(
        { name: '📊 対象ユーザー', value: `合計 ${allUsers.length}人`, inline: true },
        { name: '🎯 設定残高', value: `${targetAmount.toLocaleString()}Ru`, inline: true },
        { name: '⏱️ 予想処理時間', value: `約${Math.ceil(allUsers.length / 10)}秒`, inline: true },
        { name: '⚠️ 重要', value: '処理中はブラウザを閉じずにお待ちください。', inline: false }
      )
      .setTimestamp();

    // インタラクション状態をチェックしてから適切な方法で応答
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [progressEmbed], components: [] });
      } else {
        await interaction.update({ embeds: [progressEmbed], components: [] });
      }
    } catch (replyError) {
      console.error('[BALANCE-RESET-ALL] Failed to send progress message:', replyError);
      // プログレス表示に失敗しても処理は継続
    }

    let successCount = 0;
    let errorCount = 0;
    const errorUsers: string[] = [];
    let totalOldBalance = 0;
    let totalNewBalance = 0;
    const startTime = Date.now();

    // 進捗更新のための定期的な報告（50ユーザーごと）
    const updateProgressEvery = Math.max(50, Math.floor(allUsers.length / 10));

    // 各ユーザーの残高をリセット
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      try {
        const oldBalance = user.balance || 0;
        totalOldBalance += oldBalance;
        
        // まず既存ユーザーかチェック
        if (user.isNewUser) {
          // 新規ユーザーの場合、まず作成
          try {
            await db.createUser(user.discord_id);
            console.log(`[BALANCE RESET ALL] Created new user: ${user.discord_id} (${user.displayName})`);
          } catch (createError: any) {
            if (createError.message && (
              createError.message.includes('UNIQUE constraint failed') ||
              createError.message.includes('duplicate key value') ||
              createError.message.includes('already exists')
            )) {
              // すでに存在する場合は無視
              console.log(`[BALANCE RESET ALL] User already exists: ${user.discord_id}`);
            } else {
              throw createError;
            }
          }
        }
        
        // 残高を設定
        await db.setUserBalance(user.discord_id, targetAmount);
        
        totalNewBalance += targetAmount;
        successCount++;
        
        // システムログに記録
        const status = user.isNewUser ? 'CREATED' : 'UPDATED';
        console.log(`[BALANCE RESET ALL] User ${user.discord_id} (${user.displayName}): ${oldBalance} → ${targetAmount} Ru [${status}]`);
        
      } catch (error) {
        console.error(`[BALANCE RESET ALL ERROR] User ${user.discord_id} (${user.displayName}):`, error);
        console.error(`[BALANCE RESET ALL ERROR] Error details:`, {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack
        });
        errorCount++;
        errorUsers.push(`<@${user.discord_id}>`);
      }

      // 進捗更新（定期的）
      if ((i + 1) % updateProgressEvery === 0 || i === allUsers.length - 1) {
        const progressPercent = Math.round(((i + 1) / allUsers.length) * 100);
        const elapsedTime = Math.round((Date.now() - startTime) / 1000);
        const estimatedTotal = Math.round((elapsedTime / (i + 1)) * allUsers.length);
        const remainingTime = Math.max(0, estimatedTotal - elapsedTime);

        console.log(`[BALANCE-RESET-ALL] Progress: ${i + 1}/${allUsers.length} (${progressPercent}%) - Success: ${successCount}, Errors: ${errorCount}, ETA: ${remainingTime}s`);

        // 大きなバッチの場合は進捗をDiscordにも更新
        if (allUsers.length > 100 && (i + 1) % (updateProgressEvery * 2) === 0) {
          try {
            const progressEmbed = new EmbedBuilder()
              .setColor('#ffaa00')
              .setTitle('⏳ 全員残高リセット実行中...')
              .setDescription(`進捗: ${i + 1}/${allUsers.length} (${progressPercent}%)`)
              .addFields(
                { name: '✅ 成功', value: `${successCount}人`, inline: true },
                { name: '❌ エラー', value: `${errorCount}人`, inline: true },
                { name: '⏱️ 残り時間', value: `約${remainingTime}秒`, inline: true }
              )
              .setTimestamp();

            // インタラクション状態を再確認してから更新
            if (interaction.replied || interaction.deferred) {
              await interaction.editReply({ embeds: [progressEmbed], components: [] });
            }
          } catch (updateError) {
            console.warn('[BALANCE-RESET-ALL] Failed to update progress:', updateError);
          }
        }
      }
    }

    // 実行統計
    const newUsersProcessed = allUsers.filter(u => u.isNewUser).length;
    const existingUsersProcessed = allUsers.filter(u => !u.isNewUser).length;

    // 結果表示
    const resultEmbed = new EmbedBuilder()
      .setColor(errorCount > 0 ? '#ffaa00' : '#00ff00')
      .setTitle(errorCount > 0 ? '⚠️ 全員残高リセット完了（一部エラー）' : '✅ 全員残高リセット完了')
      .addFields(
        { name: '🎯 設定残高', value: `${targetAmount.toLocaleString()}Ru`, inline: true },
        { name: '✅ 成功', value: `${successCount}人`, inline: true },
        { name: '❌ エラー', value: `${errorCount}人`, inline: true },
        { name: '👥 処理詳細', value: 
          `既存ユーザー更新: ${existingUsersProcessed - allUsers.filter(u => !u.isNewUser && errorUsers.includes(`<@${u.discord_id}>`)).length}人\n` +
          `新規ユーザー作成: ${newUsersProcessed - allUsers.filter(u => u.isNewUser && errorUsers.includes(`<@${u.discord_id}>`)).length}人\n` +
          `合計処理: ${successCount}人`, inline: false },
        { name: '📊 経済への影響', value: 
          `変更前総計: ${totalOldBalance.toLocaleString()}Ru\n` +
          `変更後総計: ${totalNewBalance.toLocaleString()}Ru\n` +
          `差分: ${(totalNewBalance - totalOldBalance >= 0 ? '+' : '')}${(totalNewBalance - totalOldBalance).toLocaleString()}Ru`, 
          inline: false }
      )
      .setTimestamp();

    if (errorCount > 0 && errorUsers.length > 0) {
      resultEmbed.addFields({
        name: '❌ エラーが発生したユーザー',
        value: errorUsers.slice(0, 10).join(', ') + (errorUsers.length > 10 ? `\n...他${errorUsers.length - 10}人` : ''),
        inline: false
      });
    }

    resultEmbed.addFields({
      name: '📝 重要',
      value: '• 全ユーザーの残高が変更されました\n• この変更は不可逆的です\n• 取引履歴は保持されています\n• サーバー経済が完全にリセットされました',
      inline: false
    });

    // 最終結果を安全に送信
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [resultEmbed], components: [] });
      } else {
        await interaction.update({ embeds: [resultEmbed], components: [] });
      }
    } catch (resultError) {
      console.error('[BALANCE-RESET-ALL] Failed to send result:', resultError);
    }

  } catch (error) {
    console.error('Execute balance reset all error:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ 全員残高リセット失敗')
      .setDescription('リセット処理中にエラーが発生しました。\n管理者に連絡してください。')
      .setTimestamp();

    // エラーメッセージも安全に送信
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed], components: [] });
      } else {
        await interaction.update({ embeds: [errorEmbed], components: [] });
      }
    } catch (errorReplyError) {
      console.error('[BALANCE-RESET-ALL] Failed to send error message:', errorReplyError);
    }
  } finally {
    // 操作完了を記録（成功・エラーに関わらず）
    activeResetOperations.delete(operationKey);
    console.log(`[BALANCE-RESET-ALL] Operation completed for user ${interaction.user.tag}, removed from active operations`);
  }
}