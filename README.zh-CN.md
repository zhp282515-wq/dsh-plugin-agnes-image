# dsh-plugin-agnes-image

[DeepSeek Harness](https://github.com/deepseek-ai)（dsh）的 Agnes 生图插件：
一个给模型直接调用的 `agnes_image` 工具，外加一个设置页里的可视化控制台。

一个包，两半：

- **宿主半边** —— 注册 `agnes_image` 工具，并提供一小套仅监听本机的 HTTP 接口
  （设置、Key 管理、历史、生成）。
- **浏览器半边** —— 在「设置 → Agnes Image」里加一个分区，内嵌宿主半边提供的控制台页面。

零运行时依赖：只用 Node 内建模块 + 全局 `fetch`，要求 Node ≥ 22。

| | |
| --- | --- |
| 上游接口 | `POST https://apihub.agnes-ai.com/v1/images/generations` |
| 模型 | `agnes-image-2.5-flash`（默认）、`agnes-image-2.1-flash`、`agnes-image-2.0-flash` |
| 能力 | 文生图、图生图、多图合成 |
| 费用 | 撰写时全部档位与参考图免费 |

![Agnes Image 控制台](docs/console.zh-CN.png)

## 你得到什么

**一、工具。** 模型调用 `agnes_image`，拿回一个真实落盘的 PNG，以及一份可以继续处理的 JSON。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `prompt` | string | ✅ | 好用的结构：主体 + 场景 + 风格 + 光照 + 构图 + 质量要求 |
| `size` | string | | 档位：`1K` / `2K` / `3K` / `4K`，默认 `2K` |
| `ratio` | string | | `1:1` `3:4` `4:3` `16:9` `9:16` `2:3` `3:2` `21:9`，默认 `1:1` |
| `model` | string | | 单次覆盖已配置的模型 |
| `images` | string[] | | 参考图（图生图 / 多图合成）。本地绝对路径、`http(s)://` 或 `data:` URI |
| `out` | string | | 输出绝对路径。省略则写入配置目录，文件名 `agnes-<时间戳>-<提示词摘要>.png` |

返回 `{ ok, path, url, bytes, model, size, ratio, nativePixels, prompt, revisedPrompt, keySource }`，
并由 `output.render` 生成一段带 Markdown 图片引用的、给模型阅读的摘要。

**二、控制台。** 「设置 → Agnes Image」：

| 分区 | 作用 |
| --- | --- |
| 当前模型 | 选择工具默认使用哪个图像模型 |
| 默认参数 | 档位 + 画幅，并实时预览原生像素尺寸 |
| 输出 | 图片落盘目录，以及「打开文件夹」 |
| API 密钥 | 掩码指纹与来源；替换或清除已存 Key；测试连通性；跑一次真实生成来验证 |
| 高级 | 超时、重试次数、接口地址覆盖、历史开关 |
| 提示词预设 | 保存、复用、删除提示词模板 |
| 生成 | 完整工作台：预设、提示词、档位、画幅、模型、参考图上传、结果预览 |
| 历史记录 | 所有生成结果的缩略图画廊（工具调用的和控制台生成的都在内） |

控制台**中英双语**，用顶栏里的语言选择器切换。设置页的分区标签跟随 dsh 外壳自己的语言，
所以分区会显示成 *Agnes Image* 或 *Agnes 生图*。`跟随界面`（默认）指「先跟外壳、再跟浏览器」；
显式选 `English` 或 `中文` 会固定下来，并在重启后保留。

<details>
<summary>English console</summary>

![English console](docs/console.png)

</details>

所有改动**下一次生成立即生效**，无需重启、无需重新挂载。插件在每次调用时实时合并配置，
优先级从高到低：操作者在补丁层写的 `config` → 控制台保存的设置 → 内置默认值。

## 安装

本包没有发布到 npm，作为本地插件接进某个 dsh profile：

```bash
# 1. 克隆到任意位置
git clone <本仓库> /path/to/dsh-plugin-agnes-image

# 2. 链接进 dsh 实际运行的那个 profile
cd ~/.dsh/profiles/desktop          # 换成你用的 profile
pnpm add "link:/path/to/dsh-plugin-agnes-image"
```

`link:` 必须写绝对路径。Windows 跨盘根本写不出相对路径，所以常见写法是
`link:D:/dsh-plugin/dsh-plugin-agnes-image`。不想用 pnpm 的话，目录联接（junction）同样可行：

```powershell
New-Item -ItemType Junction `
  -Path "$HOME\.dsh\profiles\desktop\node_modules\dsh-plugin-agnes-image" `
  -Target "D:\dsh-plugin\dsh-plugin-agnes-image"
```

**3. 登记 bundle。** 只做链接是不够的。打开该 profile 的 `package.json`，
把包名追加进 `dsh.profile.bundles`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-plugin-agnes-image"
      ]
    }
  }
}
```

链接了但没写进 `dsh.profile.bundles` 的包永远不会加载，而且 dsh 不会告诉你原因。

**4. 重启一次 dsh。** 之后宿主半边可以自行热重载，但浏览器半边是在启动时组装进 boot graph 的
（见「踩过的坑」）。

### 卸载

从 `dsh.profile.bundles` 里删掉，移除依赖，再删链接。Windows 上删 junction 要用
`cmd /c rmdir <链接>` —— **不要**用 `Remove-Item -Recurse`，它会穿透链接删掉你的源码。

## API Key

`lib/agnes.js` 的解析顺序：

1. 插件 config 里显式传入的 `apiKey`
2. 环境变量 `AGNES_AI_API_KEY`，其次是 `AGNES_API_KEY`
3. config 指定的 key 文件
4. 按顺序第一个存在的默认 key 文件：
   - `~/.dsh/agnes_key.txt`
   - `~/.agnes/api_key.txt`

key 文件是纯文本，首尾空白会被裁掉。启动时插件会打印
`[agnes-image] API key source: …` —— 只打印来源，永不打印 key。

控制台可以代你把 key 写入文件（权限 `0600`），但**永远不会把 key 读回页面**：
`GET /agnes-image/state` 只返回掩码指纹（`sk-Wsd********J8FR`）和来源描述，仅此而已。

> **别把 key 提交进仓库。** `.gitignore` 已经排除了 `agnes_key.txt` 和 `.env`。
> 上游也是同样的要求：不要把 API Key 放进公开仓库、前端代码或截图。

不想改任何文件时，设置环境变量 `AGNES_AI_API_KEY` 后重启 dsh 即可覆盖。

## HTTP 接口

控制台就是一个普通网页配普通接口，所以它能做的一切都可以脚本化：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/agnes-image/state` | 控制台启动所需的全部数据：设置、Key 状态、模型目录 |
| `POST` | `/agnes-image/settings` | 打补丁式更新设置，返回新状态 |
| `POST` | `/agnes-image/key` | 写入或清除 API Key |
| `POST` | `/agnes-image/test` | `{mode:"auth"}` 列模型；`{mode:"generate"}` 真跑一次生成 |
| `POST` | `/agnes-image/generate` | 生成，并追加进历史 |
| `POST` | `/agnes-image/upload` | 暂存参考图 |
| `GET` | `/agnes-image/history` | 历史，最新在前 |
| `POST` | `/agnes-image/history/clear` | 清空历史（不动磁盘上的图片） |
| `GET` | `/agnes-image/image?path=…` | 回传生成的图片 |
| `POST` | `/agnes-image/reveal` | 用系统文件管理器打开输出目录 |
| `GET` | `/agnes-image/console` | 控制台页面本身 |
| `GET` | `/agnes-image/console.css`、`/agnes-image/console.js` | 它的静态资源 |

