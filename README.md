# GTA6 Save Editor

Edit the money in your GTA VI story-mode save on PS5. No jailbreak needed. Free and open source.

Unofficial tool. Not affiliated with Rockstar Games or Sony.

[中文说明](#中文说明)

## What it does

- Downloads your GTA VI save from the PS5 to your PC over your home network.
- Shows your bank balance and cash, and lets you change them.
- Sends the edited save back to the PS5.
- Backs up the original save every time, with one-click restore.

Works on current PS5 firmware (tested on 14.23). Single-player story mode only.

## Requirements

- Windows 10 or 11
- A PS5 with GTA VI (PPSA01547 or PPSA38500)
- PC and PS5 on the same router
- Internet connection

## How to use

1. Download the latest release, unzip it, and run `GTA6SaveEditor.exe`. Your browser opens the app.
2. Allow it through Windows Firewall when asked. The PS5 needs to reach your PC.
3. Follow the four steps on screen: **Connect → Download → Edit → Send back**.

### First time: pair your PS5

You only do this once per console.

1. In the app, pick your PS5 and click **Start pairing**.
2. On the PS5, go to **Settings → System → System Software → Data Transfer**.
3. Select **GarlicTransfer Pairing** in the list.
4. The PS5 says it cannot transfer data. This is expected. Check the app: it shows that pairing is done.

Things to know before you start:

- Save in game first, then go back to the PS5 home screen.
- When the app asks, press the power button on the console once and release at the beep. The console restarts into transfer mode. This is expected.
- Before sending the save back, delete the GTA VI save on the PS5. The PS5 does not overwrite an existing save. Your original is already backed up on the PC.
- Money is capped by the game. In chapter 2 the cap was 85,000 in the bank and 20,000 in cash. The cap goes up later in the story. Anything above the cap is reduced when you load the save.
- If a balance is 0, it does not exist in the save and cannot be edited. Get some money in game, save, and try again.
- Close GarlicTransfer if it is running. Both use the same ports.

## Languages

English (default), 简体中文, 繁體中文, 日本語, 한국어, Español, Português (Brasil), Deutsch, Français, Русский.

## How it works

PS5 saves are encrypted, and the key stays on the console. This tool uses the PS5's built-in Data Transfer feature to move the encrypted save to your PC, then uses the [GarlicSaves](https://garlicsaves.com) service to decrypt and re-encrypt it. A copy of your save is uploaded to that service for this step. The money edit itself runs on your PC.

The transfer protocol code in `vendor/poc` comes from [GarlicTransfer](https://github.com/earthonion/GarlicTransfer) by earthonion.

## Run from source

```
pip install -r requirements.txt
python engine/main.py --open
```

Build the Windows package with `build.bat` (needs `pip install pyinstaller`).

| Path | What |
|---|---|
| `engine/` | Local service, save editing, GarlicSaves client |
| `vendor/poc/` | GarlicTransfer v0.3.7 transfer code, unmodified |
| `ui/` | Web UI (static files) |
| `docs/API.md` | Local API reference |

## Risks

Editing saves can break them. Keep the backup. Use it on your own single-player save only. You are responsible for what you do with it.

## License

GPL-3.0. See `LICENSE`.

---

## 中文说明

修改 PS5 版《GTA VI》剧情模式存档里的钱。主机不需要越狱。免费、开源。

非官方工具，与 Rockstar Games、Sony 无关。

### 功能

- 通过家里的局域网，把 PS5 上的 GTA VI 存档下载到电脑。
- 显示活期和现金，可以直接修改。
- 把改好的存档传回 PS5。
- 每次自动备份原档，可以一键恢复。

支持最新的 PS5 系统（已在 14.23 上测试）。仅限单机剧情模式。

### 需要什么

- Windows 10 或 11
- 一台装有 GTA VI 的 PS5（PPSA01547 或 PPSA38500）
- 电脑和 PS5 连同一个路由器
- 能上网

### 怎么用

1. 下载最新版本，解压，运行 `GTA6SaveEditor.exe`，浏览器会自动打开界面。
2. Windows 防火墙弹窗时选择允许。PS5 需要连到你的电脑。
3. 按界面上的四步操作：**连接 → 下载 → 修改 → 传回**。

#### 第一次使用：先配对

每台主机只需要配对一次。

1. 在修改器里选好你的 PS5，点「开始配对」。
2. 在 PS5 上进入 **设定 → 系统 → 系统软件 → 数据传输**。
3. 在列表里选择 **GarlicTransfer Pairing**。
4. PS5 会提示“无法传输数据”，这是正常的。回到修改器，界面显示配对成功即可。

开始前请注意：

- 先在游戏里存档，再退回 PS5 主画面。
- 界面提示时，按一下主机机身上的电源键，听到“滴”一声就松手。主机会重启进入传输模式，这是正常的。
- 传回之前，先删除 PS5 上的 GTA VI 存档。PS5 不会覆盖已有的存档。原档已经备份在电脑上。
- 游戏对金额有上限。第二章时活期上限 85,000，现金上限 20,000，剧情越往后上限越高。超过上限的部分读档后会被扣回。
- 余额为 0 的项目在存档里不存在，改不了。先在游戏里拿到一点钱，存档后再试。
- 如果开着 GarlicTransfer，请先关掉。两者用同样的端口。

### 原理

PS5 的存档是加密的，密钥在主机里。本工具用 PS5 自带的「数据传输」功能把加密存档搬到电脑，再通过 [GarlicSaves](https://garlicsaves.com) 服务解密和重新加密。这一步会把存档副本上传到该服务。改钱本身在你的电脑上完成。

`vendor/poc` 里的传输协议代码来自 earthonion 的 [GarlicTransfer](https://github.com/earthonion/GarlicTransfer)。

### 风险

修改存档可能导致存档损坏，请保留备份。只用于你自己的单机存档。使用后果自行承担。

### 许可

GPL-3.0，见 `LICENSE`。
