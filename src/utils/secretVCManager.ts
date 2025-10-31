import { 
  ButtonInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  ChannelType,
  PermissionFlagsBits,
  GuildMember,
  Guild
} from 'discord.js';
import { Database } from '../database';
import { SALARY_AUTHORIZED_ROLES } from '../utils/permissions';
import { getCurrencyLogger } from '../utils/currencyLogger';

// 処理中ユーザーのトラッキング
const processingUsers = new Map<string, number>();

// シークレットVC作成用のカテゴリID
const SECRET_VC_CATEGORY_ID = '1425044725865648148';

/**
 * 時間制限に応じた料金を取得
 */
function getCostByDuration(duration: number): number {
  switch (duration) {
    case 6:
      return 5000;
    case 12:
      return 10000;
    case 24:
      return 30000;
    default:
      return 5000;
  }
}

/**
 * 次のシークレットVC名を生成
 */
async function generateSecretVCName(guild: Guild): Promise<string> {
  try {
    // カテゴリ内の既存チャンネルを取得
    const category = await guild.channels.fetch(SECRET_VC_CATEGORY_ID);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return 'シークレットA';
    }

    const channels = category.children.cache.filter((ch: any) => 
      ch.type === ChannelType.GuildVoice && ch.name.startsWith('シークレット')
    );

    // A, B, C, ... の順で使用可能な文字を見つける
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < alphabet.length; i++) {
      const letter = alphabet[i];
      const testName = `シークレット${letter}`;
      
      const exists = channels.some((ch: any) => ch.name === testName);
      if (!exists) {
        return testName;
      }
    }

    // すべて使用済みの場合は番号を使用
    return `シークレット${channels.size + 1}`;
  } catch (error) {
    console.error('Error generating secret VC name:', error);
    return 'シークレットA';
  }
}

/**
 * VC内チャットにVC作成ボタンを送信 (DEPRECATED - Use panelManager instead)
 */
export async function sendVCCreationPanel(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
  console.warn('[DEPRECATED] sendVCCreationPanel is deprecated. Use panelManager instead.');
  await interaction.reply({
    content: '❌ この機能は廃止されました。管理者に連絡してください。',
    ephemeral: true
  });
}

/**
 * VC作成プロセスを開始
 */
export async function startVCCreation(interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.user.id;
  const currentTime = Date.now();
  
  console.log(`[DEBUG] startVCCreation called by ${interaction.user.tag}`);
  console.log(`[DEBUG] Interaction state - deferred: ${interaction.deferred}, replied: ${interaction.replied}`);
  
  // 重複処理の防止
  const lastProcessTime = processingUsers.get(userId);
  if (lastProcessTime && (currentTime - lastProcessTime) < 5000) {
    console.log(`[DEBUG] Duplicate request detected for user ${userId}, ignoring`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '⏳ 処理中です。少しお待ちください。', 
        flags: 64 // MessageFlags.Ephemeral
      });
    }
    return;
  }
  
  // 処理開始をマーク
  processingUsers.set(userId, currentTime);
  
  // 5秒後に自動的にフラグを削除
  setTimeout(() => {
    processingUsers.delete(userId);
  }, 5000);
  
  const database = new Database();
  
  try {
    // 即座にdeferして3秒タイムアウトを回避
    console.log(`[DEBUG] About to defer interaction immediately...`);
    await interaction.deferReply(); // ephemeralを削除して通常のメッセージとして送信
    console.log(`[DEBUG] Interaction deferred successfully`);
    
    console.log(`[DEBUG] Checking user balance for ${interaction.user.id}`);
    // ユーザーの残高確認
    let user = await database.getUser(interaction.user.id);
    if (!user) {
      console.log(`[DEBUG] User not found, creating new user: ${interaction.user.id}`);
      user = await database.createUser(interaction.user.id);
    }

    console.log(`[DEBUG] User balance: ${user.balance}`);
    if (user.balance < 5000) {
      console.log(`[DEBUG] Insufficient balance: ${user.balance} < 5000`);
      await interaction.editReply({ 
        content: `❌ 残高が不足しています。\n最低必要額: 5,000 Ru\n現在の残高: ${user.balance.toLocaleString()} Ru`
      });
      return;
    }

    console.log(`[DEBUG] Creating time selection embed`);
    // 時間制限選択画面（ボタン方式）
    const timeEmbed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('⏰ VC継続時間を選択')
      .setDescription('シークレットVCの継続時間を選択してください。\n指定時間経過後、自動的に削除されます。\n\n⚠️ まず「テストVC作成」でカテゴリ権限の確認をお試しください。')
      .addFields(
        { name: '6時間', value: '5,000 Ru', inline: true },
        { name: '12時間', value: '10,000 Ru', inline: true },
        { name: '24時間', value: '30,000 Ru', inline: true }
      );

    console.log(`[DEBUG] Creating time selection buttons`);
    const timeButtons1 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('vc_test_create')
          .setLabel('テストVC作成')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('👥'),
        new ButtonBuilder()
          .setCustomId('vc_duration_6')
          .setLabel('6時間 (5,000 Ru)')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⏰')
      );

    const timeButtons2 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('vc_duration_12')
          .setLabel('12時間 (10,000 Ru)')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('👥'),
        new ButtonBuilder()
          .setCustomId('vc_duration_24')
          .setLabel('24時間 (30,000 Ru)')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📅')
      );

    console.log(`[DEBUG] Sending reply with time selection buttons`);
    await interaction.editReply({
      embeds: [timeEmbed],
      components: [timeButtons1, timeButtons2]
    });
    console.log(`[DEBUG] Reply sent successfully`);

  } catch (error) {
    console.error('VC作成開始エラー:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      userId: interaction.user.id,
      deferred: interaction.deferred,
      replied: interaction.replied
    });
    
    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ 
          content: '❌ エラーが発生しました。再度お試しください。'
        });
      } else if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: '❌ エラーが発生しました。再度お試しください。', 
          flags: 64 // MessageFlags.Ephemeral
        });
      }
    } catch (replyError) {
      console.error('Error sending error reply:', replyError);
    } finally {
      // エラー時もフラグを削除
      processingUsers.delete(userId);
    }
  }
}

