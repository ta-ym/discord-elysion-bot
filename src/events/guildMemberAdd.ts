import { Events, GuildMember, EmbedBuilder } from 'discord.js';
import { Event } from '../types';
import { globalDatabase } from '../index';
import { getNewMemberConfig } from '../config/newMemberConfig';

const guildMemberAddEvent: Event = {
  name: Events.GuildMemberAdd,
  execute: async (member: GuildMember) => {
    try {
      const config = getNewMemberConfig();
      
      // Botユーザーは除外
      if (member.user.bot) {
        console.log(`[MEMBER ADD] Bot user ${member.user.tag} joined - skipping currency setup`);
        return;
      }

      console.log(`[MEMBER ADD] New member joined: ${member.user.tag} (${member.user.id})`);
      
      const database = globalDatabase;
      
      // 既存ユーザーかチェック
      let user = await database.getUser(member.user.id);
      
      if (user) {
        console.log(`[MEMBER ADD] User ${member.user.tag} already exists with ${user.balance}Ru`);
        
        // 既存ユーザーでも参加通知は送信（設定による）
        if (config.sendWelcomeMessage) {
          await sendWelcomeMessage(member, user.balance, false, config);
        }
        return;
      }

      // 新規ユーザー作成（設定された初期残高）
      console.log(`[MEMBER ADD] Creating new user ${member.user.tag} with ${config.initialBalance}Ru`);
      user = await database.createUser(member.user.id);
      
      // 初期残高が10,000Ru以外の場合は残高を更新
      if (config.initialBalance !== 10000) {
        await database.updateUserBalance(member.user.id, config.initialBalance);
        user.balance = config.initialBalance;
      }
      
      // 初期残高付与の取引履歴を記録
      await database.addTransaction(
        null, // システムからの付与
        member.user.id,
        config.initialBalance,
        'admin_give',
        '新規参加ボーナス'
      );
      
      console.log(`[MEMBER ADD] Successfully created user ${member.user.tag} with ${user.balance}Ru`);
      
      // 歓迎メッセージ送信（設定による）
      if (config.sendWelcomeMessage) {
        await sendWelcomeMessage(member, user.balance, true, config);
      }
      
      // 管理者ログにも記録（設定による）
      if (config.logChannelId) {
        await logNewMemberCurrency(member, user.balance, true, config);
      }
      
    } catch (error) {
      console.error(`[MEMBER ADD] Error processing new member ${member.user.tag}:`, error);
    }
  }
};

/**
 * 新規参加者に歓迎メッセージを送信
 */
async function sendWelcomeMessage(member: GuildMember, balance: number, isNewUser: boolean, config: any): Promise<void> {
  try {
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle(config.welcomeTitle || '🎉 サーバーへようこそ！')
      .setDescription(
        isNewUser 
          ? `${member.user.displayName}さん、サーバーへの参加ありがとうございます！\n\n` +
            `💰 **初回参加ボーナス**: **${balance.toLocaleString()}Ru** を付与しました！\n` +
            `\`/balance\` コマンドで残高を確認できます。`
          : `${member.user.displayName}さん、おかえりなさい！\n\n` +
            `💰 **現在の残高**: **${balance.toLocaleString()}Ru**\n` +
            `\`/balance\` コマンドで詳細を確認できます。`
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();
      
    // アイコンがある場合のみフッターにアイコンを設定
    const guildIcon = member.guild.iconURL();
    if (guildIcon) {
      embed.setFooter({ 
        text: isNewUser ? '初回参加ボーナス' : 'おかえりなさい',
        iconURL: guildIcon 
      });
    } else {
      embed.setFooter({ 
        text: isNewUser ? '初回参加ボーナス' : 'おかえりなさい'
      });
    }

    if (isNewUser) {
      embed.addFields(
        { name: '💡 通貨システム', value: '• `/balance` - 残高確認\n• `/transfer` - 送金\n• `/history` - 取引履歴', inline: true },
        { name: '🎯 活用方法', value: '• 一時VC作成料金\n• イベント参加\n• 各種サービス', inline: true }
      );
    }

    // DMで送信を試行
    try {
      await member.send({ embeds: [embed] });
      console.log(`[MEMBER ADD] Welcome message sent via DM to ${member.user.tag}`);
    } catch (dmError) {
      console.log(`[MEMBER ADD] Could not send DM to ${member.user.tag}, trying system channel`);
      
      // DMが送信できない場合、システムチャンネルまたは一般チャンネルに送信
      const systemChannel = member.guild.systemChannel;
      if (systemChannel) {
        await systemChannel.send({ 
          content: `${member.toString()}`, // メンション
          embeds: [embed] 
        });
        console.log(`[MEMBER ADD] Welcome message sent to system channel for ${member.user.tag}`);
      }
    }
  } catch (error) {
    console.error(`[MEMBER ADD] Error sending welcome message to ${member.user.tag}:`, error);
  }
}

/**
 * 管理者ログに新規メンバーの通貨情報を記録
 */
async function logNewMemberCurrency(member: GuildMember, balance: number, isNewUser: boolean, config: any): Promise<void> {
  try {
    // 設定からログチャンネルIDを取得
    const logChannelId = config.logChannelId;
    
    const logChannel = member.guild.channels.cache.get(logChannelId);
    if (!logChannel || !logChannel.isTextBased()) {
      console.log(`[MEMBER ADD] Log channel not found or not text-based: ${logChannelId}`);
      return;
    }

    const logEmbed = new EmbedBuilder()
      .setColor(isNewUser ? '#00ff00' : '#ffff00')
      .setTitle(isNewUser ? '💰 新規参加者 - 通貨付与' : '🔄 復帰者 - 残高復元')
      .setDescription(`**${member.user.tag}** (${member.user.id})`)
      .addFields(
        { name: isNewUser ? '付与金額' : '現在残高', value: `${balance.toLocaleString()}Ru`, inline: true },
        { name: 'タイプ', value: isNewUser ? '新規参加ボーナス' : '既存ユーザー復帰', inline: true },
        { name: 'ステータス', value: isNewUser ? '✅ 付与完了' : '✅ 復元完了', inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: '自動通貨管理システム' });

    await logChannel.send({ embeds: [logEmbed] });
    console.log(`[MEMBER ADD] Currency log sent for ${member.user.tag}`);
  } catch (error) {
    console.error(`[MEMBER ADD] Error sending currency log for ${member.user.tag}:`, error);
  }
}

export default guildMemberAddEvent;