import sqlite3 from 'sqlite3';
import path from 'path';

class DataInspector {
  private db: sqlite3.Database;

  constructor() {
    const dbPath = path.join(__dirname, '..', 'data', 'elysion.db');
    this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('SQLite接続エラー:', err.message);
      } else {
        console.log('SQLiteデータベースに接続しました');
      }
    });
  }

  // テーブル一覧を取得
  async getTables(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT name FROM sqlite_master WHERE type='table'",
        (err, rows: { name: string }[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(row => row.name));
          }
        }
      );
    });
  }

  // ユーザーデータを確認
  async inspectUsers(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM users LIMIT 5',
        (err, rows: any[]) => {
          if (err) {
            if (err.message.includes('no such table')) {
              console.log('usersテーブルが存在しません');
              resolve();
            } else {
              reject(err);
            }
          } else {
            console.log('\n=== ユーザーデータサンプル ===');
            console.log(`総ユーザー数: ${rows.length} (最初の5人を表示)`);
            rows.forEach((user, index) => {
              console.log(`${index + 1}. ID: ${user.discord_id}, 残高: ${user.balance}Ru, 作成日: ${user.created_at}`);
            });
            resolve();
          }
        }
      );
    });
  }

  // 取引履歴を確認
  async inspectTransactions(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10',
        (err, rows: any[]) => {
          if (err) {
            if (err.message.includes('no such table')) {
              console.log('transactionsテーブルが存在しません');
              resolve();
            } else {
              reject(err);
            }
          } else {
            console.log('\n=== 取引履歴サンプル ===');
            console.log(`最新の取引 (最大10件):`);
            rows.forEach((tx, index) => {
              console.log(`${index + 1}. ${tx.type}: ${tx.amount}Ru (${tx.from_user_id || 'システム'} -> ${tx.to_user_id}) [${tx.created_at}]`);
              if (tx.description) console.log(`    説明: ${tx.description}`);
            });
            resolve();
          }
        }
      );
    });
  }

  // 統計情報を取得
  async getStatistics(): Promise<void> {
    return new Promise((resolve) => {
      const queries = [
        { name: 'ユーザー総数', query: 'SELECT COUNT(*) as count FROM users' },
        { name: '総残高', query: 'SELECT SUM(balance) as sum FROM users' },
        { name: '取引総数', query: 'SELECT COUNT(*) as count FROM transactions' },
        { name: '取引タイプ別統計', query: 'SELECT type, COUNT(*) as count, SUM(amount) as total FROM transactions GROUP BY type' }
      ];

      let completed = 0;
      
      console.log('\n=== 統計情報 ===');
      
      queries.forEach((q, index) => {
        this.db.all(q.query, (err, rows: any[]) => {
          if (err) {
            if (err.message.includes('no such table')) {
              console.log(`${q.name}: テーブルが存在しません`);
            } else {
              console.log(`${q.name}: エラー - ${err.message}`);
            }
          } else {
            if (index === 3) { // 取引タイプ別
              console.log(`${q.name}:`);
              rows.forEach(row => {
                console.log(`  ${row.type}: ${row.count}件, ${row.total}Ru`);
              });
            } else {
              const result = rows[0];
              console.log(`${q.name}: ${result.count || result.sum}`);
            }
          }
          
          completed++;
          if (completed === queries.length) {
            resolve();
          }
        });
      });
    });
  }

  // 検査実行
  async inspect(): Promise<void> {
    try {
      console.log('=== SQLiteデータベース検査開始 ===');
      
      const tables = await this.getTables();
      console.log('\n=== テーブル一覧 ===');
      console.log(tables.join(', '));
      
      if (tables.includes('users')) {
        await this.inspectUsers();
      }
      
      if (tables.includes('transactions')) {
        await this.inspectTransactions();
      }
      
      await this.getStatistics();
      
      console.log('\n=== 検査完了 ===');
      
    } catch (error) {
      console.error('検査エラー:', error);
    }
  }

  // 接続終了
  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('SQLite切断エラー:', err.message);
      } else {
        console.log('SQLite接続を閉じました');
      }
    });
  }
}

// 検査実行
async function runInspection() {
  const inspector = new DataInspector();
  
  try {
    await inspector.inspect();
  } catch (error) {
    console.error('検査失敗:', error);
  } finally {
    inspector.close();
  }
}

if (require.main === module) {
  runInspection();
}