/**
 * 時間選択後のパートナー選択画面
 */
export async function handleDurationSelection(interaction: MessageComponentInteraction): Promise<void> {
  console.log(`[DEBUG] handleDurationSelection called by ${interaction.user.tag}`);
  console.log(`[DEBUG] Interaction type: ${interaction.type}, customId: ${interaction.customId}`);
  console.log(`[DEBUG] Is StringSelectMenu: ${interaction.isStringSelectMenu()}`);
  
  if (!interaction.isStringSelectMenu()) {
    console.log(`[DEBUG] Not a string select menu interaction`);
    return;
  }
  
  const duration = parseInt(interaction.values[0]);
  console.log(`[DEBUG] Selected duration: ${duration} hours`);
  console.log(`[DEBUG] Raw values: ${JSON.stringify(interaction.values)}`);
  
  try {
    // 最初に即座に応答する
    console.log(`[DEBUG] About to defer interaction...`);
    console.log(`[DEBUG] Interaction state before defer - deferred: ${interaction.deferred}, replied: ${interaction.replied}`);
    
    await interaction.deferUpdate();
    console.log(`[DEBUG] Interaction deferred successfully`);
    
    // 非同期で残りの処理を実行
    setImmediate(async () => {
      try {
        await processPartnerSelection(interaction, duration);
      } catch (error) {
        console.error('Error in processPartnerSelection:', error);
        await handlePartnerSelectionError(interaction, error, duration);
      }
    });
    
  } catch (error) {
    console.error('Error in handleDurationSelection - immediate section:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack',
      userId: interaction.user.id,
      duration: duration,
      deferred: interaction.deferred,
      replied: interaction.replied
    });
    
    // deferに失敗した場合の緊急処理
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update({
          content: '❌ エラーが発生しました。再度お試しください。',
          embeds: [],
          components: []
        });
      }
    } catch (updateError) {
      console.error('Failed to send emergency error message:', updateError);
    }
  }
}

/**
 * パートナー選択処理（非同期）
 */
