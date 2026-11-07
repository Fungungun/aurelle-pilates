// Portal 的数据接口（JSON），只给管理员用。路径都在 /portal/api/ 下。
const FIELDS = {
  clients: ["name", "phone", "email", "language", "status", "source", "birth_year", "goals", "health",
    "questionnaire_on", "consent_on", "notes"],
  packages: ["client_id", "kind", "sessions_total", "price", "paid", "purchased_on", "expires_on", "notes"],
  sessions: ["client_id", "title", "starts_at", "duration_min", "status", "package_id", "lesson_no", "notes"],
};
const ENUMS = {
  status_clients: ["lead", "trial", "active", "paused", "archived"],
  status_sessions: ["booked", "done", "cancelled", "late_cancel", "no_show"],
  kind: ["first", "foundations6", "founding6", "single", "ten", "other"],
  language: ["zh", "en"],
};
const USED = "('done','late_cancel','no_show')"; // 这些状态会扣课程包

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const bad = msg => json({ error: msg }, 400);

// 布里斯班本地时间（UTC+10，没有夏令时）
export function brisbaneNow() {
  const d = new Date(Date.now() + 10 * 3600 * 1000);
  return d.toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:MM'
}
const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

function clean(table, body, partial) {
  const out = {};
  for (const k of FIELDS[table]) {
    if (!(k in body)) continue;
    let v = body[k];
    if (typeof v === "string") v = v.trim();
    if (v === "") v = null;
    out[k] = v;
  }
  if (table === "clients") {
    if (!partial && !out.name) throw "请填写姓名";
    if ("name" in out && !out.name) throw "请填写姓名";
    if (out.status && !ENUMS.status_clients.includes(out.status)) throw "状态不对";
    if (out.language && !ENUMS.language.includes(out.language)) throw "语言不对";
  }
  if (table === "packages") {
    if (!partial && !(out.client_id && out.kind && out.sessions_total && out.purchased_on)) throw "课程包信息不完整";
    if (out.kind && !ENUMS.kind.includes(out.kind)) throw "课程包类型不对";
    if ("paid" in out) out.paid = out.paid ? 1 : 0;
  }
  if (table === "sessions") {
    if (!partial && !out.starts_at) throw "请填写时间";
    if (out.starts_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(out.starts_at)) throw "时间格式不对";
    if (out.status && !ENUMS.status_sessions.includes(out.status)) throw "状态不对";
    if (!partial && !out.client_id && !out.title) throw "请选择学员，或填写个人安排的标题";
  }
  return out;
}

async function insert(env, table, data) {
  const keys = Object.keys(data);
  const r = await env.DB.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
    .bind(...keys.map(k => data[k])).run();
  return r.meta.last_row_id;
}
async function update(env, table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  const touch = table === "packages" ? "" : ", updated_at = datetime('now')";
  await env.DB.prepare(`UPDATE ${table} SET ${keys.map(k => k + " = ?").join(", ")}${touch} WHERE id = ?`)
    .bind(...keys.map(k => data[k]), id).run();
}

// 和已有课程时间重叠的（不算已取消的）
async function conflicts(env, s, exceptId) {
  const { results } = await env.DB.prepare(`
    SELECT s.id, s.starts_at, s.duration_min, COALESCE(c.name, s.title) AS who FROM sessions s
    LEFT JOIN clients c ON c.id = s.client_id
    WHERE s.status NOT IN ('cancelled') AND s.id != ?
      AND datetime(s.starts_at) < datetime(?, '+' || ? || ' minutes')
      AND datetime(s.starts_at, '+' || s.duration_min || ' minutes') > datetime(?)`)
    .bind(exceptId || 0, s.starts_at, s.duration_min || 60, s.starts_at).all();
  return results;
}

const PKG_SQL = `SELECT p.*,
  (SELECT COUNT(*) FROM sessions s WHERE s.package_id = p.id AND s.status IN ${USED}) AS used,
  (SELECT COUNT(*) FROM sessions s WHERE s.package_id = p.id AND s.status = 'booked') AS booked
  FROM packages p`;

const SESSION_SQL = `SELECT s.*, c.name AS client_name, c.health AS client_health FROM sessions s
  LEFT JOIN clients c ON c.id = s.client_id`;

