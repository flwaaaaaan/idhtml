const { Pool } = require("pg");

let pool;
let schemaPromise;

function getConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_NO_SSL
  );
}

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("Missing database connection string. Set DATABASE_URL or a Vercel Postgres integration variable.");
  }

  const ssl =
    connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false };

  pool = new Pool({
    connectionString,
    ssl
  });

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = query(`
      CREATE TABLE IF NOT EXISTS account_pages (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        account TEXT NOT NULL DEFAULT '',
        password TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        custom_html TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_account_pages_token ON account_pages (token);
      CREATE INDEX IF NOT EXISTS idx_account_pages_expires_at ON account_pages (expires_at);
    `);
  }

  await schemaPromise;
}

async function purgeExpiredRecords() {
  await query("DELETE FROM account_pages WHERE expires_at <= NOW()");
}

async function listActiveRecords() {
  const result = await query(
    `
      SELECT
        id,
        token,
        title,
        account,
        password,
        note,
        custom_html AS "customHtml",
        created_at AS "createdAt",
        expires_at AS "expiresAt"
      FROM account_pages
      WHERE expires_at > NOW()
      ORDER BY created_at DESC
    `
  );

  return result.rows;
}

async function findActiveRecordByToken(token) {
  const result = await query(
    `
      SELECT
        id,
        token,
        title,
        account,
        password,
        note,
        custom_html AS "customHtml",
        created_at AS "createdAt",
        expires_at AS "expiresAt"
      FROM account_pages
      WHERE token = $1
        AND expires_at > NOW()
      LIMIT 1
    `,
    [token]
  );

  return result.rows[0] || null;
}

async function createRecord(record) {
  await query(
    `
      INSERT INTO account_pages (
        id,
        token,
        title,
        account,
        password,
        note,
        custom_html,
        created_at,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      record.id,
      record.token,
      record.title,
      record.account,
      record.password,
      record.note,
      record.customHtml,
      record.createdAt,
      record.expiresAt
    ]
  );
}

async function deleteRecordById(id) {
  await query("DELETE FROM account_pages WHERE id = $1", [id]);
}

module.exports = {
  createRecord,
  deleteRecordById,
  ensureSchema,
  findActiveRecordByToken,
  getPool,
  listActiveRecords,
  purgeExpiredRecords
};
