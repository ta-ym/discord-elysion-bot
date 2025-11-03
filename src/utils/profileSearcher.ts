import { Client, TextChannel, EmbedBuilder, Message } from 'discord.js';

// 自己紹介チャンネルのID一覧
const INTRODUCTION_CHANNEL_IDS = [
  '1424806592158634005',
  '1424807243420930190', 
  '1426546319123546174',
  '1428828181032468480',
  '1425034850573750313',
  '1425114905295454228',
  '1425148894354079784',
  '1425148949303660544'
];

export class ProfileSearcher {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * 指定されたユーザーの自己紹介メッセージを検索する
   * @param userId ユーザーID
   * @returns 見つかった場合はメッセージオブジェクト、見つからない場合はnull
   */
  async findUserProfile(userId: string): Promise<Message | null> {
    try {
      for (const channelId of INTRODUCTION_CHANNEL_IDS) {
        const channel = await this.client.channels.fetch(channelId) as TextChannel;
        if (!channel || channel.type !== 0) continue; // テキストチャンネルでない場合はスキップ

        // チャンネル内のメッセージを検索（最大100件）
        const messages = await channel.messages.fetch({ limit: 100 });
        
        // 指定されたユーザーのメッセージを検索
        const userMessage = messages.find(message => message.author.id === userId);
        
        if (userMessage) {
          console.log(`[PROFILE] Found profile for user ${userId} in channel ${channelId}`);
          return userMessage;
        }
      }

      console.log(`[PROFILE] No profile found for user ${userId}`);
      return null;
    } catch (error) {
      console.error(`[PROFILE] Error searching for user profile ${userId}:`, error);
      return null;
    }
  }

  /**
   * プロフィール情報を含むエンベッドを作成する
   * @param message プロフィールメッセージ
   * @returns エンベッドオブジェクト
   */
  createProfileEmbed(message: Message): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('📋 プロフィール')
      .setDescription(message.content || '自己紹介メッセージ')
      .setColor(0x00AE86)
      .setAuthor({
        name: message.author.displayName || message.author.username,
        iconURL: message.author.displayAvatarURL()
      })
      .setTimestamp(message.createdAt)
      .addFields({
        name: '🔗 元のメッセージ',
        value: `[こちらをクリック](${message.url})`,
        inline: false
      });

    // 添付ファイルがある場合は最初の画像を表示
    if (message.attachments.size > 0) {
      const attachment = message.attachments.first();
      if (attachment && attachment.contentType?.startsWith('image/')) {
        embed.setImage(attachment.url);
      }
    }

    return embed;
  }

  /**
   * VCチャンネルにプロフィールを投稿する
   * @param vcChannel ボイスチャンネル
   * @param userId ユーザーID
   */
  async postProfileToVC(vcChannel: any, userId: string): Promise<void> {
    try {
      // ユーザーのプロフィールを検索
      const profileMessage = await this.findUserProfile(userId);
      
      if (!profileMessage) {
        console.log(`[PROFILE] No profile found for user ${userId}, skipping post`);
        return;
      }

      // VCに対応するテキストチャンネルを取得
      const textChannel = vcChannel.guild.channels.cache.find((channel: any) => 
        channel.type === 0 && // テキストチャンネル
        channel.name === vcChannel.name && // 同じ名前
        channel.parentId === vcChannel.parentId // 同じカテゴリ
      );

      if (!textChannel) {
        console.log(`[PROFILE] No text channel found for VC ${vcChannel.name}`);
        return;
      }

      // プロフィールエンベッドを作成
      const embed = this.createProfileEmbed(profileMessage);
      
      // テキストチャンネルに投稿
      await textChannel.send({ embeds: [embed] });
      console.log(`[PROFILE] Posted profile for user ${userId} to ${textChannel.name}`);

    } catch (error) {
      console.error(`[PROFILE] Error posting profile for user ${userId}:`, error);
    }
  }
}