async function processPartnerSelection(interaction: MessageComponentInteraction, duration: number): Promise<void> {
  console.log(`[DEBUG] processPartnerSelection started for duration: ${duration}`);
  
  // 料金確認と残高チェック
  console.log(`[DEBUG] Getting cost for duration: ${duration}`);
  const cost = getCostByDuration(duration);
  console.log(`[DEBUG] Cost calculated: ${cost}`);
  
  console.log(`[DEBUG] Creating database instance...`);
  const database = new Database();
  console.log(`[DEBUG] Database instance created`);
  
  console.log(`[DEBUG] Checking user balance for cost: ${cost}`);
  let user = await database.getUser(interaction.user.id);
  if (!user) {
    console.log(`[DEBUG] User not found, creating new user`);
    user = await database.createUser(interaction.user.id);
  }
  
  console.log(`[DEBUG] User balance: ${user.balance}, Required: ${cost}`);
  
  // 残高不足の場合
  if (user.balance < cost) {
    console.log(`[DEBUG] Insufficient balance`);
    const insufficientEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ 残高不足')
      .setDescription(`選択した時間制限（${duration}時間）に必要な残高が不足しています。`)
      .addFields(
        { name: '必要額', value: `${cost.toLocaleString()} Ru`, inline: true },
        { name: '現在の残高', value: `${user.balance.toLocaleString()} Ru`, inline: true },
        { name: '不足額', value: `${(cost - user.balance).toLocaleString()} Ru`, inline: true }
      );

    console.log(`[DEBUG] Sending insufficient balance message`);
    await interaction.editReply({
      embeds: [insufficientEmbed],
      components: []
    });
    return;
  }
  
  console.log(`[DEBUG] Balance sufficient, creating partner selection embed`);
  
  const partnerEmbed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle('👥 パートナー選択')
    .setDescription(`継続時間: **${duration}時間** (${cost.toLocaleString()} Ru)\n\n一緒にVCを使う相手を選択してください。`)
    .addFields(
      { name: '選択方法', value: '• メンバー一覧から選択\n• ユーザー名/IDで検索\n• パートナーなしで作成', inline: false }
    );

  console.log(`[DEBUG] Partner embed created, creating buttons`);

  const partnerButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`vc_partner_list_${duration}`)
        .setLabel('メンバー一覧から選択')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId(`vc_partner_search_${duration}`)
        .setLabel('ユーザー名/IDで検索')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId(`vc_no_partner_${duration}`)
        .setLabel('パートナーなしで作成')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👤')
    );

  console.log(`[DEBUG] Buttons created, updating interaction with partner selection`);
  await interaction.editReply({
    embeds: [partnerEmbed],
    components: [partnerButtons]
  });
  console.log(`[DEBUG] Partner selection update successful`);
}

/**
 * パートナー選択処理のエラーハンドリング
 */
async function handlePartnerSelectionError(interaction: MessageComponentInteraction, error: unknown, duration: number): Promise<void> {
  console.error('Error in partner selection process:', error);
  console.error('Error details:', {
    name: error instanceof Error ? error.name : 'Unknown',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : 'No stack',
    userId: interaction.user.id,
    duration: duration
  });
  
  try {
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ エラーが発生しました')
      .setDescription(`処理中にエラーが発生しました。\n\nエラー: ${error instanceof Error ? error.message : String(error)}`);
      
    console.log(`[DEBUG] Attempting to send error message, deferred: ${interaction.deferred}`);
    
    await interaction.editReply({
      embeds: [errorEmbed],
      components: []
    });
    console.log(`[DEBUG] Error message sent successfully`);
  } catch (replyError) {
    console.error('Failed to send error message:', replyError);
  }
}

/**
 * 時間選択ボタン押下後のパートナー選択画面（ボタン方式）
 */
