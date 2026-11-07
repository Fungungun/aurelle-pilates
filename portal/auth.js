// Portal 登录：管理员账号和密码都在 Cloudflare secret ADMIN_USER / ADMIN_PASSWORD 里（不写进代码）。
// 登录后发一个随机令牌放进 cookie，数据库里只存它的哈希；2 小时后过期，需要重新输入密码。
// 同一个 IP 15 分钟内输错 5 次就暂时锁住。
export const SESSION_SECONDS = 2 * 60 * 60;
const COOKIE = "aurelle_portal";
const MAX_FAILS = 5, FAIL_WINDOW = 15 * 60;

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const now = () => Math.floor(Date.now() / 1000);

function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function readCookie(req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return m ? m[1] : "";
}

export function cookieHeader(token, maxAge) {
  return `${COOKIE}=${token}; Path=/portal; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

// 返回 { role, client_id } 或 null
export async function currentUser(req, env) {
  const t = readCookie(req);
  if (!t) return null;
  const row = await env.DB.prepare("SELECT role, client_id, expires_at FROM auth_sessions WHERE token_hash = ?")
    .bind(await sha256(t)).first();
  if (!row || row.expires_at < now()) return null;
  return { role: row.role, client_id: row.client_id };
}

// 成功返回 { cookie }，失败返回 { error: 'bad' | 'locked' }
export async function login(req, env, username, password) {
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const t = now();
  const a = await env.DB.prepare("SELECT fails, first_at FROM login_attempts WHERE ip = ?").bind(ip).first();
  if (a && t - a.first_at < FAIL_WINDOW && a.fails >= MAX_FAILS) return { error: "locked" };

  const wantUser = env.ADMIN_USER || "", want = env.ADMIN_PASSWORD || "";
  // 账号不分大小写
  const okUser = wantUser !== "" && same(await sha256(username.trim().toLowerCase()), await sha256(wantUser.toLowerCase()));
  const okPass = want !== "" && same(await sha256(password), await sha256(want));
  if (!(okUser && okPass)) {
    if (!a || t - a.first_at >= FAIL_WINDOW)
      await env.DB.prepare("INSERT OR REPLACE INTO login_attempts (ip, fails, first_at) VALUES (?, 1, ?)").bind(ip, t).run();
    else
      await env.DB.prepare("UPDATE login_attempts SET fails = fails + 1 WHERE ip = ?").bind(ip).run();
    await new Promise(r => setTimeout(r, 600));
    return { error: "bad" };
  }

  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip),
    env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at < ?").bind(t),
    env.DB.prepare("INSERT INTO auth_sessions (token_hash, role, client_id, expires_at) VALUES (?, 'admin', NULL, ?)")
      .bind(await sha256(token), t + SESSION_SECONDS),
  ]);
  return { cookie: cookieHeader(token, SESSION_SECONDS) };
}

export async function logout(req, env) {
  const t = readCookie(req);
  if (t) await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(t)).run();
  return cookieHeader("", 0);
}
