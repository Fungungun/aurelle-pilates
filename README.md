# Aurelle Pilates 网站

线上地址：https://pilates.vensoai.com （托管在 Cloudflare；GitHub 仓库 Fungungun/aurelle-pilates 保存源码）
中文版直接链接：`https://pilates.vensoai.com/?lang=zh` （适合发微信、小红书）

## 文件
| 文件 | 作用 |
|---|---|
| `config.js` | **平时只改这个**：预约链接、电话、邮箱、Instagram、ABN、老师资质、创始学员优惠开关 |
| `index.html` | 页面本身（文案、价格都在这里，中英文成对写在 `data-l="en"` / `data-l="zh"` 里） |
| `favicon.svg` | 浏览器标签图标 |
| `wrangler.jsonc` | Cloudflare 部署设置（域名 pilates.vensoai.com） |

## 接上预约
1. 按 `04-运营/06-经营方案.md` 第 5 节建好 Google Calendar 预约页。
2. 把「首次体验课」预约页链接填进 `config.js` 的 `bookingFirst`，「老学员私教课」填进 `bookingRegular`。
3. 发布（见下面）。网站上「在线预约即将开放」的卡片会自动换成可以直接选时间的日历。

## 改完后发布
在终端里运行：
```
cd ~/Documents/pilates/06-网站
npx wrangler deploy
git add -A && git commit -m "更新网站" && git push
```
`wrangler deploy` 发布到网站（几秒钟生效），`git` 那一行把源码备份到 GitHub。

## Portal 后台 /portal（CRM + 备课）
主页右上角和页脚有 "Portal" 入口。现在只有管理员账号 `Jessica`（不分大小写），密码是随机生成的，存在 Jessica 的密码管理器里；登录 2 小时后要重新输密码。
- `worker.js`：只处理 `/portal`（`/tutorial` 会跳到 `/portal/tutorial`），其他页面照常是静态文件。
- `portal/auth.js` 登录和会话，`portal/api.js` 数据接口，`portal/app.html` 管理界面，`portal/login.html` 登录页。
- 数据在 Cloudflare D1 数据库 `aurelle-crm`（大洋洲区域）；表结构在 `migrations/`。
- 备课页 `_private/tutorial.html` 由 `python3 ../tools/build/tutorial.py` 生成，**不进 git**（这个仓库是公开的），发布前要先生成。
- 账号和密码存在 Cloudflare secret `ADMIN_USER` / `ADMIN_PASSWORD`。改密码：`npx wrangler secret put ADMIN_PASSWORD`，再运行 `npx wrangler d1 execute aurelle-crm --remote --command "DELETE FROM auth_sessions"` 让旧的登录全部失效。
- 本地测试：`.dev.vars` 写 `ADMIN_USER="test"` 和 `ADMIN_PASSWORD="随便一个测试密码"`，然后
  `npx wrangler d1 migrations apply aurelle-crm --local --persist-to /tmp/aurelle-d1`、
  `npx wrangler dev --persist-to /tmp/aurelle-d1`（本地数据库一定要放在网站目录外面，否则每次写数据都会让开发服务器重新加载）。

## 加照片（强烈建议）
把 Jessica 的照片存成 `jessica.jpg`（竖版，4:5）放进这个文件夹，然后在 `index.html` 里把
`<span class="mono">J</span>` 换成 `<img src="jessica.jpg" alt="Jessica">`。