export async function handleDurationButtonSelection(interaction: ButtonInteraction, duration: number): Promise<void> {
  console.log(`[DEBUG] handleDurationButtonSelection called by ${interaction.user.tag} for ${duration} hours`);
  console.log(`[DEBUG] Button interaction state - deferred: ${interaction.deferred}, replied: ${interaction.replied}`);
  
  const userId = interaction.user.id;
  const currentTime = Date.now();
  
  // 重複処理の防止
  const lastProcessTime = processingUsers.get(userId);
  if (lastProcessTime && (currentTime - lastProcessTime) < 3000) {
    console.log(`[DEBUG] Duplicate duration selection detected for user ${userId}, ignoring`);
    return;
  }
  
  // 処理開始をマーク
  processingUsers.set(userId, currentTime);
  console.log(`[DEBUG] Processing user ${userId} marked at ${currentTime}`);
  
  // 3秒後に自動的にフラグを削除
  setTimeout(() => {
    processingUsers.delete(userId);
    console.log(`[DEBUG] Processing flag removed for user ${userId}`);
  }, 3000);
  
  try {
    // 即座にdeferして3秒タイムアウトを回避
    console.log(`[DEBUG] About to defer button interaction...`);
    console.log(`[DEBUG] Interaction type: ${interaction.type}, customId: ${interaction.customId}`);
    
    await interaction.deferUpdate();
    console.log(`[DEBUG] Button interaction deferred successfully`);
    
    // 料金確認を先に実行
    console.log(`[DEBUG] Checking cost and balance before partner selection...`);
    const cost = getCostByDuration(duration);
    console.log(`[DEBUG] Cost for ${duration} hours: ${cost}`);
    
    const database = new Database();
    let user = await database.getUser(interaction.user.id);
    if (!user) {
      console.log(`[DEBUG] User not found, creating new user`);
      user = await database.createUser(interaction.user.id);
    }
    
    console.log(`[DEBUG] User balance: ${user.balance}, Required: ${cost}`);
    
    // 残高不足の場合は即座に処理
    if (user.balance < cost) {
      console.log(`[DEBUG] Insufficient balance, showing error immediately`);
      const insufficientEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ 残高不足')
        .setDescription(`選択した時間制限（${duration}時間）に必要な残高が不足しています。`)
        .addFields(
          { name: '必要額', value: `${cost.toLocaleString()} Ru`, inline: true },
          { name: '現在の残高', value: `${user.balance.toLocaleString()} Ru`, inline: true },
          { name: '不足額', value: `${(cost - user.balance).toLocaleString()} Ru`, inline: true }
        );

      const backButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_vc_creation')
            .setLabel('VC作成に戻る')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔙')
        );

      await interaction.editReply({
        embeds: [insufficientEmbed],
        components: [backButton]
      });
      return;
    }
    
    // 残高が十分な場合は非同期でパートナー選択処理
    console.log(`[DEBUG] Balance sufficient, proceeding to partner selection...`);
    setImmediate(async () => {
      try {
        console.log(`[DEBUG] Starting processPartnerSelection in setImmediate...`);
        await processPartnerSelectionForButton(interaction, duration);
        console.log(`[DEBUG] processPartnerSelection completed successfully`);
      } catch (error) {
        console.error('Error in processPartnerSelection (button):', error);
        console.error('Error details:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack',
          userId: interaction.user.id,
          duration: duration
        });
        await handlePartnerSelectionError(interaction, error, duration);
      }
    });
    
  } catch (error) {
    console.error('Error in handleDurationButtonSelection:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack',
      userId: interaction.user.id,
      duration: duration,
      deferred: interaction.deferred,
      replied: interaction.replied,
      interactionType: interaction.type,
      customId: interaction.customId
    });
    
    // エラー時の緊急処理
    try {
      if (!interaction.replied && !interaction.deferred) {
        console.log(`[DEBUG] Attempting emergency reply (not deferred)`);
        await interaction.update({
          content: '❌ エラーが発生しました。再度お試しください。',
          embeds: [],
          components: []
        });
      } else if (interaction.deferred && !interaction.replied) {
        console.log(`[DEBUG] Attempting emergency editReply (deferred)`);
        await interaction.editReply({
          content: '❌ エラーが発生しました。再度お試しください。',
          embeds: [],
          components: []
        });
      } else {
        console.log(`[DEBUG] Cannot send emergency message - replied: ${interaction.replied}, deferred: ${interaction.deferred}`);
      }
    } catch (updateError) {
      console.error('Failed to send emergency error message (button):', updateError);
    } finally {
      // エラー時もフラグを削除
      processingUsers.delete(userId);
      console.log(`[DEBUG] Processing flag removed for user ${userId} (error cleanup)`);
    }
  }
}

/**
 * パートナー選択処理（ボタン用）- 新しいシンプルバージョン
 */
async function processPartnerSelectionForButton(interaction: ButtonInteraction, duration: number): Promise<void> {
  console.log(`[DEBUG] processPartnerSelectionForButton started for duration: ${duration}`);
  
  const cost = getCostByDuration(duration);
  
  const partnerEmbed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle('👥 パートナー設定')
    .setDescription(`継続時間: **${duration}時間** (${cost.toLocaleString()} Ru)\n\nシークレットVCのパートナー設定を選択してください。`)
    .addFields(
      { name: '🔹 パートナーあり', value: 'もう一人のユーザーと共有するVCを作成', inline: true },
      { name: '🔸 パートナーなし', value: 'あなた専用のVCを作成', inline: true }
    );

  console.log(`[DEBUG] Partner embed created, creating simple buttons`);

  const partnerButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`vc_with_partner_${duration}`)
        .setLabel('パートナーありで作成')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`vc_no_partner_${duration}`)
        .setLabel('パートナーなしで作成')
        .setStyle(ButtonStyle.Secondary)
    );

  const backButton = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('back_to_vc_creation')
        .setLabel('時間選択に戻る')
        .setStyle(ButtonStyle.Secondary)
    );

  console.log(`[DEBUG] Buttons created, updating interaction with simple partner selection`);
  await interaction.editReply({
    embeds: [partnerEmbed],
    components: [partnerButtons, backButton]
  });
  console.log(`[DEBUG] Simple partner selection update successful`);
}

