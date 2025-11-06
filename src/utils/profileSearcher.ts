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

// 特定のVCに対するテキストチャンネルマッピング
const VC_TO_TEXT_CHANNEL_MAPPING: { [vcChannelId: string]: string } = {
  // 回廊のVCID（VC内チャット機能を使用）
  '1425134212981194804': '1425134212981194804', // 回廊1 - VC内チャット
  '1425134360545198213': '1425134360545198213', // 回廊2 - VC内チャット
  '1425354770322821201': '1425354770322821201', // 回廊3 - VC内チャット
  '1434529423746662540': '1434529423746662540', // 回廊4 - VC内チャット
  '1434881517779419277': '1434881517779419277', // 回廊5 - VC内チャット
};

// プロフィール検索を有効にするカテゴリID
const ALLOWED_CATEGORY_ID = '1424762646279753860'; // 天界カテゴリ

// プロフィール検索を有効にする特定のVCリスト（回廊1～5のみ）
const ALLOWED_VC_IDS = [
  '1425134212981194804', // 回廊1
  '1425134360545198213', // 回廊2
  '1425354770322821201', // 回廊3
  '1434529423746662540', // 回廊4
  '1434881517779419277', // 回廊5
];

// プロフィール投稿履歴を記録するMap（重複防止用）
// キー: "チャンネルID_ユーザーID", 値: 最後の投稿時刻
const PROFILE_POST_HISTORY = new Map<string, number>();

// 重複投稿を防ぐ間隔（ミリ秒）- 10分間
const DUPLICATE_PREVENTION_INTERVAL = 10 * 60 * 1000;

export class ProfileSearcher {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
    
