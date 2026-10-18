# Aurelle Pilates 网站

线上地址：https://pilates.venso.com （DNS 生效前可用 https://fungungun.github.io/aurelle-pilates/ 预览）
中文版直接链接：`https://pilates.venso.com/?lang=zh` （适合发微信、小红书）

## 文件
| 文件 | 作用 |
|---|---|
| `config.js` | **平时只改这个**：预约链接、电话、邮箱、Instagram、ABN、老师资质、创始学员优惠开关 |
| `index.html` | 页面本身（文案、价格都在这里，中英文成对写在 `data-l="en"` / `data-l="zh"` 里） |
| `favicon.svg` | 浏览器标签图标 |
| `CNAME` | 自定义域名 pilates.venso.com |

## 接上预约
1. 按 `04-运营/06-经营方案.md` 第 5 节建好 Google Calendar 预约页。
2. 把「首次体验课」预约页链接填进 `config.js` 的 `bookingFirst`，「老学员私教课」填进 `bookingRegular`。
3. 发布（见下面）。网站上「在线预约即将开放」的卡片会自动换成可以直接选时间的日历。

## 改完后发布
在终端里运行：
```
cd ~/Documents/pilates/06-网站
git add -A && git commit -m "更新网站" && git push
```
1–2 分钟后线上生效。

## 加照片（强烈建议）
把 Jessica 的照片存成 `jessica.jpg`（竖版，4:5）放进这个文件夹，然后在 `index.html` 里把
`<span class="mono">J</span>` 换成 `<img src="jessica.jpg" alt="Jessica">`。