/**
 * テストVC作成（カテゴリ権限と同期）
 */
export async function createTestVC(interaction: ButtonInteraction): Promise<void> {
  console.log(`[DEBUG] createTestVC called by ${interaction.user.tag}`);
  
  try {
    // 即座にdeferして3秒タイムアウトを回避
    console.log(`[DEBUG] About to defer test VC creation...`);
    await interaction.deferUpdate();
    console.log(`[DEBUG] Test VC creation deferred successfully`);
    
    const guild = interaction.guild;
    if (!guild) {
      throw new Error('Guild not found');
    }

    console.log(`[DEBUG] Creating test VC with category sync...`);
    
    // カテゴリと同期した権限でVC作成
    const channel = await guild.channels.create({
      name: `🧪test-${interaction.user.username}`,
      type: ChannelType.GuildVoice,
      parent: SECRET_VC_CATEGORY_ID, // シークレットVCと同じカテゴリを使用
      // permissionOverwritesを指定しない = カテゴリと同期
    });

    console.log(`[DEBUG] Test VC created successfully: ${channel.id}`);

    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ テストVC作成成功')
      .setDescription(`テストVCが正常に作成されました！\nカテゴリと同期した権限でVC作成が可能です。`)
      .addFields(
        { name: 'VC名', value: channel.name, inline: true },
        { name: 'VC ID', value: channel.id, inline: true },
        { name: 'カテゴリ', value: channel.parent?.name || 'なし', inline: true }
      );

    const deleteButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_test_vc_${channel.id}`)
          .setLabel('テストVCを削除')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️'),
        new ButtonBuilder()
          .setCustomId('back_to_vc_creation')
          .setLabel('VC作成に戻る')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔙')
      );

    await interaction.editReply({
      embeds: [successEmbed],
      components: [deleteButton]
    });

  } catch (error) {
    console.error('Error in createTestVC:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack',
      userId: interaction.user.id
    });
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ テストVC作成失敗')
      .setDescription(`テストVCの作成に失敗しました。\n\nエラー: ${error instanceof Error ? error.message : String(error)}`)
      .addFields(
        { name: '対処法', value: '• ボットに適切な権限があるか確認してください\n• カテゴリが存在するか確認してください\n• しばらく時間をおいて再試行してください', inline: false }
      );

    const backButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_vc_creation')
          .setLabel('VC作成に戻る')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔙')
      );

    try {
      await interaction.editReply({
        embeds: [errorEmbed],
        components: [backButton]
      });
    } catch (replyError) {
      console.error('Failed to send test VC error message:', replyError);
    }
  }
}

/**
 * テストVC削除
 */
export async function deleteTestVC(interaction: ButtonInteraction, channelId: string): Promise<void> {
  console.log(`[DEBUG] deleteTestVC called by ${interaction.user.tag} for channel ${channelId}`);
  
  try {
    await interaction.deferUpdate();
    
    const guild = interaction.guild;
    if (!guild) {
      throw new Error('Guild not found');
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    console.log(`[DEBUG] Deleting test VC: ${channel.name}`);
    await channel.delete('テストVC削除');

    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ テストVC削除完了')
      .setDescription('テストVCが正常に削除されました。');

    const backButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_vc_creation')
          .setLabel('VC作成に戻る')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔙')
      );

    await interaction.editReply({
      embeds: [successEmbed],
      components: [backButton]
    });

  } catch (error) {
    console.error('Error in deleteTestVC:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ テストVC削除失敗')
      .setDescription(`テストVCの削除に失敗しました。\n\nエラー: ${error instanceof Error ? error.message : String(error)}`);

    const backButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_vc_creation')
          .setLabel('VC作成に戻る')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔙')
      );

    try {
      await interaction.editReply({
        embeds: [errorEmbed],
        components: [backButton]
      });
    } catch (replyError) {
      console.error('Failed to send delete test VC error message:', replyError);
    }
  }
}

/**
 * メンバー一覧からパートナーを選択
 */
export async function showPartnerList(interaction: ButtonInteraction, duration: number): Promise<void> {
  console.log(`[DEBUG] showPartnerList called by ${interaction.user.tag} for duration: ${duration}`);
  console.log(`[DEBUG] Interaction state - deferred: ${interaction.deferred}, replied: ${interaction.replied}`);
  
  const guild = interaction.guild;
  if (!guild) {
    console.error('[DEBUG] Guild not found in showPartnerList');
    return;
  }

  try {
    // 即座にdeferして3秒タイムアウトを回避
    console.log(`[DEBUG] About to defer showPartnerList interaction...`);
    await interaction.deferUpdate();
    console.log(`[DEBUG] showPartnerList interaction deferred successfully`);

    console.log(`[DEBUG] Fetching guild members...`);
    // アクティブなメンバーを取得（最近オンラインだったメンバー）
    const members = await guild.members.fetch({ limit: 50 });
    console.log(`[DEBUG] Fetched ${members.size} members from guild`);
    
    const activeMembers = members
      .filter(member => {
        const isBot = member.user.bot;
        const isSelf = member.user.id === interaction.user.id;
        const isOffline = member.presence?.status === 'offline';
        
        console.log(`[DEBUG] Member ${member.user.username}: bot=${isBot}, self=${isSelf}, offline=${isOffline}`);
        
        return !isBot && !isSelf && !isOffline;
      })
      .first(20); // 最大20人まで

    console.log(`[DEBUG] Found ${activeMembers.length} active members`);

    if (activeMembers.length === 0) {
      console.log(`[DEBUG] No active members found, showing fallback message`);
      
      const noMembersEmbed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('⚠️ アクティブなメンバーが見つかりません')
        .setDescription('現在オンラインのメンバーが見つかりませんでした。\n検索機能またはパートナーなしでの作成をお試しください。');

      const fallbackButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`vc_partner_search_${duration}`)
            .setLabel('ユーザー名/IDで検索')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👥'),
          new ButtonBuilder()
            .setCustomId(`vc_no_partner_${duration}`)
            .setLabel('パートナーなしで作成')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👥'),
          new ButtonBuilder()
            .setCustomId('back_to_vc_creation')
            .setLabel('戻る')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔙')
        );

      await interaction.editReply({
        embeds: [noMembersEmbed],
        components: [fallbackButtons]
      });
      return;
    }

    console.log(`[DEBUG] Creating member selection menu with ${activeMembers.length} options`);
    const memberSelect = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`vc_member_select_${duration}`)
          .setPlaceholder('パートナーを選択してください')
          .addOptions(
            activeMembers.map(member => {
              console.log(`[DEBUG] Adding member option: ${member.displayName} (${member.user.id})`);
              return new StringSelectMenuOptionBuilder()
                .setLabel(member.displayName)
                .setDescription(`@${member.user.username}`)
                .setValue(member.user.id)
                .setEmoji('👤');
            })
          )
      );

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('👥 メンバー一覧')
      .setDescription(`パートナーとして追加したいメンバーを選択してください。\n\n継続時間: **${duration}時間**`)
      .addFields(
        { name: 'アクティブメンバー数', value: `${activeMembers.length}人`, inline: true },
        { name: '選択可能', value: '最大20人まで表示', inline: true }
      );

      const backButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`back_to_partner_selection_${duration}`)
            .setLabel('パートナー選択に戻る')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔙')
        );    console.log(`[DEBUG] Updating interaction with member list`);
    await interaction.editReply({
      embeds: [embed],
      components: [memberSelect, backButton]
    });
    console.log(`[DEBUG] Member list update successful`);

  } catch (error) {
    console.error('Error in showPartnerList:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack',
      userId: interaction.user.id,
      duration: duration,
      deferred: interaction.deferred,
      replied: interaction.replied
    });
    
    try {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ メンバー一覧取得エラー')
        .setDescription(`メンバー一覧の取得に失敗しました。\n\nエラー: ${error instanceof Error ? error.message : String(error)}`);

      const backButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`back_to_partner_selection_${duration}`)
            .setLabel('パートナー選択に戻る')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔙')
        );

      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          embeds: [errorEmbed],
          components: [backButton]
        });
      } else if (!interaction.replied && !interaction.deferred) {
        await interaction.update({
          embeds: [errorEmbed],
          components: [backButton]
        });
      }
    } catch (replyError) {
      console.error('Failed to send showPartnerList error message:', replyError);
    }
  }
}

/**
 * ユーザー検索モーダルを表示
 */
export async function showPartnerSearchModal(interaction: ButtonInteraction, duration: number): Promise<void> {
  console.log(`[DEBUG] showPartnerSearchModal called by ${interaction.user.tag} for duration: ${duration}`);
  console.log(`[DEBUG] Interaction state - deferred: ${interaction.deferred}, replied: ${interaction.replied}`);
  
  try {
    const modal = new ModalBuilder()
      .setCustomId(`vc_partner_modal_${duration}`)
      .setTitle('👥 パートナー検索');

    const userInput = new TextInputBuilder()
      .setCustomId('partner_input')
      .setLabel('ユーザー名またはユーザーID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: username または 123456789012345678')
      .setRequired(true)
      .setMaxLength(100);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(userInput);
    modal.addComponents(actionRow);

    console.log(`[DEBUG] Showing modal for partner search...`);
    await interaction.showModal(modal);
    console.log(`[DEBUG] Modal shown successfully`);
  } catch (error) {
    console.error('Error in showPartnerSearchModal:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack',
      userId: interaction.user.id,
      duration: duration
    });
  }
}

/**
 * シンプルなパートナーモーダルを表示
 */
export async function showSimplePartnerModal(interaction: ButtonInteraction, duration: number): Promise<void> {
  console.log(`[DEBUG] showSimplePartnerModal called by ${interaction.user.tag} for duration: ${duration}`);
  console.log(`[DEBUG] Interaction state - deferred: ${interaction.deferred}, replied: ${interaction.replied}`);
  
  try {
    const modal = new ModalBuilder()
      .setCustomId(`vc_simple_partner_modal_${duration}`)
      .setTitle('👥 パートナー指定');

    const userInput = new TextInputBuilder()
      .setCustomId('partner_input')
      .setLabel('パートナーのユーザーID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: 123456789012345678')
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(19);

    const helpText = new TextInputBuilder()
      .setCustomId('help_text')
      .setLabel('ヒント: ユーザーIDの確認方法')
      .setStyle(TextInputStyle.Paragraph)
      .setValue('1. Discordで対象ユーザーを右クリック\n2. "ユーザーIDをコピー"を選択\n3. ここに貼り付け\n\n注意: ユーザー名ではなく数字のIDが必要です')
      .setRequired(false);

    const actionRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(userInput);
    const actionRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(helpText);
    modal.addComponents(actionRow1, actionRow2);

    console.log(`[DEBUG] Showing simple partner modal...`);
    await interaction.showModal(modal);
    console.log(`[DEBUG] Simple partner modal shown successfully`);
  } catch (error) {
    console.error('Error in showSimplePartnerModal:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack',
      userId: interaction.user.id,
      duration: duration
    });
  }
}

/**
 * 最終的なVC作成処理
 */
export async function createSecretVC(
  interaction: MessageComponentInteraction | ModalSubmitInteraction, 
  duration: number, 
  partnerId?: string
): Promise<void> {
  console.log(`[DEBUG] createSecretVC called by ${interaction.user.tag}, duration: ${duration}, partnerId: ${partnerId}`);
  
  try {
    // モーダル送信の場合はすでにdeferReply済み、ボタンの場合はdeferUpdateが必要
    const isModalSubmit = 'isModalSubmit' in interaction && interaction.isModalSubmit();
    
    if (!isModalSubmit) {
      // ボタンからの場合のみdeferUpdate
      await interaction.deferUpdate();
      console.log(`[DEBUG] Interaction deferred for VC creation`);
    }
    
    const database = new Database();
    const cost = getCostByDuration(duration);
    const guild = interaction.guild;
    
    if (!guild) {
      console.log(`[DEBUG] Guild not found`);
      await interaction.editReply({
        content: '❌ サーバー情報が取得できませんでした。',
        embeds: [],
        components: []
      });
      return;
    }

    console.log(`[DEBUG] Starting VC creation process...`);
    
    // 進行状況を表示
    const progressEmbed = new EmbedBuilder()
      .setColor('#ffff00')
      .setTitle('🔄 シークレットVC作成中...')
      .setDescription('しばらくお待ちください。')
      .addFields(
        { name: '継続時間', value: `${duration}時間`, inline: true },
        { name: '費用', value: `${cost.toLocaleString()} Ru`, inline: true }
      );
      
    await interaction.editReply({
      embeds: [progressEmbed],
      components: []
    });

    // 再度残高確認
    let user = await database.getUser(interaction.user.id);
    if (!user || user.balance < cost) {
      console.log(`[DEBUG] Insufficient balance during creation`);
      await interaction.editReply({
        content: `❌ 残高が不足しています。\n必要額: ${cost.toLocaleString()} Ru\n現在の残高: ${user?.balance?.toLocaleString() || 0} Ru`,
        embeds: [],
        components: []
      });
      return;
    }

    // パートナーの確認
    let partner: GuildMember | undefined;
    if (partnerId) {
      try {
        console.log(`[DEBUG] Fetching partner: ${partnerId}`);
        partner = await guild.members.fetch(partnerId);
        if (partner) {
          console.log(`[DEBUG] Partner found: ${partner.displayName}`);
        }
      } catch {
        console.log(`[DEBUG] Partner not found: ${partnerId}`);
        await interaction.editReply({
          content: '❌ 指定されたユーザーが見つかりません。',
          embeds: [],
          components: []
        });
        return;
      }
    }

    // チャンネル名生成
    const channelName = await generateSecretVCName(guild);

    // VCを作成
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: SECRET_VC_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.ManageChannels
          ]
        },
        ...(partner ? [{
          id: partner.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak
          ]
        }] : []),
        // 管理者権限
        ...SALARY_AUTHORIZED_ROLES.map(roleId => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.ManageChannels
          ]
        }))
      ]
    });

    // 料金支払い
    await database.updateUserBalance(interaction.user.id, user.balance - cost);
    
    // 取引履歴を記録
    await database.addTransaction(
      interaction.user.id,
      interaction.user.id,
      cost,
      'vc_purchase',
      `シークレットVC作成(${duration}h): ${channel.name}`
    );

    // 通貨ログに記録
    const logger = getCurrencyLogger();
    if (logger) {
      await logger.logTransaction({
        fromUserId: interaction.user.id,
        toUserId: interaction.user.id,
        amount: cost,
        type: 'vc_purchase',
        description: `シークレットVC作成(${duration}h): ${channel.name}`
      });
    }

    // DBにVC情報を記録（削除時刻付き）
    const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
    await database.addSecretVCWithExpiry(channel.id, interaction.user.id, channel.name, expiresAt);

    // 削除タイマーを設定
    setTimeout(async () => {
      await deleteExpiredVC(channel.id, database);
    }, duration * 60 * 60 * 1000);

    // 成功メッセージ
    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🎪 シークレットVC作成完了')
      .addFields(
        { name: 'チャンネル名', value: channel.name, inline: true },
        { name: '継続時間', value: `${duration}時間`, inline: true },
        { name: '削除予定', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: false },
        { name: 'パートナー', value: partner ? `<@${partner.id}>` : 'なし', inline: true },
        { name: '作成費用', value: `${cost.toLocaleString()} Ru`, inline: true }
      )
      .setDescription(`<#${channel.id}> が作成されました！`)
      .setFooter({ text: '指定時間経過後、自動的に削除されます' });

    const controlRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_vc_${channel.id}`)
          .setLabel('VCを削除')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );

    await interaction.editReply({
      embeds: [successEmbed],
      components: [controlRow]
    });

  } catch (error) {
    console.error('VC作成エラー:', error);
    await interaction.editReply({
      content: '❌ VC作成中にエラーが発生しました。',
      embeds: [],
      components: []
    });
  }
}

/**
 * 期限切れVCの削除
 */
async function deleteExpiredVC(channelId: string, database: Database): Promise<void> {
  try {
    const vcInfo = await database.getSecretVC(channelId);
    if (!vcInfo) return;

    // DBから削除
    await database.removeSecretVC(channelId);
    
    console.log(`[VC EXPIRED] Deleted expired VC: ${vcInfo.channel_name}`);
  } catch (error) {
    console.error('期限切れVC削除エラー:', error);
  }
}

/**
 * VCの手動削除
 */
export async function deleteSecretVC(interaction: ButtonInteraction, channelId: string): Promise<void> {
  const database = new Database();

  try {
    const vcInfo = await database.getSecretVC(channelId);
    if (!vcInfo) {
      await interaction.update({
        content: '❌ VCが見つかりません。',
        embeds: [],
        components: []
      });
      return;
    }

    // 作成者または管理者のみ削除可能
    const member = interaction.member as GuildMember;
    const isCreator = vcInfo.creator_id === interaction.user.id;
    const isAdmin = member.roles.cache.some(role => SALARY_AUTHORIZED_ROLES.includes(role.id));

    if (!isCreator && !isAdmin) {
      await interaction.reply({
        content: '❌ このVCを削除する権限がありません。',
        ephemeral: true
      });
      return;
    }

    // チャンネルを削除
    const channel = await interaction.guild?.channels.fetch(channelId);
    if (channel && 'delete' in channel) {
      await channel.delete('手動削除');
    }

    // DBから削除
    await database.removeSecretVC(channelId);

    await interaction.update({
      content: '✅ シークレットVCを削除しました。',
      embeds: [],
      components: []
    });

    console.log(`[VC DELETED] Manually deleted VC: ${vcInfo.channel_name} by ${interaction.user.username}`);

  } catch (error) {
    console.error('VC削除エラー:', error);
    await interaction.update({
      content: '❌ VC削除中にエラーが発生しました。',
      embeds: [],
      components: []
    });
  }
}