// netlify/functions/schedule.js
// 中介層：隱藏 Sheet ID，前端只能透過此 function 取得資料

exports.handler = async (event) => {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;       // 設定在 Netlify 環境變數
  const SHEET_NAME = encodeURIComponent("Main_List"); // sheet 名稱

  // 讀取 query 參數：?date=2026-03-19
  const date = event.queryStringParameters?.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "需要提供正確格式的日期，例如 ?date=2026-03-19" }),
    };
  }

  if (!SHEET_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "伺服器未設定 GOOGLE_SHEET_ID 環境變數" }),
    };
  }

  // Google Sheets CSV 公開匯出 URL（需要試算表已設為「知道連結的人可以檢視」）
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Sheets 回應錯誤：${res.status}`);

    const csvText = await res.text();
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify([]),
      };
    }

    const headers = rows[0];
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
      return obj;
    });

    // 只回傳指定日期、狀態為 Scheduled 的資料
    // 只回傳前端需要的欄位（不回傳教室連結等敏感欄位）
    const filtered = data
      .filter(r => r["日期"] === date && r["狀態"] === "Scheduled")
      .map(r => ({
        時間: r["時間"],
        教室: r["教室"],
        等級: r["等級"],
        老師: r["老師"],
        班級名稱: r["班級名稱"],
        主教材: r["主教材"],
        主教材進度: r["主教材進度"],
        副教材: r["副教材"],
        副教材進度: r["副教材進度"],
        學生教室連結: r["學生教室連結"],
      }));

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify(filtered),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// 簡易 CSV 解析（處理欄位內含換行與逗號）
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ""; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === '\r') { /* skip */ }
      else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}
