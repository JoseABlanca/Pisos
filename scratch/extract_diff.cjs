const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\Jose\\.gemini\\antigravity\\brain\\4cd26bb6-3343-4c40-bfff-70771b6b8c72\\.system_generated\\logs\\transcript.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('multi_replace_file_content') && line.includes('TargetContent') && line.includes('StartLine":1293')) {
      fs.writeFileSync('C:\\Users\\Jose\\Desktop\\pisos\\antigravity-finance\\scratch\\tool_call.json', line);
    }
    if (line.includes('[diff_block_start]')) {
      fs.writeFileSync('C:\\Users\\Jose\\Desktop\\pisos\\antigravity-finance\\scratch\\tool_response.json', line);
    }
  }
}

processLineByLine();
