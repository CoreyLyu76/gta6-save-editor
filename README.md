# GTA6 Save Editor

Edit the money in your GTA VI story-mode save on PS5. No jailbreak needed. Free and open source.

Unofficial tool. Not affiliated with Rockstar Games or Sony.

[中文说明](#中文说明)

## What it does

- Downloads your GTA VI save from the PS5 to your PC over your home network.
- Shows your bank balance, Family Savings and cash, and lets you change them.
- Raises the BuckMe limits: checking up to 1,985,000 and Family Savings up to 2,000,000, on a save where the game still caps them at 85,000 and 100,000.
- Sends the edited save back to the PS5.
- Backs up the original save every time, with one-click restore.

Works on current PS5 firmware (tested on 14.23). Single-player story mode only.

## Requirements

- Windows 10 or 11, or macOS
- A PS5 with GTA VI (PPSA01547 or PPSA38500)
- PC and PS5 on the same router
- Internet connection

## How to use

1. Download the latest release, unzip it, and run `GTA6SaveEditor.exe` (Windows) or `GTA6SaveEditor.app` (Mac). Your browser opens the app.
2. Allow it through the firewall when asked. The PS5 needs to reach your computer.
   - Mac: also allow access to devices on your local network.
   - Mac: if macOS does not open the app, go to **System Settings → Privacy & Security** and click **Open Anyway**.
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

### How the limits work

In the save, money is an item (`currency_cash`) and its quantity is the amount. The item sits in a money box, and the boxes hang under an account (`bank_checking`, `bank_savings`). Each box has a fixed capacity. The game's "limit" is the total capacity of the boxes you own, so an amount above the capacity is cut back when the save loads.

To go past the limit, the tool adds the three larger boxes (400,000, 500,000 and 1,000,000) under the account and fills them. These boxes exist in the game: Family Savings gets one for each savings goal. Tested on a chapter 2 save on a PS5: Family Savings showed 2,000,000 and checking showed 1,985,000. Cash stays capped at 20,000, the capacity of the wallet.

The tool edits the manual saves and the autosave (`sce_sdmemory`). Edit the one you load in the game.

## Run from source

```
pip install -r requirements.txt
python engine/main.py --open
```

Build the Windows package with `build.bat` (needs `pip install pyinstaller`).

On Mac, double-click `start.command` to run from source. Build the Mac app with `./build_mac.sh`. The app is built for the CPU of the Mac that builds it.

| Path | What |
|---|---|
| `engine/` | Local service, save editing, GarlicSaves client |
| `vendor/poc/` | GarlicTransfer v0.3.7 transfer code (one line changed for macOS) |
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
- 显示活期、家庭储蓄和现金，可以直接修改。
- 解除 BuckMe 限额：活期最高 1,985,000，家庭储蓄最高 2,000,000（游戏原本把它们卡在 85,000 和 100,000 的存档上实测）。
- 把改好的存档传回 PS5。
- 每次自动备份原档，可以一键恢复。

支持最新的 PS5 系统（已在 14.23 上测试）。仅限单机剧情模式。

### 需要什么

- Windows 10 或 11，或 macOS
- 一台装有 GTA VI 的 PS5（PPSA01547 或 PPSA38500）
- 电脑和 PS5 连同一个路由器
- 能上网

### 怎么用

1. 下载最新版本，解压，运行 `GTA6SaveEditor.exe`（Windows）或 `GTA6SaveEditor.app`（Mac），浏览器会自动打开界面。
2. 防火墙弹窗时选择允许。PS5 需要连到你的电脑。
   - Mac：系统询问是否允许查找本地网络设备时，选择允许。
   - Mac：如果打不开，进入 **系统设置 → 隐私与安全性**，点「仍要打开」。
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

#### 限额是怎么回事

存档里钱是一种物品（`currency_cash`），数量就是金额。它放在「钱箱」里，钱箱挂在账户下面（`bank_checking` 活期、`bank_savings` 家庭储蓄）。每个钱箱容量固定。游戏里的「限额」就是你拥有的钱箱容量之和，金额超过容量，读档时会被压回去。

要超过限额，工具会在账户下面补上三个更大的钱箱（40 万、50 万、100 万）并装满。这些钱箱是游戏里本来就有的：家庭储蓄每完成一个目标就多一个。在 PS5 上用第 2 章存档实测：家庭储蓄显示 2,000,000，活期显示 1,985,000。现金上限仍是 20,000，这是钱包的容量。

工具可以改手动存档，也可以改自动存档（`sce_sdmemory`）。你在游戏里读哪个，就改哪个。

### 风险

修改存档可能导致存档损坏，请保留备份。只用于你自己的单机存档。使用后果自行承担。

### 许可

GPL-3.0，见 `LICENSE`。