这些路由**不继承** dsh 自己 `/api` 的同源防护（exact 匹配会赢过它的 prefix），
所以插件自己实现检查：`Host` 必须是环回地址，`sec-fetch-site: cross-site` 一律拒绝，
存在 `Origin` 时必须与 `Host` 完全一致。缺失 `Origin` 是允许的，这样 `curl` 和脚本仍可用。
另外 `GET /agnes-image/image` 只允许配置的输出目录之内、或历史记录中出现过的路径，
所以这个路由变不成任意文件读取。

```bash
curl -s http://127.0.0.1:19387/agnes-image/state

curl -s -X POST http://127.0.0.1:19387/agnes-image/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"一盏红纸灯笼悬在静止的黑水之上","size":"1K","ratio":"16:9"}'
```

## 目录结构

```
dsh-plugin-agnes-image/
├── package.json          dsh.bundle.patch 与 dsh.client 是两个关键字段
├── cordis.patch.yml      bundle 层：一条纯 insert，写上行名
├── lib/
│   ├── index.js          插件入口：apply(ctx, config) → ctx.tools.register(…)
│   ├── agnes.js          纯客户端：key 解析、请求、重试、下载、落盘
│   ├── settings.js       默认值、校验、原子持久化
│   ├── history.js        JSONL 生成日志
│   └── routes.js         HTTP 接口，含同源防护
├── client/index.js       浏览器半边：只注册一个 settings.section
├── console/              控制台页面：纯 HTML / CSS / DOM，无构建步骤
│   └── tokens.css        dsh 自己的设计 token，让控制台看起来是原生的
├── test/                 node --test，不联网
└── scripts/              手动执行、会打真实接口的冒烟脚本
```

### 为什么控制台是个 iframe

浏览器半边本来可以写成一个原生 React 面板。它现在只是注册一个 `settings.section` 槽位、
渲染一个 `<iframe>`，原因有三：

- **打包版 dsh 对第三方客户端 bundle 没有 HMR。** 浏览器半边每改错一次就要重启整个应用，
  所以这一半被压到尽可能小，真正的界面放在可以随时刷新的地方。
- 槽位本身只依赖 `react`。不依赖 client store、不依赖 UI-primitives 的组件签名、
  也不依赖会在版本间漂移的样式约定。
- 它就是一个普通 URL：可以在标签页里打开、刷新，开发时还能用无头浏览器截图。

### 为什么控制台长得像设置页

