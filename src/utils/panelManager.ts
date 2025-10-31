import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, ThreadChannel, ChannelType } from 'discord.js';

// 秘の扉スレッドID
const SECRET_DOOR_THREAD_ID = '1433217562195525725';

/**
 * シークレットVC作成パネルを作成
 */
export function createSecretVCPanel() {
  const panelEmbed = new EmbedBuilder()
    .setColor('#9b59b6')
    .setTitle('🚪 秘の扉 - シークレットVC作成パネル')
    .setDescription('プライベートな通話空間を作成できます。\n下のボタンをクリックしてシークレットVCを作成しましょう。')
    .addFields(
      { name: '💰 作成費用', value: '6h: 5,000 Ru | 12h: 10,000 Ru | 24h: 30,000 Ru', inline: false },
      { name: '⏰ 時間制限', value: '6時間/12時間/24時間', inline: true },
      { name: '👥 パートナー', value: '一緒に使う相手を指定可能', inline: true }
    )
    .addFields(
      { name: '🎯 機能', value: '• 完全プライベート空間\n• パートナー招待システム\n• 自動時間管理\n• チャンネル名変更可能', inline: false }
    )
    .setFooter({ text: '指定した時間経過後、自動的に削除されます' })
    .setTimestamp();

  const panelButton = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('create_secret_vc')
        .setLabel('シークレットVC作成')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🚪')
    );

  return { embeds: [panelEmbed], components: [panelButton] };
}

/**
 * 指定されたスレッドにパネルが既に存在するかチェック
 */
export async function hasExistingPanel(thread: TextChannel | ThreadChannel): Promise<boolean> {
  try {
    const messages = await thread.messages.fetch({ limit: 50 });
    
    return messages.some(message => {
      if (!message.author.bot) return false;
      if (!message.embeds.length) return false;
      
      const embed = message.embeds[0];
      return embed.title?.includes('秘の扉') && embed.title?.includes('シークレットVC作成パネル');
    });
  } catch (error) {
    console.error('Error checking existing panel:', error);
    return false;
  }
}

/**
 * 起動時にシークレットVCパネルを自動送信
 */
export async function initializeSecretVCPanel(client: Client): Promise<void> {
  try {
    console.log('Initializing Secret VC panel...');
    
    // スレッドを取得
    const channel = await client.channels.fetch(SECRET_DOOR_THREAD_ID);
    
    if (!channel) {
      console.warn(`Secret door thread not found: ${SECRET_DOOR_THREAD_ID}`);
      return;
    }

    if (channel.type !== ChannelType.PublicThread && channel.type !== ChannelType.PrivateThread) {
      console.warn(`Channel ${SECRET_DOOR_THREAD_ID} is not a thread`);
      return;
    }

    const thread = channel as ThreadChannel;
    
    // 古いパネルを削除
    await deleteOldPanels(thread);
    
    // 新しいパネルを送信
    const panelData = createSecretVCPanel();
    await thread.send(panelData);
    
    console.log(`Secret VC panel sent to thread: ${SECRET_DOOR_THREAD_ID}`);
    
  } catch (error) {
    console.error('Error initializing Secret VC panel:', error);
  }
}

/**
 * 古いパネルを削除
 */
async function deleteOldPanels(thread: ThreadChannel): Promise<void> {
  try {
    console.log('Deleting old panels...');
    const messages = await thread.messages.fetch({ limit: 50 });
    
    for (const message of messages.values()) {
      if (!message.author.bot) continue;
      if (!message.embeds.length) continue;
      
      const embed = message.embeds[0];
      if (embed.title?.includes('秘の扉') && embed.title?.includes('シークレットVC作成パネル')) {
        console.log(`Deleting old panel message: ${message.id}`);
        await message.delete();
      }
    }
    console.log('Old panels deleted');
  } catch (error) {
    console.error('Error deleting old panels:', error);
  }
}

/**
 * パネルを手動で再送信（管理者用）
 */
export async function resendSecretVCPanel(client: Client): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(SECRET_DOOR_THREAD_ID);
    
    if (!channel || (channel.type !== ChannelType.PublicThread && channel.type !== ChannelType.PrivateThread)) {
      return false;
    }

    const thread = channel as ThreadChannel;
    
    // 古いパネルを削除
    await deleteOldPanels(thread);
    
    // 新しいパネルを送信
    const panelData = createSecretVCPanel();
    await thread.send(panelData);
    
    return true;
  } catch (error) {
    console.error('Error resending Secret VC panel:', error);
    return false;
  }
}