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
      // 天界カテゴリ以外では動作しない
      if (vcChannel.parentId !== ALLOWED_CATEGORY_ID) {
        console.log(`[PROFILE] Skipping profile post - VC ${vcChannel.name} is not in allowed category (${vcChannel.parentId})`);
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
      const embed = this.createProfileEmbed(profileMessage);
      
      // 参加者情報を追加
      embed.addFields({
        name: '🎤 参加したVC',
        value: vcChannel.name,
        inline: true
      });
      
      // テキストチャンネルに投稿
      await textChannel.send({ embeds: [embed] });
      console.log(`[PROFILE] Posted profile for user ${userId} to ${textChannel.name} (ID: ${textChannel.id})`);

    } catch (error) {
      console.error(`[PROFILE] Error posting profile for user ${userId}:`, error);
    }
  }
}