它穿的是 dsh 自己的设计 token，而不是自带的配色，所以看起来就是设置面板里的又一个分区，
而不是一个外挂网页。

`console/tokens.css` 是宿主 `--dsw-static-*` 调色板与浅色/深色两套 `--dsw-alias-*` 别名的
逐字副本。`console.css` 把一套简短的内部变量（`--bg`、`--panel`、`--text`、`--accent` …）
映射到这些别名上，于是整页换肤只改一个块。布局不依赖任何具体颜色；单列满宽卡片意味着
没有卡片会被挤在更矮的邻居旁边，也不会被吸顶元素盖住。

页面被嵌入时，`console.js` 会从宿主文档重新读一遍这些 token 并覆盖副本，所以之后被重新
配色的 dsh 会连带把控制台一起换掉。这个同步用的是一份白名单（只含样式表真正消费的 token）
——固定清单不会顺手捎上某个无关属性把整页刷成别的样子。

## 踩过的坑

- **`response_format` 必须放在 `extra_body.response_format`。** 放请求体顶层会被拒；
  上游文档对此有明确警告。
- **图生图走 `extra_body.image`**（字符串数组）。**不要**传 `tags: ["img2img"]`。
- **优先传档位而不是精确像素。** `1920x1080`、`2560x1440` 不是原生尺寸，会被标准化
  （通常落到 16:9 的 1K `1312x736`）。应该请求 `size:"2K"` + `ratio:"16:9"` 再在下游裁剪。
  返回里的 `nativePixels` 会告诉你接口实际给了什么。
- **`agnes-image-2.0-flash` 其实也接受 `size` + `ratio`**，尽管它的文档只列了 `size`
  并只给精确像素示例。已实测：1K/16:9 生成后读 PNG 头，得到 `1312x736`。
- **重试**覆盖 `408 409 425 429 500 502 503 504`，指数退避
  `min(1500 × 2^(n-1), 30s)`；其余状态码是明确答复，不重试。
- **`revisedPrompt` 在这个接口上恒为空字符串**，不要依赖它。
- **打包版 dsh 里第三方客户端 bundle 无法热重载。** HMR 只在 dsh 从源码 checkout 跑、
  且有 `pnpm run dev:web` 在监听时才存在。新增或修改 `dsh.client` 需要重启。
- **不要 import `@deepseek-ai/dsh-settings`。** 在 0.2.0-rc.2 上这个服务既没有
  `settings.register(namespace, …)` 也没有 `settings.get(namespace)`；模块级缺失导出会直接
  杀掉整个插件加载。设置改走插件私有存储：`~/.dsh/agnes-image/settings.json`，
  原子写（临时文件 + `fsync` + `rename`），权限 `0600` —— 这也是本机上每个第三方插件
  实际都在用的做法。
- **同一个值绝不要混用两条持久化路径。** 宿主的 config schema / 补丁层与插件私有存储
  是两个写入者，会互相覆盖。
- **浏览器半边只能用相对 URL。** 环回端口是随机的（`--port 0`），每次重启都变，
  所以任何东西都不能按 origin 记忆。
- **槽位注册里的 `label` 是函数**，每次投影都会重读，不是字符串。

## 开发

```bash
node --test test/*.test.mjs          # 54 项测试，不联网，不需要 dsh
```

测试覆盖的都是「出错时要么静默、要么危险」的部分：同源防护、设置的校验与往返、
历史对损坏行的容忍、原生像素表自身的自洽性，以及浏览器半边的 loader 信封与槽位注册
（在 `vm` 里配一个桩外壳执行）。

`test/i18n.test.mjs` 值得单独说一句：它把 `console.js` 当文本读，一旦出现漏译、
只有 `en` 没有 `zh` 的键、某一语言多出或少掉 `{placeholder}`、没人引用的死条目，
或者**藏进字符串字面量 / CSS `content:` 里的用户可见句子**，就让构建失败。
最后两类真的发过一次，是靠肉眼看截图发现的——这种 review 不该靠人工。

冒烟测试会打真实接口，手动执行：

```bash
node scripts/smoke-text-to-image.mjs
node scripts/smoke-image-to-image.mjs <reference.png>
node scripts/smoke-tool.mjs
```

迭代控制台时**完全不必启动 dsh**：这个页面由插件自己的路由提供，可以独立跑，
并且读写的就是同一份设置文件：

```bash
node scripts/preview-console.mjs               # http://127.0.0.1:8791/agnes-image/console
node scripts/preview-console.mjs --port 9000
```

然后截图：

```bash
chrome --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1500,1420 --virtual-time-budget=9000 \
  --screenshot=console.png "http://127.0.0.1:8791/agnes-image/console?theme=dark&lang=zh"
```

`?theme=light|dark` 覆盖配色；不带则跟随操作系统。宿主内嵌该页面时会把外壳主题传进去，
因为在 iframe 里 `prefers-color-scheme` 跟的是操作系统而不是应用。`?lang=en|zh` 同理，
但只在保存的偏好是「跟随界面」时生效——显式选择永远压过外壳的提示。

## 许可

MIT —— 见 [LICENSE](LICENSE)。

---

[English](README.md)
