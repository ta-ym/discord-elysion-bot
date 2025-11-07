const fs = require('fs');

// database.tsファイルを読み込み
let content = fs.readFileSync('src/database.ts', 'utf8');

// PostgreSQL専用パターンに置換
const patterns = [
  // パターン1: 条件チェック + PostgreSQL呼び出し + SQLiteフォールバック
  {
    search: /if \(this\.usePostgreSQL && this\.pgDb\) \{\s*return await this\.pgDb\.([^;]+);\s*\}\s*\/\/ SQLiteフォールバック[\s\S]*?}\s*\}\);/g,
    replace: 'if (!this.pgDb) {\n      throw new Error(\'PostgreSQL connection not available - PostgreSQL-only mode requires working database connection\');\n    }\n    return await this.pgDb.$1;'
  },
  // パターン2: try-catch付きのパターン
  {
    search: /if \(this\.usePostgreSQL && this\.pgDb\) \{\s*try \{\s*return await this\.pgDb\.([^;]+);\s*\} catch \(error\) \{[\s\S]*?\}\s*\}[\s\S]*?}\s*\}\);/g,
    replace: 'if (!this.pgDb) {\n      throw new Error(\'PostgreSQL connection not available - PostgreSQL-only mode requires working database connection\');\n    }\n    return await this.pgDb.$1;'
  }
];

// 置換実行
patterns.forEach(pattern => {
  content = content.replace(pattern.search, pattern.replace);
});

// ファイルに書き戻し
fs.writeFileSync('src/database.ts', content);
console.log('PostgreSQL専用化完了');
