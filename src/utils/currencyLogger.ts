import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { getCurrencyLogChannelId } from '../config/channels';
import { Transaction } from '../database';

/**
 * 通貨取引ログ管理クラス
 * 全ての通貨取引をログチャンネルに自動記録
 */
export class CurrencyLogger {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * 通貨取引をログチャンネルに記録
   */
  async logTransaction(transaction: {
    fromUserId: string | null;
    toUserId: string;
    amount: number;
    type: 'transfer' | 'admin_give' | 'vc_purchase' | 'monthly_salary' | 'bulk_salary';
    description: string;
    executedBy?: string; // 実行者のID（管理者給与支払い等）
  }): Promise<void> {
    const channelId = getCurrencyLogChannelId();
    if (!channelId) {
      console.log('通貨ログチャンネルが設定されていません');
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId) as TextChannel;
      if (!channel) {
        console.error('通貨ログチャンネルが見つかりません:', channelId);
        return;
      }

      const embed = await this.createTransactionEmbed(transaction);
      await channel.send({ embeds: [embed] });
      
    } catch (error) {
      console.error('通貨ログの送信中にエラーが発生しました:', error);
    }
  }

  /**
   * 取引に応じたEmbedを作成
   */
  private async createTransactionEmbed(transaction: {
    fromUserId: string | null;
    toUserId: string;
    amount: number;
    type: 'transfer' | 'admin_give' | 'vc_purchase' | 'monthly_salary' | 'bulk_salary';
    description: string;
    executedBy?: string;
  }): Promise<EmbedBuilder> {
    const { fromUserId, toUserId, amount, type, description, executedBy } = transaction;

    let embed = new EmbedBuilder()
      .setTimestamp()
      .addFields(
        { name: '💰 金額', value: `${amount.toLocaleString()} Ru`, inline: true }
      );

    // 取引タイプに応じてEmbedをカスタマイズ
    switch (type) {
      case 'transfer':
        embed
          .setColor('#3498db')
          .setTitle('💸 ユーザー間送金')
          .addFields(
            { name: '送金者', value: `<@${fromUserId}>`, inline: true },
            { name: '受取者', value: `<@${toUserId}>`, inline: true },
            { name: '📝 メッセージ', value: description || 'なし', inline: false }
          );
        break;

      case 'admin_give':
        embed
          .setColor('#e74c3c')
          .setTitle('👑 管理者付与')
          .addFields(
            { name: '受取者', value: `<@${toUserId}>`, inline: true },
            { name: '実行者', value: executedBy ? `<@${executedBy}>` : '不明', inline: true },
            { name: '📝 理由', value: description, inline: false }
          );
        break;

      case 'monthly_salary':
        embed
          .setColor('#f39c12')
          .setTitle('💼 月給支給')
          .addFields(
            { name: '受給者', value: `<@${toUserId}>`, inline: true },
            { name: '支給者', value: executedBy ? `<@${executedBy}>` : '不明', inline: true },
            { name: '📝 詳細', value: description, inline: false }
          );
        break;

      case 'bulk_salary':
        embed
          .setColor('#2ecc71')
          .setTitle('💰 一括給与支給')
          .addFields(
            { name: '受給者', value: `<@${toUserId}>`, inline: true },
            { name: '実行者', value: executedBy ? `<@${executedBy}>` : '不明', inline: true },
            { name: '📝 詳細', value: description, inline: false }
          );
        break;

      default:
        embed
          .setColor('#95a5a6')
          .setTitle('💱 その他の取引')
          .addFields(
            { name: '関係者', value: fromUserId ? `<@${fromUserId}> → <@${toUserId}>` : `<@${toUserId}>`, inline: true },
            { name: '📝 詳細', value: description, inline: false }
          );
    }

    return embed;
  }

  /**
   * 複数の取引をまとめてログに記録（一括給与支給等）
   */
  async logBulkTransactions(transactions: Array<{
    fromUserId: string | null;
    toUserId: string;
    amount: number;
    type: 'transfer' | 'admin_give' | 'vc_purchase' | 'monthly_salary' | 'bulk_salary';
    description: string;
    executedBy?: string;
  }>, summaryTitle: string = '📊 一括取引実行'): Promise<void> {
    const channelId = getCurrencyLogChannelId();
    if (!channelId || transactions.length === 0) return;

    try {
      const channel = await this.client.channels.fetch(channelId) as TextChannel;
      if (!channel) return;

      // サマリーEmbedを作成
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
      const summaryEmbed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(summaryTitle)
        .addFields(
          { name: '📋 実行件数', value: `${transactions.length}件`, inline: true },
          { name: '💰 総支給額', value: `${totalAmount.toLocaleString()} Ru`, inline: true },
          { name: '⏰ 実行時刻', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setTimestamp();

      await channel.send({ embeds: [summaryEmbed] });

      // 個別の取引ログは省略し、サマリーのみ記録
      // 詳細が必要な場合は個別にlogTransactionを呼び出す

    } catch (error) {
      console.error('一括取引ログの送信中にエラーが発生しました:', error);
    }
  }

  /**
   * 過去の取引履歴をチャンネルに表示
   */
  async displayTransactionHistory(
    transactions: Transaction[], 
    title: string = '📈 取引履歴',
    limit: number = 10
  ): Promise<void> {
    const channelId = getCurrencyLogChannelId();
    if (!channelId) return;

    try {
      const channel = await this.client.channels.fetch(channelId) as TextChannel;
      if (!channel) return;

      const displayTransactions = transactions.slice(0, limit);
      
      if (displayTransactions.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#95a5a6')
          .setTitle(title)
          .setDescription('取引履歴が見つかりませんでした。')
          .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
      }

      // 取引履歴をページ分けして表示
      const embedFields = displayTransactions.map((transaction, index) => {
        const date = new Date(transaction.created_at).toLocaleDateString('ja-JP');
        const fromUser = transaction.from_user_id ? `<@${transaction.from_user_id}>` : 'システム';
        const toUser = `<@${transaction.to_user_id}>`;
        const typeEmoji = this.getTypeEmoji(transaction.type);
        
        return {
          name: `${index + 1}. ${typeEmoji} ${transaction.type}`,
          value: `${fromUser} → ${toUser}\n💰 ${transaction.amount.toLocaleString()} Ru\n📅 ${date}\n📝 ${transaction.description}`,
          inline: false
        };
      });

      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(title)
        .setDescription(`最新 ${displayTransactions.length} 件の取引を表示`)
        .addFields(embedFields)
        .setTimestamp();

      await channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('取引履歴表示中にエラーが発生しました:', error);
    }
  }

  /**
   * 取引タイプに応じた絵文字を取得
   */
  private getTypeEmoji(type: string): string {
    switch (type) {
      case 'transfer': return '💸';
      case 'admin_give': return '👑';
      case 'vc_purchase': return '🎪';
      case 'monthly_salary': return '💼';
      case 'bulk_salary': return '💰';
      default: return '💱';
    }
  }
}

/**
 * グローバルな通貨ロガーインスタンス
 * ボット全体で一つのインスタンスを共有
 */
export let currencyLogger: CurrencyLogger | null = null;

/**
 * 通貨ロガーを初期化
 */
export function initializeCurrencyLogger(client: Client): void {
  currencyLogger = new CurrencyLogger(client);
}

/**
 * 通貨ロガーインスタンスを取得
 */
export function getCurrencyLogger(): CurrencyLogger | null {
  return currencyLogger;
}