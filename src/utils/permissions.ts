import { GuildMember, CommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';

// 管理者専用ユーザーIDリスト
export const ADMIN_USER_IDS = [
  '690378679985111090',
  '1337300895188258816'
];

// 一般ユーザーが使用可能なコマンド
export const PUBLIC_COMMANDS = [
  'balance',
  'transfer'
];

/**
 * ユーザーが管理者権限を持っているかチェック（特定ユーザーIDリスト）
 * @param userId ユーザーID
 * @returns 権限があるかどうか
 */
export function hasAdminPermission(userId: string): boolean {
  return ADMIN_USER_IDS.includes(userId);
}

/**
 * 権限エラーメッセージを取得
 * @returns エラーメッセージ
 */
export function getAdminPermissionErrorMessage(): string {
  return '❌ このコマンドを実行する権限がありません。管理者専用のコマンドです。';
}

/**
 * 旧関数との互換性のため（特定ユーザーIDチェックに変更）
 * @deprecated hasAdminPermission(userId)を使用してください
 */
export function hasPrivilegedRole(member: GuildMember | null): boolean {
  if (!member) return false;
  return hasAdminPermission(member.user.id);
}

/**
 * 一般ユーザーが使用可能なコマンドかどうかをチェック
 */
export function isPublicCommand(commandName: string): boolean {
  return PUBLIC_COMMANDS.includes(commandName);
}

/**
 * コマンドの権限チェックを行い、権限がない場合はエラーメッセージを返す
 * @param interaction コマンドインタラクション
 * @param commandName コマンド名
 * @returns 権限がない場合はtrue（エラー処理済み）、権限がある場合はfalse
 */
export async function checkCommandPermission(interaction: CommandInteraction, commandName: string): Promise<boolean> {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  
  console.log(`[PERMISSION CHECK] User: ${username} (${userId}) attempting to use command: ${commandName}`);
  
  // 管理者ユーザーは全コマンド使用可能
  if (hasAdminPermission(userId)) {
    console.log(`[PERMISSION CHECK] User ${username} is admin - access granted`);
    return false; // 権限あり
  }
  
  // 一般ユーザーは許可されたコマンドのみ使用可能
  if (isPublicCommand(commandName)) {
    console.log(`[PERMISSION CHECK] Command ${commandName} is public - access granted for ${username}`);
    return false; // 権限あり
  }
  
  console.log(`[PERMISSION CHECK] Access denied for user ${username} (${userId}) to command ${commandName}`);
  console.log(`[PERMISSION CHECK] Required admin user IDs: ${ADMIN_USER_IDS.join(', ')}`);
  console.log(`[PERMISSION CHECK] Public commands: ${PUBLIC_COMMANDS.join(', ')}`);
  
  // 権限なし - エラーメッセージを送信
  const errorEmbed = new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('❌ 権限エラー')
    .setDescription(`このコマンドを使用する権限がありません。\n\n**使用可能なコマンド:**\n• \`/balance\` - 残高確認\n• \`/transfer\` - 送金`)
    .setFooter({ text: 'より多くの機能が必要な場合は管理者にお問い合わせください。' })
    .setTimestamp();

  await interaction.reply({ 
    embeds: [errorEmbed], 
    flags: MessageFlags.Ephemeral 
  });
  
  return true; // 権限なし（エラー処理済み）
}