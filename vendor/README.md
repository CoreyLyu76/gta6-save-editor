# vendor/poc

From [GarlicTransfer](https://github.com/earthonion/GarlicTransfer) v0.3.7 by earthonion, GPL-3.0.
The Python files are unmodified, except for macOS-only changes. Windows behaviour is the same as upstream.

- `dt_pair.py`: on macOS the pairing listener binds to `0.0.0.0`, because a normal user can bind ports below 1024 only on the wildcard address there.
- `dt_source.py`: when `DT_CONSOLE_IP` is set (the app sets it on macOS only), the source keeps sending its discovery answer to the console without waiting for the console's search broadcast. On Wi-Fi a Mac often receives only part of that broadcast, or none, and the PS5 then does not list the Mac. On macOS the discovery socket is bound without `SO_REUSEADDR`, and the data port opens when the PS5 connects.

 The `local_worker` folder (helper payload for jailbroken consoles) is not included because this project does not use it.

These files implement the PS5 Data Transfer protocol: discovery, pairing, download and upload.
