# 界面预览

已有后端运行时，直接打开：

- 演示模式：`http://127.0.0.1:46606/?mock=1`
- 正常模式：`http://127.0.0.1:46606/`

也可以在浏览器打开本目录的 `index.html`，在文件地址末尾加上 `?mock=1`，离线预览。

演示默认显示修改金额页。页面底部有场景下拉框和前后切换按钮，涵盖 61 个场景，包括所有文档中的 stage、hint、任务错误和 HTTP 409 错误，以及网段不一致、网段未知、程序未运行、退出完成和退出受阻。电源提示出现时，面板固定在底部，仍可切换。按钮仅改变假数据；演示不会调用 fetch、轮询后端或发送 API 请求。阶段由场景面板手动推进，便于逐个验收。

第三轮调整：

- 首次打开默认英文，不读取浏览器语言。右上角下拉框支持 English、简体中文、繁體中文、日本語、한국어、Español、Português (Brasil)、Deutsch、Français、Русский。选择保存到 localStorage 的 `gta6-save-editor.language`，无效值回退英文；存储不可用时仍可在当前页面切换。
- 全部界面文案、错误、演示场景、免责声明和页面标题均本地化。存档 `subtitle` 保持游戏原文；真实后端的主机名、诊断详情和日志保持原文。语言下拉选项使用各语言自己的名称。金额固定采用 `en-US` 千分位。
- Quit 先确认再 POST `/api/quit`；成功（包括无 JSON 的 204 响应）显示退出完成并停止状态轮询。409 `busy` 显示传输中不能退出；失败不误报成功，可重试。演示中只模拟退出和 busy。
- 页脚从 `/api/state.version` 读取版本，未知时显示破折号。
- 连续 3 次轮询失败显示程序未运行、请重新打开的提示，替换等待动画和任务控件。GET 每次最多等待 5 秒；断线期间继续只读检查，服务恢复后页面恢复。
- 长文案允许换行；菜单、按钮、步骤条和网格可收缩；电源键文字移出固定 SVG 区域。电源提示内也可切换语言和退出。

第二轮调整：正文 16px、次要说明至少 14px、金额 22px（窄屏 20px），主内容占满原左右栏宽度，主机信息缩为一行。中英文标题和说明改为直接的操作文案。电源提示聚焦对话框容器，不再给标题显示焦点方框，保留按钮焦点描边与 Tab 循环。

`console.sameSubnet === false` 时，连接、下载和传回步骤显示网络警告，传回按钮和传回重试均禁用；提交入口也会拦截。下载和配对不受此字段限制。`true`、`null` 或字段缺失时不显示警告。页面会随状态轮询更新提示和按钮。

正常模式每次读取结束约 1 秒后再 GET `/api/state`，界面步骤来自返回状态。为避免打开页面就触发真实后端，网络检测与主机搜索改为点击触发；没有自动 POST。正常模式的操作按钮会调用真实 POST 接口，只有实际准备操作主机时才使用。

## 文件

- `index.html`：页面入口，仅引用本地静态资源。
- `styles.css`：响应式布局、配色和原创主机示意样式。
- `i18n.js`：中文、英文文案字典。
- `locales.js`：另外 8 种语言的完整字典，以及第三轮新增文案、语言列表。
- `ps5-paths.js`：各语言的 PS5 菜单路径和未确认按钮名的英文括注。
- `mock.js`：演示数据与完整场景集合。
- `app.js`：状态渲染、金额编辑、请求与演示隔离。
- `selftest.cjs`：不依赖第三方包的 Node 自检。

## 自检

在项目根目录执行：

```text
node ui/selftest.cjs
node --check ui/app.js
node --check ui/mock.js
node --check ui/i18n.js
node --check ui/locales.js
node --check ui/ps5-paths.js
```

自检使用内存中的 DOM 测试替身及拦截后的 fetch，不连接任何服务。检查 61 个场景 × 10 种语言的 HTML 标签结构、JS 解析、完整 key 集合、非空翻译、渲染文本、版本号、表单、场景切换、金额校验、传输保护、倒计时和正常模式加载时只发 GET。还检查网段保护、焦点循环、语言持久化、存储不可用、默认英文、退出取消/成功/busy/失败/重复点击，以及首次与运行中断线、恢复和退出后停止轮询。

中文残留检查排除原样保留的游戏标题和语言选项自称。非中日语言禁止界面文字中出现汉字；日语允许正常日文汉字，并检查是否误用了中文句子。此检查不替代母语审校。测试中的 POST 只进入内存函数，没有网络连接能力。

本轮未进行真机配对、下载、修改、上传、恢复或退出操作，未向真实后端发送请求；未完成浏览器截图、实际布局、各语言 PS5 系统和读屏软件验收。浏览器的新建页面、读取现有页面操作被工具审批机制拒绝（要求批准，而当前策略为 never），没有启动替代浏览器或服务进程。

电源倒计时是参考时间：API 不提供阶段开始时间，所以从当前页面首次观察到 `needPower` 起估算约 5 分钟；刷新后重新估算，最终超时以服务状态为准。

## PS5 术语来源及未确认项

2026-11-23 对照以下 PlayStation 官方区域支持页核对菜单词语。页面本身不加载这些网址或任何外部资源。

| 语言 | 数据传输 | 保存数据管理 |
|---|---|---|
| English | [官方说明](https://www.playstation.com/en-us/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/en-us/support/hardware/ps5-manage-storage-space/) |
| 简体中文 | [官方说明](https://www.playstation.com/zh-hans-cn/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/zh-hans-cn/support/hardware/ps5-manage-storage-space/) |
| 繁體中文 | [官方说明](https://www.playstation.com/zh-hant-tw/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/zh-hant-tw/support/hardware/ps5-manage-storage-space/) |
| 日本語 | [官方说明](https://www.playstation.com/ja-jp/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/ja-jp/support/hardware/ps5-manage-storage-space/) |
| 한국어 | [官方说明](https://www.playstation.com/ko-kr/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/ko-kr/support/hardware/ps5-manage-storage-space/) |
| Español | [官方说明](https://www.playstation.com/es-es/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/es-es/support/hardware/ps5-manage-storage-space/) |
| Português (Brasil) | [官方说明](https://www.playstation.com/pt-br/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/pt-br/support/hardware/ps5-manage-storage-space/) |
| Deutsch | [官方说明](https://www.playstation.com/de-de/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/de-de/support/hardware/ps5-manage-storage-space/) |
| Français | [官方说明](https://www.playstation.com/fr-fr/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/fr-fr/support/hardware/ps5-manage-storage-space/) |
| Русский | [官方说明](https://www.playstation.com/ru-ru/support/hardware/transfer-games-saved-data-ps4-ps5/) | [官方说明](https://www.playstation.com/ru-ru/support/hardware/ps5-manage-storage-space/) |

未确认各语言最后一个 Start Transfer 按钮的系统原文，因此保留英文并加当地语言括注。删除路径沿用本轮要求的 Console Storage → Delete 层级；当前官方支持页已有合并的 Upload or Delete from Console Storage 入口，尚未真机确认本项目所用固件的层级。路径中的本地化菜单词取自对应官方说明，实际层级差异仍待负责人用 PS5 确认。
