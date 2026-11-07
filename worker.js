// Aurelle Pilates Worker：公开页面照常走静态文件；/portal 是登录后的后台（CRM + 备课）。
// - 管理员账号 admin，密码在 Cloudflare secret ADMIN_PASSWORD（npx wrangler secret put ADMIN_PASSWORD）
// - 数据在 D1 数据库 aurelle-crm（binding DB），表结构见 migrations/
// - 备课页 _private/tutorial.html 由 tools/build/tutorial.py 生成，不进 git、不作为静态文件发布，只给管理员看
import tutorialPage from "./_private/tutorial.html";
import loginPage from "./portal/login.html";
import appPage from "./portal/app.html";
import { currentUser, login, logout } from "./portal/auth.js";
import { api } from "./portal/api.js";

const PRIVATE = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
};
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...PRIVATE, ...extra } });
const redirect = (to, extra = {}) => new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", ...extra } });
const showLogin = error => html(loginPage.replace("<!--ERROR-->", error ? `<p class="err">${error}</p>` : ""), error ? 401 : 200);

async function portal(req, env, url) {
  const p = url.pathname.replace(/\/+$/, "") || "/portal";

  if (p === "/portal/login" && req.method === "POST") {
    const f = await req.formData();
    const r = await login(req, env, String(f.get("username") || ""), String(f.get("password") || ""));
    if (r.error === "locked") return showLogin("Too many attempts. Try again in 15 minutes. · 输错次数太多，请 15 分钟后再试。");
    if (r.error) return showLogin("Wrong username or password. · 账号或密码不对。");
    return redirect("/portal", { "set-cookie": r.cookie });
  }
  if (p === "/portal/logout" && req.method === "POST") return redirect("/portal", { "set-cookie": await logout(req, env) });

  const user = await currentUser(req, env);
  const admin = user && user.role === "admin";

  if (p.startsWith("/portal/api/")) {
    if (!admin) return new Response(JSON.stringify({ error: "login" }), { status: 401, headers: { "content-type": "application/json" } });
    return api(req, env, p.slice("/portal/api".length));
  }
  if (!user) return p === "/portal" ? showLogin() : redirect("/portal");
  if (!admin) return redirect("/portal"); // 学员页面以后再做

  if (p === "/portal") return html(appPage);
  if (p === "/portal/tutorial") return html(tutorialPage);
  return redirect("/portal");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/tutorial" || url.pathname.startsWith("/tutorial/")) return redirect("/portal/tutorial");
    if (url.pathname === "/portal" || url.pathname.startsWith("/portal/")) return portal(req, env, url);
    return env.ASSETS.fetch(req);
  },
};
