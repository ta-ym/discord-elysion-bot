const fs = require('fs');

// database.tsファイルを読み込み
let content = fs.readFileSync('src/database.ts', 'utf8');

// // ユーザー関連メソッド（PostgreSQL専用） の行を見つける
const targetLine = '  // ユーザー関連メソッド（PostgreSQL専用）';
const targetIndex = content.indexOf(targetLine);

if (targetIndex === -1) {
  console.log('Target line not found');
  process.exit(1);
}

// そこから前の部分をconstructor終了まで削除
const lines = content.split('\n');
let targetLineNum = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('// ユーザー関連メソッド（PostgreSQL専用）')) {
    targetLineNum = i;
    break;
  }
}

if (targetLineNum === -1) {
  console.log('Target line number not found');
  process.exit(1);
}

// constructor終了からtargetLineまでの間のSQLiteコードを削除
let newLines = [];
let inConstructor = false;
let constructorEndFound = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // constructorの開始を検出
  if (line.includes('constructor()')) {
    inConstructor = true;
    newLines.push(line);
    continue;
  }
  
  // constructorの中の処理
  if (inConstructor) {
    newLines.push(line);
    // constructor終了を検出
    if (line.trim() === '}, 3000);') {
      inConstructor = false;
      constructorEndFound = true;
      continue;
    }
  } else if (constructorEndFound && i < targetLineNum) {
    // constructor終了後、target行までのSQLiteコードはスキップ
    continue;
  } else {
    // target行以降は保持
    newLines.push(line);
  }
}

const newContent = newLines.join('\n');
fs.writeFileSync('src/database.ts', newContent);
console.log('SQLiteコード削除完了');
