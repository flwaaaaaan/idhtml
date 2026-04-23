const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  createRecord,
  deleteRecordById,
  ensureSchema,
  findActiveRecordByToken,
  listActiveRecords,
  purgeExpiredRecords
} = require("./lib/db");

const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin123";

async function handleRequest(req, res) {
  try {
    await ensureSchema();
    await purgeExpiredRecords();

    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname.startsWith("/public/")) {
      return serveStaticFile(pathname.replace("/public/", ""), res);
    }

    if (req.method === "GET" && pathname === "/") {
      return sendHtml(res, renderLandingPage());
    }

    if (req.method === "GET" && pathname === "/admin") {
      if (!isAdminAuthorized(requestUrl)) {
        return sendHtml(res, renderAdminLoginPage(), 401);
      }

      const records = await listActiveRecords();
      return sendHtml(res, renderAdminPage(records, requestUrl));
    }

    if (req.method === "POST" && pathname === "/admin/create") {
      if (!isAdminAuthorized(requestUrl)) {
        return redirect(res, "/admin");
      }

      const formData = await readFormData(req);
      const hours = Math.max(1, Number(formData.durationHours || "24"));
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

      await createRecord({
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        title: sanitizeText(formData.title || "账号信息"),
        account: sanitizeText(formData.account || ""),
        password: sanitizeText(formData.password || ""),
        note: sanitizeText(formData.note || ""),
        customHtml: String(formData.customHtml || "").trim(),
        createdAt: new Date().toISOString(),
        expiresAt
      });

      return redirect(res, `/admin?key=${encodeURIComponent(ADMIN_SECRET)}`);
    }

    if (req.method === "POST" && pathname.startsWith("/admin/delete/")) {
      if (!isAdminAuthorized(requestUrl)) {
        return redirect(res, "/admin");
      }

      const id = pathname.replace("/admin/delete/", "");
      await deleteRecordById(id);
      return redirect(res, `/admin?key=${encodeURIComponent(ADMIN_SECRET)}`);
    }

    if (req.method === "GET" && pathname.endsWith("/GetHTML")) {
      const token = pathname.split("/").filter(Boolean)[0];
      const record = await findActiveRecordByToken(token);
      return sendHtml(res, renderAccountPage(record, requestUrl.origin));
    }

    sendHtml(res, renderNotFoundPage(), 404);
  } catch (error) {
    console.error(error);
    sendHtml(res, renderErrorPage(error), 500);
  }
}

function isAdminAuthorized(requestUrl) {
  return requestUrl.searchParams.get("key") === ADMIN_SECRET;
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readFormData(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });

    req.on("end", () => {
      const params = new URLSearchParams(body);
      resolve(Object.fromEntries(params.entries()));
    });

    req.on("error", reject);
  });
}

function serveStaticFile(relativePath, res) {
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    return sendPlainText(res, "Not Found", 404);
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".css" ? "text/css; charset=utf-8" : "text/plain; charset=utf-8";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
}