export async function api(req, env, path) {
  const m = req.method;
  if (m !== "GET") {
    // 防跨站请求：必须是同一网站发出的 JSON 请求
    const origin = req.headers.get("origin");
    if (req.headers.get("x-portal") !== "1" || (origin && origin !== new URL(req.url).origin))
      return json({ error: "forbidden" }, 403);
  }
  let body = {};
  if (m === "POST" || m === "PUT") {
    try { body = await req.json(); } catch { return bad("数据格式不对"); }
  }
  const [, res, idStr] = path.split("/"); // '/clients/12' → ['', 'clients', '12']
  const id = idStr ? Number(idStr) : null;
  const url = new URL(req.url);

  try {
    // ---------- 概览 ----------
    if (res === "overview" && m === "GET") {
      const nowStr = brisbaneNow(), today = nowStr.slice(0, 10);
      const [upcoming, counts, lowPkgs, missing, todo] = await env.DB.batch([
        env.DB.prepare(`${SESSION_SQL} WHERE s.starts_at >= ? AND s.starts_at < ? AND s.status != 'cancelled' ORDER BY s.starts_at`)
          .bind(today, addDays(today, 8)),
        env.DB.prepare(`SELECT
            (SELECT COUNT(*) FROM clients WHERE status IN ('trial','active')) AS active,
            (SELECT COUNT(*) FROM clients WHERE status = 'lead') AS leads,
            (SELECT COUNT(*) FROM sessions WHERE status = 'done' AND starts_at >= ?) AS done_month,
            (SELECT COUNT(*) FROM sessions WHERE client_id IS NOT NULL AND status != 'cancelled' AND starts_at >= ? AND starts_at < ?) AS week`)
          .bind(today.slice(0, 8) + "01", today, addDays(today, 7)),
        // 每位学员最新的课程包：剩 1 节以内，或 14 天内过期
        env.DB.prepare(`SELECT * FROM (
            SELECT p.*, c.name AS client_name,
              (SELECT COUNT(*) FROM sessions s WHERE s.package_id = p.id AND s.status IN ${USED}) AS used
            FROM packages p JOIN clients c ON c.id = p.client_id
            WHERE c.status IN ('trial','active') AND p.id = (SELECT MAX(id) FROM packages WHERE client_id = p.client_id))
          WHERE sessions_total - used <= 1 OR (expires_on IS NOT NULL AND expires_on <= ?)
          ORDER BY client_name`).bind(addDays(today, 14)),
        env.DB.prepare(`SELECT id, name, questionnaire_on, consent_on FROM clients
            WHERE status IN ('trial','active') AND (questionnaire_on IS NULL OR consent_on IS NULL) ORDER BY name`),
        env.DB.prepare(`${SESSION_SQL} WHERE s.client_id IS NOT NULL AND s.status = 'booked' AND s.starts_at < ? ORDER BY s.starts_at DESC LIMIT 20`)
          .bind(nowStr),
      ]);
      return json({ now: nowStr, upcoming: upcoming.results, counts: counts.results[0], lowPkgs: lowPkgs.results,
        missing: missing.results, todo: todo.results });
    }

    // ---------- 学员 ----------
    if (res === "clients") {
      if (m === "GET" && !id) {
        const q = (url.searchParams.get("q") || "").trim(), st = url.searchParams.get("status") || "";
        const nowStr = brisbaneNow();
        let sql = `SELECT c.id, c.name, c.phone, c.email, c.status, c.language, c.health IS NOT NULL AS has_health,
          (SELECT MAX(starts_at) FROM sessions s WHERE s.client_id = c.id AND s.status = 'done') AS last_session,
          (SELECT MIN(starts_at) FROM sessions s WHERE s.client_id = c.id AND s.status = 'booked' AND s.starts_at >= ?) AS next_session,
          (SELECT COALESCE(SUM(p.sessions_total),0) FROM packages p WHERE p.client_id = c.id AND (p.expires_on IS NULL OR p.expires_on >= ?)) -
          (SELECT COUNT(*) FROM sessions s JOIN packages p ON p.id = s.package_id WHERE s.client_id = c.id AND s.status IN ${USED}
             AND (p.expires_on IS NULL OR p.expires_on >= ?)) AS remaining
          FROM clients c WHERE 1=1`;
        const args = [nowStr, nowStr.slice(0, 10), nowStr.slice(0, 10)];
        if (st) { sql += " AND c.status = ?"; args.push(st); }
        else sql += " AND c.status != 'archived'";
        if (q) { sql += " AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)"; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
        sql += " ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'lead' THEN 2 WHEN 'paused' THEN 3 ELSE 4 END, c.name";
        return json((await env.DB.prepare(sql).bind(...args).all()).results);
      }
      if (m === "GET" && id) {
        const [c, pk, ss] = await env.DB.batch([
          env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id),
          env.DB.prepare(`${PKG_SQL} WHERE p.client_id = ? ORDER BY p.purchased_on DESC, p.id DESC`).bind(id),
          env.DB.prepare("SELECT * FROM sessions WHERE client_id = ? ORDER BY starts_at DESC").bind(id),
        ]);
        if (!c.results[0]) return json({ error: "找不到这位学员" }, 404);
        return json({ client: c.results[0], packages: pk.results, sessions: ss.results });
      }
      if (m === "POST") return json({ id: await insert(env, "clients", clean("clients", body)) }, 201);
      if (m === "PUT" && id) { await update(env, "clients", id, clean("clients", body, true)); return json({ ok: true }); }
      if (m === "DELETE" && id) { await env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(id).run(); return json({ ok: true }); }
    }

    // ---------- 课程包 ----------
    if (res === "packages") {
      if (m === "POST") return json({ id: await insert(env, "packages", clean("packages", body)) }, 201);
      if (m === "PUT" && id) { await update(env, "packages", id, clean("packages", body, true)); return json({ ok: true }); }
      if (m === "DELETE" && id) { await env.DB.prepare("DELETE FROM packages WHERE id = ?").bind(id).run(); return json({ ok: true }); }
    }

    // ---------- 课程 / 日程 ----------
    if (res === "sessions") {
      if (m === "GET" && !id) {
        const from = url.searchParams.get("from"), to = url.searchParams.get("to");
        if (!from || !to) return bad("缺少日期范围");
        return json((await env.DB.prepare(`${SESSION_SQL} WHERE s.starts_at >= ? AND s.starts_at < ? ORDER BY s.starts_at`)
          .bind(from, to).all()).results);
      }
      if (m === "POST" || (m === "PUT" && id)) {
        const data = clean("sessions", body, m === "PUT");
        if (data.starts_at || data.duration_min) {
          const cur = id ? await env.DB.prepare("SELECT starts_at, duration_min, status FROM sessions WHERE id = ?").bind(id).first() : {};
          const s = { starts_at: data.starts_at || cur.starts_at, duration_min: data.duration_min || cur.duration_min || 60 };
          const st = data.status || cur.status || "booked";
          if (st !== "cancelled" && !body.force) {
            const c = await conflicts(env, s, id);
            if (c.length) return json({ error: "conflict", conflicts: c }, 409);
          }
        }
        if (m === "POST") return json({ id: await insert(env, "sessions", data) }, 201);
        await update(env, "sessions", id, data);
        return json({ ok: true });
      }
      if (m === "DELETE" && id) { await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run(); return json({ ok: true }); }
    }

    // ---------- 备份 ----------
    if (res === "export" && m === "GET") {
      const [c, p, s] = await env.DB.batch([
        env.DB.prepare("SELECT * FROM clients"), env.DB.prepare("SELECT * FROM packages"), env.DB.prepare("SELECT * FROM sessions"),
      ]);
      return new Response(JSON.stringify({ exported_at: brisbaneNow(), clients: c.results, packages: p.results, sessions: s.results }, null, 1), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
          "content-disposition": `attachment; filename="aurelle-crm-${brisbaneNow().slice(0, 10)}.json"` },
      });
    }
  } catch (e) {
    if (typeof e === "string") return bad(e);
    console.error(e);
    return json({ error: "服务器出错了：" + (e.message || e) }, 500);
  }
  return json({ error: "not found" }, 404);
}
