import { 
  ModalSubmitInteraction, 
  ChannelType, 
  EmbedBuilder, 
  Client,
  VoiceChannel,
  TextChannel,
  ThreadChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} from 'discord.js';
import { Database } from '../database';
import { sendVCCreationLog } from './ruLogger';

// 一時VCカテゴリID
const TEMP_VC_CATEGORY_ID = '1425044725865648148';
// 一時VCパネル送信先スレッドID
const TEMP_VC_PANEL_CHANNEL_ID = '1433096344171712636';

/**
 * プラン情報取得
 */
function getPlanInfo(planType: string): { hours: number; cost: number; label: string } | null {
  switch (planType) {
    case '6h':
      return { hours: 6, cost: 5000, label: '6時間' };
    case '12h':
      return { hours: 12, cost: 10000, label: '12時間' };
    case '24h':
      return { hours: 24, cost: 30000, label: '24時間' };
    default:
      return null;
  }
}

/**
 * 一時VC作成
 */
export async function createTempVC(interaction: ModalSubmitInteraction, planType: string = '12h'): Promise<void> {
  const database = new Database();
  
  try {
    // 最初にインタラクションを延期（3秒制限を回避）
    await interaction.deferReply({ ephemeral: true });

    const channelName = interaction.fields.getTextInputValue('channel_name');
    
    if (!channelName || channelName.trim().length === 0) {
      await interaction.editReply({
        content: '❌ チャンネル名を入力してください。'
      });
      return;
    }

    if (channelName.length > 30) {
      await interaction.editReply({
        content: '❌ チャンネル名は30文字以内で入力してください。'
      });
      return;
    }

    // プラン情報の取得
    const planInfo = getPlanInfo(planType);
    if (!planInfo) {
      await interaction.editReply({
        content: '❌ 無効なプランが選択されました。'
      });
      return;
    }

    // 残高チェック
    console.log(`[TEMP VC DEBUG] Checking balance for user: ${interaction.user.id}`);
    let user = await database.getUser(interaction.user.id);
    console.log(`[TEMP VC DEBUG] Initial user data:`, user);
    
    // ユーザーが存在しない場合は作成
    if (!user) {
      console.log(`[TEMP VC DEBUG] User not found, creating new user`);
      try {
        user = await database.createUser(interaction.user.id);
        console.log(`[TEMP VC DEBUG] Created new user:`, user);
      } catch (error) {
        console.log(`[TEMP VC DEBUG] User creation failed, trying to get existing user:`, error);
        // 既に存在する場合は再取得
        user = await database.getUser(interaction.user.id);
        if (!user) {
          throw new Error('Failed to get or create user');
        }
      }
    }
    
    console.log(`[TEMP VC DEBUG] Required cost: ${planInfo.cost}, User balance: ${user.balance}`);
    
    if (user.balance < planInfo.cost) {
      console.log(`[TEMP VC DEBUG] Balance check failed - Balance: ${user.balance}, Required: ${planInfo.cost}`);
      await interaction.editReply({
        content: `❌ 残高が不足しています。\n必要: ${planInfo.cost.toLocaleString()} Ru\n現在の残高: ${user.balance.toLocaleString()} Ru\n\nプラン: ${planInfo.label}`
      });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply({
        content: '❌ サーバー情報を取得できませんでした。'
      });
      return;
    }

    // 作成中メッセージを表示
    const creatingEmbed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('🔄 プライベートVC作成中...')
      .setDescription(`チャンネルを作成しています。しばらくお待ちください。\n\n**プラン**: ${planInfo.label}\n**料金**: ${planInfo.cost.toLocaleString()} Ru`)
      .setTimestamp();

    await interaction.editReply({ embeds: [creatingEmbed] });

    try {
      // VCを作成
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: TEMP_VC_CATEGORY_ID,
        userLimit: 2, // 初期は2人まで（MusicBot参加時に自動で3人に変更）
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel], // 全員に対して閲覧を拒否
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.ManageChannels
            ], // 作成者には全権限付与
          },
        ],
      });

      // 期限を計算
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + planInfo.hours);

      // 料金を引き落とし
      const newBalance = user.balance - planInfo.cost;
      await database.updateUserBalance(interaction.user.id, newBalance);
      
      // 取引履歴を記録
      await database.addTransaction(
        interaction.user.id, 
        interaction.user.id, 
        -planInfo.cost, 
        'vc_purchase', 
        `一時VC作成(${planInfo.label}): ${channelName}`
      );

      // データベースに記録
      await database.addTempVC(channel.id, interaction.user.id, channel.name, planInfo.hours, planInfo.cost, expiresAt);

      // Ruログを送信
      try {
        await sendVCCreationLog(
          interaction.client,
          interaction.user.id,
          interaction.user.username,
          channelName,
          planInfo.cost,
          planInfo.label,
          newBalance
        );
      } catch (logError) {
        console.error('[TEMP VC] Error sending Ru log:', logError);
      }

      // 完了メッセージ
      const successEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ プライベート一時VC作成完了')
        .setDescription(`🔒 <#${channel.id}> が作成されました！`)
        .addFields(
          { name: '🏷️ チャンネル名', value: channel.name, inline: true },
          { name: '👤 作成者', value: `<@${interaction.user.id}>`, inline: true },
          { name: '⏰ 有効期限', value: planInfo.label, inline: true },
          { name: '💰 料金', value: `${planInfo.cost.toLocaleString()} Ru`, inline: true },
          { name: '👥 最大人数', value: '2人（MusicBot参加時は3人）', inline: true },
          { name: '🗑️ 削除予定', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: `${planInfo.label}後に自動削除されます` })
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

      // VC内に設定パネルを送信
      try {
        const settingsPanel = createVCSettingsPanel(channel.name, 2);
        await channel.send(settingsPanel);
        console.log(`[VC SETTINGS] Settings panel sent to ${channel.name}`);
      } catch (panelError) {
        console.error('[VC SETTINGS] Error sending settings panel:', panelError);
      }

      console.log(`[TEMP VC] Created: ${channel.name} by ${interaction.user.tag}, expires at ${expiresAt.toISOString()}`);

    } catch (error) {
      console.error('Error creating temp VC:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ エラー')
        .setDescription('一時VCの作成中にエラーが発生しました。')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }

  } catch (error) {
    console.error('Error in createTempVC:', error);
    try {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ エラーが発生しました')
        .setDescription('処理中にエラーが発生しました。しばらく待ってから再度お試しください。')
        .setTimestamp();

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else if (!interaction.replied) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyError) {
      console.error('Error sending error reply:', replyError);
    }
  }
}

