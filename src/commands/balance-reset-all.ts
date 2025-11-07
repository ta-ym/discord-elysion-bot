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
import { checkCommandPermission } from '../utils/permissions';

const database = new Database();

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

  // 権限チェック
  if (await checkCommandPermission(interaction, 'balance-reset-all')) {
    return; // 権限なし
  }

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

      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    // 全ユーザーの現在の残高を取得
    console.log('[BALANCE-RESET-ALL] Fetching all users for balance reset...');
    
    // SQLiteから全ユーザーを取得（PostgreSQLは後でフォールバック）
    let allUsers: any[] = [];
    try {
      // データベースから全ユーザーを取得する方法を実装
      // 注意: この部分は実際のデータベース構造に合わせて調整が必要
      allUsers = await getAllUsers();
    } catch (error) {
      console.error('[BALANCE-RESET-ALL] Error fetching users:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ データベースエラー')
        .setDescription('ユーザーデータの取得中にエラーが発生しました。')
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (allUsers.length === 0) {
      const noUsersEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('⚠️ ユーザーなし')
        .setDescription('残高を変更するユーザーが見つかりませんでした。')
        .setTimestamp();

      await interaction.reply({ embeds: [noUsersEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    // 現在の残高統計を計算
    const currentBalances = allUsers.map(user => user.balance || 0);
    const totalCurrentBalance = currentBalances.reduce((sum, balance) => sum + balance, 0);
    const averageCurrentBalance = Math.round(totalCurrentBalance / allUsers.length);
    const minBalance = Math.min(...currentBalances);
    const maxBalance = Math.max(...currentBalances);
    
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
        { name: '📈 現在の残高統計', value: 
          `平均: ${averageCurrentBalance.toLocaleString()}Ru\n` +
          `最小: ${minBalance.toLocaleString()}Ru\n` +
          `最大: ${maxBalance.toLocaleString()}Ru\n` +
          `総合計: ${totalCurrentBalance.toLocaleString()}Ru`, inline: false },
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

    await interaction.reply({ 
      embeds: [confirmEmbed], 
      components: [confirmRow],
      flags: MessageFlags.Ephemeral 
    });

  } catch (error) {
    console.error('Balance reset all command error:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ エラー')
      .setDescription('コマンドの実行中にエラーが発生しました。')
      .setTimestamp();

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
  }
}

// 全ユーザー取得のヘルパー関数
async function getAllUsers(): Promise<any[]> {
  try {
    console.log('[BALANCE-RESET-ALL] Attempting to fetch all users...');
    
    // PostgreSQLが利用可能かチェック
    const usePostgreSQL = (database as any).usePostgreSQL;
    console.log(`[BALANCE-RESET-ALL] Database mode: ${usePostgreSQL ? 'PostgreSQL' : 'SQLite'}`);
    
    if (usePostgreSQL) {
      // PostgreSQLから全ユーザーを取得
      console.log('[BALANCE-RESET-ALL] Using PostgreSQL to fetch users');
      const postgresDb = (database as any).pgDb;
      
      if (!postgresDb) {
        console.error('[BALANCE-RESET-ALL] PostgreSQL instance not found');
        return [];
      }
      
      try {
        const result = await postgresDb.query('SELECT discord_id, balance FROM users WHERE balance IS NOT NULL');
        console.log(`[BALANCE-RESET-ALL] PostgreSQL: Fetched ${result.rows?.length || 0} users`);
        return result.rows || [];
      } catch (pgError) {
        console.error('[BALANCE-RESET-ALL] PostgreSQL query error:', pgError);
        console.log('[BALANCE-RESET-ALL] Falling back to SQLite...');
      }
    }
    
    // SQLiteフォールバック
    console.log('[BALANCE-RESET-ALL] Using SQLite to fetch users');
    const dbInstance = (database as any).sqlite || (database as any).db;
    
    if (!dbInstance) {
      console.error('[BALANCE-RESET-ALL] SQLite database instance not found');
      return [];
    }

    return new Promise((resolve, reject) => {
      // テーブルの存在確認
      dbInstance.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", [], (err: any, row: any) => {
        if (err) {
          console.error('[BALANCE-RESET-ALL] Error checking table existence:', err);
          reject(err);
          return;
        }
        
        if (!row) {
          console.log('[BALANCE-RESET-ALL] Users table does not exist, returning empty array');
          resolve([]);
          return;
        }

        // ユーザーデータを取得
        dbInstance.all('SELECT discord_id, balance FROM users WHERE balance IS NOT NULL', [], (err: any, rows: any[]) => {
          if (err) {
            console.error('[BALANCE-RESET-ALL] Error fetching users:', err);
            reject(err);
          } else {
            console.log(`[BALANCE-RESET-ALL] SQLite: Fetched ${rows?.length || 0} users`);
            resolve(rows || []);
          }
        });
      });
    });
  } catch (error) {
    console.error('[BALANCE-RESET-ALL] Error in getAllUsers:', error);
    return [];
  }
}

// 全員残高リセット実行関数
export async function executeBalanceResetAll(interaction: any, targetAmount: number) {
  try {
    // 再度全ユーザーを取得
    const allUsers = await getAllUsers();

    if (allUsers.length === 0) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ リセット失敗')
        .setDescription('リセット対象のユーザーが見つかりませんでした。')
        .setTimestamp();

      await interaction.update({ embeds: [errorEmbed], components: [] });
      return;
    }

    // プログレス表示
    const progressEmbed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('⏳ 全員残高リセット実行中...')
      .setDescription(`${allUsers.length}人の残高を${targetAmount.toLocaleString()}Ruにリセットしています...`)
      .setTimestamp();

    await interaction.update({ embeds: [progressEmbed], components: [] });

    let successCount = 0;
    let errorCount = 0;
    const errorUsers: string[] = [];
    let totalOldBalance = 0;
    let totalNewBalance = 0;

    // 各ユーザーの残高をリセット
    for (const user of allUsers) {
      try {
        const oldBalance = user.balance || 0;
        totalOldBalance += oldBalance;
        
        // 残高を更新
        await database.updateUserBalance(user.discord_id, targetAmount);
        
        totalNewBalance += targetAmount;
        successCount++;
        
        // システムログに記録
        console.log(`[BALANCE RESET ALL] User ${user.discord_id}: ${oldBalance} → ${targetAmount} Ru`);
        
      } catch (error) {
        console.error(`[BALANCE RESET ALL ERROR] User ${user.discord_id}:`, error);
        errorCount++;
        errorUsers.push(`<@${user.discord_id}>`);
      }
    }

    // 結果表示
    const resultEmbed = new EmbedBuilder()
      .setColor(errorCount > 0 ? '#ffaa00' : '#00ff00')
      .setTitle(errorCount > 0 ? '⚠️ 全員残高リセット完了（一部エラー）' : '✅ 全員残高リセット完了')
      .addFields(
        { name: '🎯 設定残高', value: `${targetAmount.toLocaleString()}Ru`, inline: true },
        { name: '✅ 成功', value: `${successCount}人`, inline: true },
        { name: '❌ エラー', value: `${errorCount}人`, inline: true },
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

    await interaction.editReply({ embeds: [resultEmbed], components: [] });

  } catch (error) {
    console.error('Execute balance reset all error:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ 全員残高リセット失敗')
      .setDescription('リセット処理中にエラーが発生しました。\n管理者に連絡してください。')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
}