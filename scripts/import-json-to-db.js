const fs = require("fs");
const path = require("path");
const { createRecord, ensureSchema, getPool } = require("../lib/db");

async function main() {
  const inputPath = process.argv[2] || path.join(__dirname, "..", "data", "accounts.json");

  if (!fs.existsSync(inputPath)) {
    throw new Error(`JSON file not found: ${inputPath}`);
  }

  const content = fs.readFileSync(inputPath, "utf8");
  const records = JSON.parse(content);

  if (!Array.isArray(records)) {
    throw new Error("Input JSON must be an array");
  }

  await ensureSchema();

  for (const item of records) {
    await createRecord({
      id: String(item.id),
      token: String(item.token),
      title: String(item.title || "账号信息"),
      account: String(item.account || ""),
      password: String(item.password || ""),
      note: String(item.note || ""),
      customHtml: String(item.customHtml || ""),
      createdAt: item.createdAt || new Date().toISOString(),
      expiresAt: item.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
  }

  console.log(`Imported ${records.length} records from ${inputPath}`);
  await getPool().end();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPool().end();
  } catch (closeError) {
    // Ignore close errors during failed bootstrap.
  }
  process.exit(1);
});