/**
 * 期限切れの一時VCを削除
 */
export async function cleanupExpiredTempVCs(client: Client): Promise<void> {
  const database = new Database();
  
  try {
    const expiredVCs = await database.getExpiredTempVCs();
    
    for (const vcInfo of expiredVCs) {
      try {
        const channel = client.channels.cache.get(vcInfo.channel_id) as VoiceChannel;
        
        if (channel) {
          console.log(`[TEMP VC CLEANUP] Deleting expired VC: ${channel.name}`);
          await channel.delete('12時間経過による自動削除');
        }
        
        // データベースから削除
        await database.removeTempVC(vcInfo.channel_id);
        
      } catch (error) {
        console.error(`Error deleting expired temp VC ${vcInfo.channel_id}:`, error);
        // チャンネルが既に削除されている場合は、データベースからのみ削除
        await database.removeTempVC(vcInfo.channel_id);
      }
    }
    
    if (expiredVCs.length > 0) {
      console.log(`[TEMP VC CLEANUP] Cleaned up ${expiredVCs.length} expired VCs`);
    }
    
  } catch (error) {
    console.error('Error in cleanup expired temp VCs:', error);
  }
}

/**
 * 一時VC削除（手動）
 */
export async function deleteTempVC(channelId: string, client: Client): Promise<boolean> {
  const database = new Database();
  
  try {
    const vcInfo = await database.getTempVC(channelId);
    if (!vcInfo) {
      return false;
    }
    
    const channel = client.channels.cache.get(channelId) as VoiceChannel;
    if (channel) {
      await channel.delete('手動削除');
    }
    
    await database.removeTempVC(channelId);
    console.log(`[TEMP VC] Manually deleted: ${vcInfo.channel_name}`);
    
    return true;
  } catch (error) {
    console.error('Error deleting temp VC:', error);
    return false;
  }
}

