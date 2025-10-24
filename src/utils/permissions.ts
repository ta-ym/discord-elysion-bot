import { GuildMember, PermissionFlagsBits } from 'discord.js';

// 給与システムを使用できるロールID
export const SALARY_AUTHORIZED_ROLES = [
  '1424768596726251651', // 最高神
  '1428737130271871147', // 女神
  '1425862683521191937', // 神徒
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