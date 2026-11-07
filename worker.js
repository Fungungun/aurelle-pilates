// Aurelle Pilates Worker：公开页面照常走静态文件；/tutorial 是 Jessica 的私人备课页，需要密码。
// 密码存在 Cloudflare secret TUTORIAL_PASSWORD 里（npx wrangler secret put TUTORIAL_PASSWORD），不写进代码。
// 页面内容 _private/tutorial.html 由 tools/build/tutorial.py 生成，不进 git、不作为静态文件发布。
import tutorialPage from "./_private/tutorial.html";

const COOKIE = "aurelle_t";
const MAX_AGE = 60 * 60 * 24 * 30; // 登录保持 30 天
const PRIVATE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "strict-origin-when-cross-origin",
};

async function token(secret) {
  // 改密码后旧的登录自动失效
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("aurelle-tutorial-v1"));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function cookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}

function loginPage(error) {
  return new Response(`<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>登录 · Aurelle</title><link rel="icon" href="/favicon.svg"><style>
:root{--bg:#FBF7F0;--card:#FFFDF9;--ink:#2B2420;--mute:#6F625A;--gold:#B08236;--line:#E6DAC6;--onGold:#FFFDF9}
@media (prefers-color-scheme:dark){:root{--bg:#191512;--card:#251F1B;--ink:#F2EADF;--mute:#B9AB9C;--gold:#D6AE68;--line:#3A312A;--onGold:#191512}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,"PingFang SC",sans-serif;padding:16px;box-sizing:border-box}
form{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px 24px;width:min(340px,100%);display:flex;flex-direction:column;gap:12px}
h1{margin:0;font:600 22px Georgia,"Songti SC",serif}p{margin:0;color:var(--mute);font-size:13px}
input{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink)}
button{font:inherit;padding:10px;border:0;border-radius:10px;background:var(--gold);color:var(--onGold);cursor:pointer}
.err{color:#c0392b}</style></head><body>
<form method="post" action="/tutorial/login"><h1>备课本</h1><p>Private · 仅限 Jessica</p>
<input type="password" name="password" placeholder="密码 Password" autocomplete="current-password" required autofocus>
${error ? '<p class="err">密码不对，再试一次。</p>' : ""}<button>进入</button></form></body></html>`,
    { status: error ? 401 : 200, headers: PRIVATE_HEADERS });
}

async function tutorial(req, env, url) {
  const secret = env.TUTORIAL_PASSWORD;
  if (!secret) return new Response("Not configured", { status: 503 });
  const good = await token(secret);
  const back = { status: 303, headers: { location: "/tutorial", "cache-control": "no-store" } };

  if (url.pathname === "/tutorial/login" && req.method === "POST") {
    const form = await req.formData();
    const pw = String(form.get("password") || "");
    if (!same(await token(pw), good)) {
      await new Promise(r => setTimeout(r, 800)); // 减慢猜密码
      return loginPage(true);
    }
    back.headers["set-cookie"] = `${COOKIE}=${good}; Path=/tutorial; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
    return new Response(null, back);
  }
  if (url.pathname === "/tutorial/logout" && req.method === "POST") {
    back.headers["set-cookie"] = `${COOKIE}=; Path=/tutorial; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
    return new Response(null, back);
  }
  if (url.pathname !== "/tutorial" && url.pathname !== "/tutorial/") return new Response(null, back);
  if (!same(cookie(req, COOKIE), good)) return loginPage(false);
  return new Response(tutorialPage, { headers: PRIVATE_HEADERS });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/tutorial" || url.pathname.startsWith("/tutorial/")) return tutorial(req, env, url);
    return env.ASSETS.fetch(req);
  },
};