/**
 * 一時VC作成パネルを作成
 */
export function createTempVCPanel() {
  const panelEmbed = new EmbedBuilder()
    .setColor('#7c3aed')
    .setTitle('🔒 プライベート一時VC作成パネル')
    .setDescription('権限のある人以外からは見えない、プライベートな一時VCを作成できます。')
    .addFields(
      { name: '🔐 プライバシー', value: '権限のある人以外は見えません', inline: true },
      { name: '👥 最大人数', value: '2人まで（MusicBot参加時は自動で3人に拡張）', inline: true },
      { name: '🤖 MusicBot対応', value: '自動で3人枠に拡張', inline: true },
      { name: '⏰ 料金プラン', value: '```📅 6時間  →  5,000 Ru\n📅 12時間 → 10,000 Ru\n📅 24時間 → 30,000 Ru```', inline: false },
      { name: '🎯 用途例', value: '• プライベートな会議・相談\n• 作業用の限定空間\n• MusicBotでの音楽鑑賞\n• 少人数でのディスカッション', inline: false }
    )
    .setFooter({ text: '💰 料金は作成時に自動で引き落とされます' })
    .setTimestamp();

  const panelButton = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('create_temp_vc')
        .setLabel('プライベートVC作成')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔒')
    );

  console.log('[TEMP VC PANEL] Panel created with button customId: create_temp_vc');
  return { embeds: [panelEmbed], components: [panelButton] };
}

/**
 * 指定されたチャンネルにパネルが既に存在するかチェック
 */
export async function hasExistingTempVCPanel(channel: TextChannel | ThreadChannel): Promise<boolean> {
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    
    return messages.some(message => {
      if (!message.author.bot) return false;
      if (!message.embeds.length) return false;
      
      const embed = message.embeds[0];
      return embed.title?.includes('一時VC作成パネル');
    });
  } catch (error) {
    console.error('Error checking existing temp VC panel:', error);
    return false;
  }
}

/**
 * 起動時に一時VCパネルを自動送信
 */
export async function initializeTempVCPanel(client: Client): Promise<void> {
  try {
    console.log('Initializing Temp VC panel...');
    
    // チャンネルを取得
    const channel = await client.channels.fetch(TEMP_VC_PANEL_CHANNEL_ID);
    
    if (!channel) {
      console.warn(`Temp VC panel channel not found: ${TEMP_VC_PANEL_CHANNEL_ID}`);
      return;
    }

    // テキストチャンネルまたはスレッドかチェック
    if (!('send' in channel)) {
      console.warn(`Channel ${TEMP_VC_PANEL_CHANNEL_ID} cannot send messages`);
      return;
    }

    // 古いパネルを削除
    await deleteOldTempVCPanels(channel as any);
    
    // 新しいパネルを送信
    const panelData = createTempVCPanel();
    await channel.send(panelData);
    
    console.log(`Temp VC panel sent to thread: ${TEMP_VC_PANEL_CHANNEL_ID}`);
    
  } catch (error) {
    console.error('Error initializing Temp VC panel:', error);
  }
}

/**
 * 古い一時VCパネルを削除
 */
