import { GuildMember, PermissionFlagsBits, CommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';

// 給与システムを使用できるロールID
export const SALARY_AUTHORIZED_ROLES = [
  '1424768596726251651', // 最高神
  '1428737130271871147', // 女神
  '1425862683521191937', // 神徒
];

// 特権ロールのID一覧（全コマンド使用可能）
export const PRIVILEGED_ROLES = [
  '1424768596726251651',
  '1428737130271871147', 
  '1425862683521191937'
];

// 一般ユーザーが使用可能なコマンド
export const PUBLIC_COMMANDS = [
  'balance',
  'transfer'
];

/**
 * ユーザーが給与システムのコマンドを実行する権限があるかチェック
 * @param member ギルドメンバー
 * @returns 権限があるかどうか
 */
export function hasSalaryPermission(member: GuildMember): boolean {
  // 管理者権限がある場合は許可
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  
  // 指定されたロールのいずれかを持っている場合は許可
  return member.roles.cache.some(role => 
    SALARY_AUTHORIZED_ROLES.includes(role.id)
  );
}

/**
 * 権限エラーメッセージを取得
 * @returns エラーメッセージ
 */
export function getSalaryPermissionErrorMessage(): string {
  return '❌ このコマンドを実行する権限がありません。管理者または指定されたロールが必要です。';
}

/**
 * ユーザーが特権ロールを持っているかどうかをチェック
 */
export function hasPrivilegedRole(member: GuildMember | null): boolean {
  if (!member) return false;
  
  return member.roles.cache.some(role => 
    PRIVILEGED_ROLES.includes(role.id)
  );
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
  const member = interaction.member as GuildMember | null;
  
  console.log(`[PERMISSION CHECK] User: ${username} (${userId}) attempting to use command: ${commandName}`);
  
  // 特権ロールを持つユーザーは全コマンド使用可能
  if (hasPrivilegedRole(member)) {
    const userRoles = member?.roles.cache.map(role => `${role.name} (${role.id})`).join(', ') || 'None';
    console.log(`[PERMISSION CHECK] User ${username} has privileged role - access granted`);
    console.log(`[PERMISSION CHECK] User roles: ${userRoles}`);
    return false; // 権限あり
  }
  
  // 一般ユーザーは許可されたコマンドのみ使用可能
  if (isPublicCommand(commandName)) {
    console.log(`[PERMISSION CHECK] Command ${commandName} is public - access granted for ${username}`);
    return false; // 権限あり
  }
  
  const userRoles = member?.roles.cache.map(role => `${role.name} (${role.id})`).join(', ') || 'None';
  console.log(`[PERMISSION CHECK] Access denied for user ${username} (${userId}) to command ${commandName}`);
  console.log(`[PERMISSION CHECK] User roles: ${userRoles}`);
  console.log(`[PERMISSION CHECK] Required privileged roles: ${PRIVILEGED_ROLES.join(', ')}`);
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