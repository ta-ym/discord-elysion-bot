import { Client, EmbedBuilder, TextChannel } from 'discord.js';

// Ruログチャンネル（プライベートVC作成・管理者操作用）
const RU_LOG_CHANNEL_ID = '1434825382795935795';

// 支払いログチャンネル（ユーザー間送金用）
const PAYMENT_LOG_CHANNEL_ID = '1431735461193191555';

/**
 * Ru取引ログをチャンネルに送信
 */
export async function sendRuTransactionLog(
  client: Client,
  userId: string,
  username: string,
  amount: number,
  type: 'income' | 'expense',
  description: string,
  balance: number
): Promise<void> {
  try {
    const channel = await client.channels.fetch(RU_LOG_CHANNEL_ID) as TextChannel;
    if (!channel) {
      console.error(`[RU LOG] Channel ${RU_LOG_CHANNEL_ID} not found`);
      return;
    }

    const isPositive = type === 'income';
    const embed = new EmbedBuilder()
      .setColor(isPositive ? '#00ff00' : '#ff6b6b')
      .setTitle(`💰 Ru取引ログ`)
      .addFields(
        { name: '👤 ユーザー', value: `<@${userId}> (${username})`, inline: true },
        { name: '💱 取引タイプ', value: type === 'income' ? '📈 収入' : '📉 支出', inline: true },
        { name: '💰 金額', value: `${isPositive ? '+' : '-'}${Math.abs(amount).toLocaleString()} Ru`, inline: true },
        { name: '📝 詳細', value: description, inline: false },
        { name: '💳 残高', value: `${balance.toLocaleString()} Ru`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Ru取引システム' });

    await channel.send({ embeds: [embed] });
    console.log(`[RU LOG] Transaction logged for ${username}: ${amount} Ru`);

  } catch (error) {
    console.error('[RU LOG] Error sending transaction log:', error);
  }
}

/**
 * VC作成料金ログ
 */
export async function sendVCCreationLog(
  client: Client,
  userId: string,
  username: string,
  vcName: string,
  cost: number,
  duration: string,
  balance: number
): Promise<void> {
  await sendRuTransactionLog(
    client,
    userId,
    username,
    -cost,
    'expense',
    `🔒 プライベートVC作成: ${vcName} (${duration})`,
    balance
  );
}

/**
 * 管理者による残高付与ログ
 */
export async function sendAdminGiveLog(
  client: Client,
  adminId: string,
  adminUsername: string,
  targetId: string,
  targetUsername: string,
  amount: number,
  targetBalance: number,
  reason?: string
): Promise<void> {
  try {
    const channel = await client.channels.fetch(RU_LOG_CHANNEL_ID) as TextChannel;
    if (!channel) {
      console.error(`[RU LOG] Channel ${RU_LOG_CHANNEL_ID} not found`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle(`🛠️ 管理者操作ログ`)
      .addFields(
        { name: '👮 管理者', value: `<@${adminId}> (${adminUsername})`, inline: true },
        { name: '🎯 対象ユーザー', value: `<@${targetId}> (${targetUsername})`, inline: true },
        { name: '💰 付与金額', value: `+${amount.toLocaleString()} Ru`, inline: true },
        { name: '📝 理由', value: reason || '理由なし', inline: false },
        { name: '💳 対象者残高', value: `${targetBalance.toLocaleString()} Ru`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: '管理者操作ログ' });

    await channel.send({ embeds: [embed] });
    console.log(`[RU LOG] Admin operation logged: ${adminUsername} gave ${amount} Ru to ${targetUsername}`);

  } catch (error) {
    console.error('[RU LOG] Error sending admin log:', error);
  }
}

/**
 * ユーザー間送金ログ
 */
export async function sendTransferLog(
  client: Client,
  fromId: string,
  fromUsername: string,
  toId: string,
  toUsername: string,
  amount: number,
  fromBalance: number,
  toBalance: number,
  reason?: string
): Promise<void> {
  try {
    const channel = await client.channels.fetch(PAYMENT_LOG_CHANNEL_ID) as TextChannel;
    if (!channel) {
      console.error(`[PAYMENT LOG] Channel ${PAYMENT_LOG_CHANNEL_ID} not found`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#4f46e5')
      .setTitle(`💸 ユーザー間送金ログ`)
      .addFields(
        { name: '📤 送金者', value: `<@${fromId}> (${fromUsername})`, inline: true },
        { name: '📥 受取者', value: `<@${toId}> (${toUsername})`, inline: true },
        { name: '💰 送金金額', value: `${amount.toLocaleString()} Ru`, inline: true },
        { name: '📝 メッセージ', value: reason || 'メッセージなし', inline: false },
        { name: '💳 送金者残高', value: `${fromBalance.toLocaleString()} Ru`, inline: true },
        { name: '💳 受取者残高', value: `${toBalance.toLocaleString()} Ru`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'ユーザー間送金システム' });

    await channel.send({ embeds: [embed] });
    console.log(`[PAYMENT LOG] Transfer logged: ${fromUsername} sent ${amount} Ru to ${toUsername}`);

  } catch (error) {
    console.error('[PAYMENT LOG] Error sending transfer log:', error);
  }
}