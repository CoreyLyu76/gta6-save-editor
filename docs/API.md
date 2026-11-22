# 本地服务接口

服务地址 `http://127.0.0.1:46606`（`engine/app.py`）。UI 是 `ui/` 下的静态文件，由同一个服务托管，所以请求都用相对路径。
只接受来自本机页面的请求；POST 一律 `Content-Type: application/json`。

UI 的工作方式：**每秒轮询一次 `GET /api/state`，按返回内容渲染**；用户点按钮时发一个 POST。所有耗时操作都是后台任务，POST 立刻返回，进度看 `state.job`。

## GET /api/state

```jsonc
{
  "console": {"host": "192.168.1.20", "name": "PS5-123", "hostId": "AABBCCDDEEFF", "firmware": "14230000",
              "sameSubnet": true} | null,   // false = 电脑和主机不在同一网段：下载能通，但传回时主机搜不到电脑
  "paired": true,                // 这台主机是否已配对
  "network": {"ok": true, "proxy": true} | null,   // 调过 /api/network 才有
  "hasSession": true,            // 已经下载过存档
  "user": {"id": "1a2b3c4d", "name": "..."} | null,
  "title": "PPSA01547",
  "readyToUpload": false,        // 传输库里有待传回的修改
  "slots": [                     // 剧情存档槽，下载后才有
    {
      "file": "sdimg_SAVEDATASARC0001",
      "subtitle": "偷欢快感",     // 存档在主机上显示的标题（任务名）
      "revision": "…",           // 越大越新，可用来标“最新”
      "items": [                 // 这个存档里的每一笔钱
        {"inv": 0, "idx": 329, "kind": "bank",  "value": 5000},
        {"inv": 0, "idx": 303, "kind": "cash",  "value": 20000},
        {"inv": 0, "idx": 332, "kind": "other", "value": 5000}
      ],
      "ledger": {"amount": -30000, "balance": 5000} | null,
      "modified": false,
      "changes": [{"kind": "bank", "from": 5000, "to": 8000000}]
    }
  ],
  "version": "0.1.0",            // 程序版本，页脚显示
  "job": {
    "id": 3, "kind": "download",          // pair | download | patch | restore | upload
    "status": "running",                  // idle | running | done | error
    "stage": "need_power",                // 见下表
    "needPower": true,                    // true 时提示用户去按主机电源键
    "progress": {"files": 2, "total": 5} | null,
    "hint": "console_has_save" | null,
    "error": {"code": "no_gta_save", "detail": "..."} | null,
    "log": [{"t": 1795400000.1, "m": "..."}]     // 最近 40 行，给“查看详情”用
  }
}
```

`items[].kind`：`bank` 活期、`cash` 现金、`other` 未识别的钱类项目（默认不建议改）。
`cash` 可能有两笔，`inv` 不同代表两个主角（`inv` 0 和 1），游戏内谁是谁目前没有对应表，界面写「角色 1 / 角色 2」。
余额为 0 的项目在存档里不存在，不会出现在列表里。

## POST 接口

| 路径 | 请求体 | 作用 |
|---|---|---|
| `/api/network` | 无 | 测 GarlicSaves 是否连得上，返回 `{ok, proxy}` |
| `/api/discover` | 无 | 搜局域网里的 PS5，返回 `{consoles:[{host,name,hostId,firmware}]}`，约 3 秒 |
| `/api/console` | `{"host":"192.168.x.x"}` | 选定主机（也可手输 IP），返回最新 state |
| `/api/pair` | 无 | 启动配对任务（只需做一次） |
| `/api/download` | 无 | 启动下载任务：下载 GTA6 存档 → 备份 → 解密 → 读出金额 |
| `/api/patch` | `{"slot":"sdimg_SAVEDATASARC0001","changes":[{"inv":0,"idx":329,"value":5000,"newValue":85000}]}` | 改金额 → 加密 → 放入传输库。`value` 必须是 state 里的旧值 |
| `/api/restore` | 无 | 把原档放回传输库（之后再 upload 就是恢复） |
| `/api/upload` | 无 | 启动上传任务，等主机来取 |
| `/api/cancel` | 无 | 中止当前任务 |
| `/api/quit` | 无 | 退出程序（界面上的「退出」按钮用）。传输进行中会返回 409 `busy` |

失败返回 HTTP 409 `{"error":"<code>","detail":"…"}`，常见：`busy`（有任务在跑）、`no_console`、`no_session`、`nothing_to_upload`。

## job.stage

| kind | stage | 用户此刻该看到什么 |
|---|---|---|
| pair | `pair_waiting_console` | 去 PS5：设定 → 系统 → 系统软件 → 数据传输，选「GarlicTransfer Pairing」。屏幕提示“无法传输数据”是正常的 |
| pair | `pair_reading` / `paired` | 正在读取 / 配对成功 |
| download | `connecting` | 正在连接主机 |
| download | `need_power`（`needPower:true`） | **按一下 PS5 机身电源键，“滴”一声就松手**。主机会重启进传输模式。约 5 分钟内要按 |
| download | `reading_list` → `downloading`（`progress.files`） | 正在读取 / 下载第 N 个文件 |
| download | `decrypting` → `ready` | 正在解密 / 可以改了。完成后主机会自动重启一次 |
| patch | `patching` → `encrypting` → `importing` → `ready_to_upload` | 正在生成 / 加密 / 已就绪 |
| upload | `preparing` → `waiting_console` | **先删掉 PS5 上的 GTA6 存档**，再进 设定 → 系统 → 系统软件 → 数据传输，选「GTA6 Save Editor」并开始传输 |
| upload | `waiting_console` 且 `hint:"console_has_save"` | 主机说“没有数据可传输”：主机上还留着旧存档，删掉后再进一次数据传输 |
| upload | `console_connected` → `transferring`（`progress.files/total`） | 主机已连上 / 正在传。**此时不能取消或关程序** |
| upload | `uploaded` | 传完了，主机重启后进游戏读档 |

## job.error.code

| code | 含义 | 建议文案方向 |
|---|---|---|
| `garlic_unreachable` | 连不上解密服务 | 检查网络/代理后重试 |
| `not_paired` | 还没配对 | 引导去配对 |
| `power_timeout` | 等电源键超时，或密钥服务太慢 | 让主机回到主画面（必要时重启主机）后重试 |
| `console_rejected` | 主机拒绝了请求 | 确认登录的是配对时的账号，或重新配对 |
| `no_gta_save` | 主机上没有 GTA6 存档 | 先在游戏里存一次档 |
| `no_story_slot` | 没找到剧情存档槽 | 同上 |
| `pair_failed` | 配对失败或超时 | 重试 |
| `save_layout_changed` / `save_verify_failed` / `save_stale_item` | 存档结构对不上（游戏可能更新了）或页面数据过期 | 重新下载；仍失败说明工具需要更新 |
| `no_change` | 没有任何金额变化 | — |
| `port_in_use` | 1004–1006 端口被占（多半是开着 GarlicTransfer） | 关掉 GarlicTransfer 后重试 |
| `upload_failed` / `download_failed` / `tool_failed` / `internal` | 其他失败 | 显示 detail，提供“查看日志” |
