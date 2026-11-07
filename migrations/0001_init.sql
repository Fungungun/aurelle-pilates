-- Aurelle CRM 第一版：学员、课程包、课程（日程 + 课堂记录）、登录会话、登录限速
-- 时间都按布里斯班本地时间存成文本 'YYYY-MM-DDTHH:MM'（昆士兰没有夏令时）

CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT, email TEXT,
  language TEXT DEFAULT 'zh',             -- zh / en
  status TEXT NOT NULL DEFAULT 'lead',    -- lead 咨询 / trial 体验 / active 在上课 / paused 暂停 / archived 归档
  source TEXT,                            -- 怎么找到我们的
  birth_year INTEGER,
  goals TEXT,                             -- 目标
  health TEXT,                            -- 伤病、身体状况、注意事项（敏感信息）
  questionnaire_on TEXT,                  -- 健康问卷填写日期
  consent_on TEXT,                        -- 同意书签署日期
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                     -- first / foundations6 / founding6 / single / ten / other
  sessions_total INTEGER NOT NULL,
  price REAL, paid INTEGER NOT NULL DEFAULT 0,
  purchased_on TEXT NOT NULL,
  expires_on TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,  -- 为空 = 个人安排 / 占用时间
  title TEXT,                              -- 个人安排的标题
  starts_at TEXT NOT NULL,                 -- 'YYYY-MM-DDTHH:MM'
  duration_min INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'booked',   -- booked 已预约 / done 已上 / cancelled 已取消 / late_cancel 迟取消 / no_show 未到
  package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
  lesson_no INTEGER,                       -- 入门课第几节（1–6），其他为空
  notes TEXT,                              -- 课堂记录：做了什么、弹簧、观察、下次重点
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX sessions_start ON sessions(starts_at);
CREATE INDEX sessions_client ON sessions(client_id, starts_at);
CREATE INDEX packages_client ON packages(client_id);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL,                      -- admin（以后加 client）
  client_id INTEGER,
  expires_at INTEGER NOT NULL              -- unix 秒
);

CREATE TABLE login_attempts (
  ip TEXT PRIMARY KEY,
  fails INTEGER NOT NULL,
  first_at INTEGER NOT NULL
);