function sendHtml(res, html, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendPlainText(res, text, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function buildPageLayout({ title, body, extraHead = "" }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/public/styles.css">
  ${extraHead}
</head>
<body>
  ${body}
</body>
</html>`;
}

function renderLandingPage() {
  return buildPageLayout({
    title: "账号交付系统",
    body: `
      <main class="shell center-shell">
        <section class="panel hero-panel">
          <span class="eyebrow">Secure Delivery</span>
          <h1>账号交付管理</h1>
          <p>这是一个保密安全性极高的项目，每位用户只能获取到唯一链接用于访问使用账号</p>
          <div class="hero-actions">
            <a class="button primary" href="/">购买获取账号</a>
          </div>
        </section>
      </main>
    `
  });
}

function renderAdminLoginPage() {
  return buildPageLayout({
    title: "管理员入口",
    body: `
      <main class="shell center-shell">
        <section class="panel narrow-panel">
          <span class="eyebrow">Admin</span>
          <h1>管理员验证</h1>
          <p>请输入正确的密钥</p>
        </section>
      </main>
    `
  });
}

function renderAdminPage(records, requestUrl) {
  const key = encodeURIComponent(requestUrl.searchParams.get("key") || "");
  const rows = records.length
    ? records
        .map((item) => {
          const userLink = `${requestUrl.protocol}//${requestUrl.host}/${item.token}/GetHTML`;
          return `
            <article class="record-card">
              <div class="record-main">
                <h3>${escapeHtml(item.title)}</h3>
                <p><strong>账号：</strong>${escapeHtml(item.account)}</p>
                <p><strong>密码：</strong>${escapeHtml(item.password)}</p>
                <p><strong>备注：</strong>${escapeHtml(item.note || "-")}</p>
                <p><strong>自定义 HTML：</strong>${item.customHtml ? "已填写" : "未填写"}</p>
                <p><strong>到期：</strong>${formatDateTime(item.expiresAt)}</p>
                <p><strong>链接：</strong><a href="${escapeHtml(userLink)}" target="_blank" rel="noreferrer">${escapeHtml(userLink)}</a></p>
              </div>
              <form method="post" action="/admin/delete/${encodeURIComponent(item.id)}?key=${key}">
                <button class="button danger" type="submit">删除</button>
              </form>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">当前还没有生成任何账号链接。</div>`;

  return buildPageLayout({
    title: "账号管理",
    body: `
      <main class="shell admin-shell">
        <section class="panel form-panel">
          <span class="eyebrow">Create Link</span>
          <h1>新增账号页面</h1>
          <form class="admin-form" method="post" action="/admin/create?key=${key}">
            <label>
              <span>标题</span>
              <input name="title" placeholder="例如：Netflix 共享账号">
            </label>
            <label>
              <span>账号</span>
              <input name="account" placeholder="邮箱 / 用户名">
            </label>
            <label>
              <span>密码</span>
              <input name="password" placeholder="密码">
            </label>
            <label>
              <span>备注</span>
              <textarea name="note" rows="4" placeholder="例如：仅供 1 人使用，不要修改密码"></textarea>
            </label>
            <label>
              <span>自定义 HTML 内容</span>
              <textarea name="customHtml" rows="10" placeholder="<div class='your-box'>这里可以直接填写 HTML 代码</div>"></textarea>
            </label>
            <label>
              <span>自定义 HTML 补充内容</span>
              <textarea name="customHtml" rows="20" placeholder="<div class='your-box'>这里可以直接填写 HTML 代码</div>"></textarea>
            </label>
            <label>
              <span>有效时长（小时）</span>
              <input name="durationHours" type="number" min="1" value="24" required>
            </label>
            <button class="button primary" type="submit">生成专属链接</button>
          </form>
        </section>
        <section class="panel list-panel">
          <span class="eyebrow">Active Links</span>
          <h2>未过期账号</h2>
          <div class="record-list">${rows}</div>
        </section>
      </main>
    `
  });
}

function renderAccountPage(record, origin) {
  if (!record) {
    return renderExpiredPage();
  }

  const accountLink = `${origin}/${record.token}/GetHTML`;
  const hasBaseInfo = Boolean(record.account || record.password);
  const hasNote = Boolean(record.note);
  const hasCustomHtml = Boolean(record.customHtml);
  const defaultBlock = hasBaseInfo
    ? `
          <div class="info-grid">
            ${
              record.account
                ? `
            <div class="info-card">
              <span>账号</span>
              <strong>${escapeHtml(record.account)}</strong>
              <button class="button secondary" onclick="copyValue(${JSON.stringify(record.account)})">复制账号</button>
            </div>
            `
                : ""
            }
            ${
              record.password
                ? `
            <div class="info-card">
              <span>密码</span>
              <strong>${escapeHtml(record.password)}</strong>
              <button class="button secondary" onclick="copyValue(${JSON.stringify(record.password)})">复制密码</button>
            </div>
            `
                : ""
            }
          </div>
      `
    : "";

  const noteBlock = hasNote
    ? `
          <div class="note-box">
            <span>备注</span>
            <p>${escapeHtml(record.note)}</p>
          </div>
      `
    : "";

  const customHtmlBlock = hasCustomHtml
    ? `
          <section class="custom-html-block">
            ${record.customHtml}
          </section>
      `
    : "";

  return buildPageLayout({
    title: record.title,
    extraHead: `
      <script>
        async function copyValue(value) {
          try {
            await navigator.clipboard.writeText(value);
            const badge = document.getElementById("copy-status");
            badge.textContent = "已复制";
            setTimeout(() => { badge.textContent = ""; }, 1600);
          } catch (error) {
            alert("复制失败，请手动复制");
          }
        }
      </script>
    `,
    body: `
      <main class="shell center-shell">
        <section class="panel account-panel">
          <div class="title-row">
            <div>
              <span class="eyebrow">Private Access</span>
              <h1>${escapeHtml(record.title)}</h1>
            </div>
            <span id="copy-status" class="copy-status"></span>
          </div>
          ${defaultBlock}
          ${noteBlock}
          ${customHtmlBlock || '<div class="note-box"><span>内容</span><p>当前没有填写更多自定义内容。</p></div>'}
          <div class="meta-row">
            <p><strong>专属链接：</strong>${escapeHtml(accountLink)}</p>
            <p><strong>失效时间：</strong>${formatDateTime(record.expiresAt)}</p>
          </div>
        </section>
      </main>
    `
  });
}

function renderExpiredPage() {
  return buildPageLayout({
    title: "链接已失效",
    body: `
      <main class="shell center-shell">
        <section class="panel narrow-panel">
          <span class="eyebrow">Expired</span>
          <h1>该账号链接已失效</h1>
          <p>当前页面对应的账号已到期或已被删除，无法继续获取内容。</p>
        </section>
      </main>
    `
  });
}

function renderNotFoundPage() {
  return buildPageLayout({
    title: "页面不存在",
    body: `
      <main class="shell center-shell">
        <section class="panel narrow-panel">
          <span class="eyebrow">404</span>
          <h1>页面不存在</h1>
          <p>请检查访问链接是否正确。</p>
        </section>
      </main>
    `
  });
}

function renderErrorPage(error) {
  return buildPageLayout({
    title: "服务错误",
    body: `
      <main class="shell center-shell">
        <section class="panel narrow-panel">
          <span class="eyebrow">500</span>
          <h1>服务暂时不可用</h1>
          <p>${escapeHtml(error.message || "Unknown error")}</p>
        </section>
      </main>
    `
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("zh-CN", { hour12: false });
}

module.exports = {
  handleRequest
};