async function deleteOldTempVCPanels(channel: TextChannel | ThreadChannel): Promise<void> {
  try {
    console.log('Deleting old temp VC panels...');
    const messages = await channel.messages.fetch({ limit: 50 });
    
    for (const message of messages.values()) {
      if (!message.author.bot) continue;
      if (!message.embeds.length) continue;
      
      const embed = message.embeds[0];
      if (embed.title?.includes('一時VC作成パネル')) {
        console.log(`Deleting old temp VC panel message: ${message.id}`);
        await message.delete();
      }
    }
    console.log('Old temp VC panels deleted');
  } catch (error) {
    console.error('Error deleting old temp VC panels:', error);
  }
}

/**
 * パネルを手動で再送信（管理者用）
 */
export async function resendTempVCPanel(client: Client): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(TEMP_VC_PANEL_CHANNEL_ID);
    
    if (!channel || !('send' in channel)) {
      return false;
    }

    // 古いパネルを削除
    await deleteOldTempVCPanels(channel as any);
    
    // 新しいパネルを送信
    const panelData = createTempVCPanel();
    await channel.send(panelData);
    
    return true;
  } catch (error) {
    console.error('Error resending Temp VC panel:', error);
    return false;
  }
}

/**
 * VC設定パネルを作成
 */
export function createVCSettingsPanel(channelName: string, currentLimit: number): any {
  const settingsEmbed = new EmbedBuilder()
    .setColor('#00d4aa')
    .setTitle('🎛️ VC設定パネル')
    .setDescription(`**${channelName}** の設定を変更できます`)
    .addFields(
      { name: '👥 現在の人数制限', value: `${currentLimit}人`, inline: true },
      { name: '🔧 設定可能項目', value: '人数制限の変更', inline: true },
      { name: '⚠️ 注意', value: '作成者のみ設定可能', inline: true }
    )
    .setFooter({ text: '設定を変更するには下のボタンを使用してください' })
    .setTimestamp();

  const settingsButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('vc_limit_2')
        .setLabel('2人')
        .setStyle(currentLimit === 2 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId('vc_limit_3')
        .setLabel('3人')
        .setStyle(currentLimit === 3 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId('vc_limit_5')
        .setLabel('5人')
        .setStyle(currentLimit === 5 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId('vc_limit_10')
        .setLabel('10人')
        .setStyle(currentLimit === 10 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId('vc_limit_unlimited')
        .setLabel('無制限')
        .setStyle(currentLimit === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('♾️')
    );

  return { embeds: [settingsEmbed], components: [settingsButtons] };
}

/**
 * VC人数制限を変更
 */
export async function changeVCLimit(interaction: any, newLimit: number): Promise<void> {
  try {
    const channel = interaction.channel as VoiceChannel;
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await interaction.reply({
        content: '❌ この機能はボイスチャンネルでのみ使用できます。',
        ephemeral: true
      });
      return;
    }

    // データベースから一時VCかどうかと作成者をチェック
    const database = new Database();
    const tempVC = await database.getTempVC(channel.id);
    
    if (!tempVC) {
      await interaction.reply({
        content: '❌ この機能は一時VCでのみ使用できます。',
        ephemeral: true
      });
      return;
    }

    // 作成者かどうかをチェック
    if (tempVC.creator_id !== interaction.user.id) {
      await interaction.reply({
        content: '❌ VC設定は作成者のみ変更できます。',
        ephemeral: true
      });
      return;
    }

    // 人数制限を変更
    await channel.setUserLimit(newLimit);
    
    const limitText = newLimit === 0 ? '無制限' : `${newLimit}人`;
    
    // 設定パネルを更新
    const updatedPanel = createVCSettingsPanel(channel.name, newLimit);
    await interaction.update(updatedPanel);

    // 変更ログ
    console.log(`[VC SETTINGS] ${interaction.user.tag} changed limit of ${channel.name} to ${limitText}`);

  } catch (error) {
    console.error('Error changing VC limit:', error);
    await interaction.reply({
      content: '❌ 設定変更中にエラーが発生しました。',
      ephemeral: true
    });
  }
}