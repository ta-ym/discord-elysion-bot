import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';

const giveCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('ユーザーにRu_menを付与します（管理者専用）')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Ru_menを付与するユーザー')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('付与するRu_menの量')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('付与理由（オプション）')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction: ChatInputCommandInteraction) {
    // 管理者権限チェック
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ 
        content: '❌ この機能は管理者のみ使用できます。', 
        ephemeral: true 
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const reason = interaction.options.getString('reason') || '管理者による付与';
    const database = new Database();
    
    try {
      // 対象ユーザーを取得または作成
      let user = await database.getUser(targetUser.id);
      if (!user) {
        user = await database.createUser(targetUser.id);
      }

      // 新しい残高を計算
      const newBalance = user.balance + amount;
      
      // 残高を更新
      await database.updateUserBalance(targetUser.id, newBalance);
      
      // 取引履歴を記録
      await database.addTransaction(
        null, // 管理者からの付与なのでfromは不要
        targetUser.id,
        amount,
        'admin_give',
        reason
      );

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Ru_men付与完了')
        .addFields(
          { name: '対象ユーザー', value: `<@${targetUser.id}>`, inline: true },
          { name: '付与額', value: `${amount.toLocaleString()} Ru`, inline: true },
          { name: '新しい残高', value: `${newBalance.toLocaleString()} Ru`, inline: true },
          { name: '理由', value: reason, inline: false }
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `付与者: ${interaction.user.tag}` });

      await interaction.reply({ embeds: [embed] });

      // ログをコンソールに出力
      console.log(`[ADMIN GIVE] ${interaction.user.tag} gave ${amount} Ru to ${targetUser.tag}. Reason: ${reason}`);
      
    } catch (error) {
      console.error('Error in give command:', error);
      await interaction.reply({ 
        content: '❌ Ru_men付与中にエラーが発生しました。', 
        ephemeral: true 
      });
    }
  },
};

export default giveCommand;