    // 定期的に古い履歴をクリーンアップ（1時間ごと）
    setInterval(() => {
      this.cleanupOldHistory();
    }, 60 * 60 * 1000);
  }

  /**
   * 古い投稿履歴をクリーンアップする
   */
  private cleanupOldHistory(): void {
    const currentTime = Date.now();
    let cleanedCount = 0;

    for (const [key, timestamp] of PROFILE_POST_HISTORY.entries()) {
      if (currentTime - timestamp > DUPLICATE_PREVENTION_INTERVAL * 2) {
        PROFILE_POST_HISTORY.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[PROFILE] Cleaned up ${cleanedCount} old profile post history entries`);
    }
  }

  /**
   * 指定されたユーザーの自己紹介メッセージを検索する
   * @param userId ユーザーID
   * @returns 見つかった場合はメッセージオブジェクト、見つからない場合はnull
   */
  async findUserProfile(userId: string): Promise<Message | null> {
    try {
      console.log(`[PROFILE] Searching for profile of user ${userId}`);
      
      for (const channelId of INTRODUCTION_CHANNEL_IDS) {
        console.log(`[PROFILE] Checking channel ${channelId}`);
        
        try {
          const channel = await this.client.channels.fetch(channelId) as TextChannel;
          if (!channel || channel.type !== 0) {
            console.log(`[PROFILE] Channel ${channelId} is not a text channel or not accessible`);
            continue;
          }

          // チャンネル内のメッセージを検索（最大500件、複数回に分けて取得）
          let messages = await channel.messages.fetch({ limit: 100 });
          
          // 指定されたユーザーのメッセージを検索
          let userMessage = messages.find(message => message.author.id === userId);
          
          if (userMessage) {
            console.log(`[PROFILE] Found profile for user ${userId} in channel ${channelId}`);
            return userMessage;
          }

          // さらに古いメッセージも検索（最大500件まで）
          for (let i = 0; i < 4; i++) {
            if (messages.size === 0) break;
            
            const lastMessageId = messages.last()?.id;
            if (!lastMessageId) break;
            
            const olderMessages = await channel.messages.fetch({ 
              limit: 100, 
              before: lastMessageId 
            });
            
            if (olderMessages.size === 0) break;
            
            userMessage = olderMessages.find(message => message.author.id === userId);
            if (userMessage) {
              console.log(`[PROFILE] Found profile for user ${userId} in channel ${channelId} (older messages)`);
              return userMessage;
            }
            
            messages = olderMessages;
          }
          
        } catch (channelError) {
          console.error(`[PROFILE] Error accessing channel ${channelId}:`, channelError);
          continue;
        }
      }

      console.log(`[PROFILE] No profile found for user ${userId} in any introduction channel`);
      return null;
    } catch (error) {
      console.error(`[PROFILE] Error searching for user profile ${userId}:`, error);
      return null;
    }
  }

  /**
   * プロフィール情報を含むエンベッドを作成する
   * @param message プロフィールメッセージ
   * @param userId ユーザーID（削除時の特定用）
   * @returns エンベッドオブジェクト
   */
  createProfileEmbed(message: Message, userId?: string): EmbedBuilder {
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

    // ユーザーIDを隠しフィールドとして追加（削除時の特定用）
    if (userId) {
      embed.addFields({
        name: '\u200b', // 不可視文字
        value: `<!-- USER_ID:${userId} -->`,
        inline: false
      });
    }

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
   * 指定されたチャンネルで特定ユーザーの古いプロフィール投稿を削除する
   * @param textChannel テキストチャンネル
   * @param userId ユーザーID
   * @returns 削除したメッセージ数
   */
  private async deleteOldProfilePosts(textChannel: any, userId: string): Promise<number> {
    try {
      console.log(`[PROFILE] Searching for old profile posts by user ${userId} in channel ${textChannel.name}`);
      
      let deletedCount = 0;
      let messages = await textChannel.messages.fetch({ limit: 100 });
      
      // 最大500件のメッセージを確認（5回に分けて取得）
      for (let i = 0; i < 5; i++) {
        if (messages.size === 0) break;
        
        // Botによる投稿でプロフィール関連のエンベッドを持つメッセージを検索
        const oldProfilePosts = messages.filter((message: Message) => {
          // Botによる投稿かチェック
          if (message.author.id !== this.client.user?.id) return false;
          
          // エンベッドを持つかチェック
          if (message.embeds.length === 0) return false;
          
          // プロフィール関連のエンベッドかチェック
          const embed = message.embeds[0];
          if (!embed.title?.includes('プロフィール') && !embed.title?.includes('📋')) return false;
          
          // エンベッドの説明文またはフィールドにユーザーIDが含まれているかチェック
          const embedContent = embed.description || '';
          const fieldContent = embed.fields?.map(f => f.value).join(' ') || '';
          const allContent = embedContent + ' ' + fieldContent;
          
          // ユーザーIDまたはメンション形式での確認（隠しフィールドも含む）
          return allContent.includes(userId) || 
                 allContent.includes(`<@${userId}>`) || 
                 allContent.includes(`USER_ID:${userId}`);
        });
        
        // 見つかった古い投稿を削除
        for (const message of oldProfilePosts.values()) {
          try {
            await message.delete();
            deletedCount++;
            console.log(`[PROFILE] Deleted old profile post (ID: ${message.id}) for user ${userId}`);
          } catch (deleteError) {
            console.error(`[PROFILE] Failed to delete old profile post (ID: ${message.id}):`, deleteError);
          }
        }
        
        // さらに古いメッセージを取得
        if (i < 4) {
          const lastMessageId = messages.last()?.id;
          if (!lastMessageId) break;
          
          const olderMessages = await textChannel.messages.fetch({ 
            limit: 100, 
            before: lastMessageId 
          });
          
          if (olderMessages.size === 0) break;
          messages = olderMessages;
        }
      }
      
      if (deletedCount > 0) {
        console.log(`[PROFILE] Deleted ${deletedCount} old profile posts for user ${userId}`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error(`[PROFILE] Error deleting old profile posts for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * VCチャンネルにプロフィールを投稿する
   * @param vcChannel ボイスチャンネル
   * @param userId ユーザーID
   */
  async postProfileToVC(vcChannel: any, userId: string): Promise<void> {
    try {
      // 回廊1～5以外では動作しない
      if (!ALLOWED_VC_IDS.includes(vcChannel.id)) {
        console.log(`[PROFILE] Skipping profile post - VC ${vcChannel.name} (ID: ${vcChannel.id}) is not in allowed VC list`);
        return;
      }

      // 念のため天界カテゴリかもチェック
      if (vcChannel.parentId !== ALLOWED_CATEGORY_ID) {
        console.log(`[PROFILE] Skipping profile post - VC ${vcChannel.name} is not in allowed category (${vcChannel.parentId})`);
        return;
      }

      // 重複投稿チェック
      const historyKey = `${vcChannel.id}_${userId}`;
      const currentTime = Date.now();
      const lastPostTime = PROFILE_POST_HISTORY.get(historyKey);

      if (lastPostTime && (currentTime - lastPostTime) < DUPLICATE_PREVENTION_INTERVAL) {
        const remainingTime = Math.ceil((DUPLICATE_PREVENTION_INTERVAL - (currentTime - lastPostTime)) / 1000 / 60);
        console.log(`[PROFILE] Skipping duplicate post for user ${userId} in ${vcChannel.name} (last posted ${remainingTime} minutes ago)`);
        return;
      }

      // ユーザーのプロフィールを検索
      const profileMessage = await this.findUserProfile(userId);
      
      if (!profileMessage) {
        console.log(`[PROFILE] No profile found for user ${userId}, skipping post`);
        return;
      }

      console.log(`[PROFILE] Looking for text channel for VC: ${vcChannel.name} (ID: ${vcChannel.id})`);

      // VCに対応するテキストチャンネルを取得
      let textChannel = null;

      // 0. 特定のVCに対する専用マッピングをチェック
      if (VC_TO_TEXT_CHANNEL_MAPPING[vcChannel.id]) {
        const mappedChannelId = VC_TO_TEXT_CHANNEL_MAPPING[vcChannel.id];
        
        // VC内チャットの場合、VCと同じIDなのでVCオブジェクトを直接使用
        if (mappedChannelId === vcChannel.id) {
          textChannel = vcChannel;
          console.log(`[PROFILE] Using VC's integrated text chat: ${textChannel.name} (ID: ${textChannel.id})`);
        } else {
          try {
            textChannel = await vcChannel.guild.channels.fetch(mappedChannelId);
            if (textChannel && textChannel.type === 0) {
              console.log(`[PROFILE] Found mapped text channel: ${textChannel.name} (ID: ${textChannel.id})`);
            } else {
              console.log(`[PROFILE] Mapped channel ${mappedChannelId} is not a text channel or not found`);
              textChannel = null;
            }
          } catch (error) {
            console.log(`[PROFILE] Failed to fetch mapped channel ${mappedChannelId}:`, error);
            textChannel = null;
          }
        }
      }

      // 1. VCと完全に同じ名前のテキストチャンネルを探す（同じカテゴリ内）
      if (!textChannel) {
        textChannel = vcChannel.guild.channels.cache.find((channel: any) => 
          channel.type === 0 && // テキストチャンネル
          channel.name === vcChannel.name && // 同じ名前
          channel.parentId === vcChannel.parentId // 同じカテゴリ
        );

        if (textChannel) {
          console.log(`[PROFILE] Found exact match text channel: ${textChannel.name} (ID: ${textChannel.id})`);
        }
      }

      // 1.5. 特殊文字を除去して再検索
      if (!textChannel) {
        const cleanVCName = vcChannel.name.replace(/[<>]/g, '');
        textChannel = vcChannel.guild.channels.cache.find((channel: any) => 
          channel.type === 0 && // テキストチャンネル
          channel.name.replace(/[<>]/g, '') === cleanVCName && // 特殊文字を除去して比較
          channel.parentId === vcChannel.parentId // 同じカテゴリ
        );
        
        if (textChannel) {
          console.log(`[PROFILE] Found match after cleaning special chars: ${textChannel.name} (ID: ${textChannel.id})`);
        }
      }

      // 2. VCのスレッドを探す
      if (!textChannel) {
        // VCに紐づくスレッドを探す
        const threads = vcChannel.guild.channels.cache.filter((channel: any) => 
          channel.isThread() && 
          channel.name.includes(vcChannel.name)
        );
        
        if (threads.size > 0) {
          textChannel = threads.first();
          console.log(`[PROFILE] Found thread for VC: ${textChannel.name} (ID: ${textChannel.id})`);
        }
      }

      // 3. VC名に類似するテキストチャンネルを探す（同じカテゴリ内）
      if (!textChannel) {
        const vcNameLower = vcChannel.name.toLowerCase();
        textChannel = vcChannel.guild.channels.cache.find((channel: any) => 
          channel.type === 0 && // テキストチャンネル
          channel.parentId === vcChannel.parentId && // 同じカテゴリ
          (channel.name.toLowerCase().includes(vcNameLower) || vcNameLower.includes(channel.name.toLowerCase()))
        );
        
        if (textChannel) {
          console.log(`[PROFILE] Found similar name text channel: ${textChannel.name} (ID: ${textChannel.id})`);
        }
      }

      // 4. それでも見つからない場合は投稿しない（誤爆防止）
      if (!textChannel) {
        console.log(`[PROFILE] No dedicated text channel found for VC ${vcChannel.name}. Skipping to prevent posting to wrong channel.`);
        console.log(`[PROFILE] Available channels in category ${vcChannel.parentId}:`);
        const categoryChannels = vcChannel.guild.channels.cache.filter((ch: any) => ch.parentId === vcChannel.parentId);
        categoryChannels.forEach((ch: any) => {
          const typeStr = ch.type === 0 ? 'TEXT' : ch.type === 2 ? 'VOICE' : ch.type === 4 ? 'CATEGORY' : ch.type === 10 ? 'THREAD' : `TYPE_${ch.type}`;
          console.log(`  - ${typeStr}: "${ch.name}" (ID: ${ch.id})`);
        });
        
        // さらに詳細な検索を試行
        console.log(`[PROFILE] Attempting more flexible search for VC: "${vcChannel.name}"`);
        
        // VCの名前から特殊文字を除去して検索
        const cleanVCName = vcChannel.name.replace(/[<>]/g, '');
        console.log(`[PROFILE] Cleaned VC name: "${cleanVCName}"`);
        
        // より柔軟な検索
        const flexibleChannel = vcChannel.guild.channels.cache.find((channel: any) => {
          if (channel.type !== 0) return false; // テキストチャンネルのみ
          if (channel.parentId !== vcChannel.parentId) return false; // 同じカテゴリのみ
          
          const channelNameClean = channel.name.replace(/[<>]/g, '').toLowerCase();
          const vcNameClean = cleanVCName.toLowerCase();
          
          // 完全一致、部分一致、数字部分一致をチェック
          return channelNameClean === vcNameClean ||
                 channelNameClean.includes(vcNameClean) ||
                 vcNameClean.includes(channelNameClean) ||
                 // 数字部分のみでのマッチング（例: <回廊>2 → 2）
                 (vcNameClean.match(/\d+$/) && channelNameClean === vcNameClean.match(/\d+$/)?.[0]);
        });
        
        if (flexibleChannel) {
          textChannel = flexibleChannel;
          console.log(`[PROFILE] Found flexible match: "${textChannel.name}" (ID: ${textChannel.id})`);
        } else {
          // 5. 最後の手段：同じカテゴリ内で最も適切なテキストチャンネルを選択
          console.log(`[PROFILE] No flexible match found. Attempting fallback selection.`);
          
          // 雑談系チャンネルを優先
          const chatChannels = vcChannel.guild.channels.cache.filter((channel: any) => 
            channel.type === 0 && 
            channel.parentId === vcChannel.parentId &&
            (channel.name.includes('雑談') || channel.name.includes('chat') || channel.name.includes('general'))
          );
          
          if (chatChannels.size > 0) {
            textChannel = chatChannels.first();
            console.log(`[PROFILE] Found fallback chat channel: "${textChannel.name}" (ID: ${textChannel.id})`);
          } else {
            // それでもなければ、カテゴリ内の最初のテキストチャンネル
            const anyTextChannel = vcChannel.guild.channels.cache.find((channel: any) => 
              channel.type === 0 && 
              channel.parentId === vcChannel.parentId
            );
            
            if (anyTextChannel) {
              textChannel = anyTextChannel;
              console.log(`[PROFILE] Using first available text channel: "${textChannel.name}" (ID: ${textChannel.id})`);
            } else {
              console.log(`[PROFILE] No text channels found in category. Giving up.`);
              return;
            }
          }
        }
      }

      // プロフィールエンベッドを作成
      const embed = this.createProfileEmbed(profileMessage, userId);
      
      // 参加者情報を追加
      embed.addFields({
        name: '🎤 参加したVC',
        value: vcChannel.name,
        inline: true
      });
      
      // 古いプロフィール投稿を削除
      const deletedCount = await this.deleteOldProfilePosts(textChannel, userId);
      if (deletedCount > 0) {
        console.log(`[PROFILE] Removed ${deletedCount} old profile posts before posting new one`);
      }
      
      // テキストチャンネルに投稿
      await textChannel.send({ embeds: [embed] });
      console.log(`[PROFILE] Posted profile for user ${userId} to ${textChannel.name} (ID: ${textChannel.id})`);

      // 投稿履歴を記録（重複防止用）
      PROFILE_POST_HISTORY.set(historyKey, currentTime);

    } catch (error) {
      console.error(`[PROFILE] Error posting profile for user ${userId}:`, error);
    }
  }
}