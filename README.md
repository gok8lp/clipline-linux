# Clipline (Linux)

Unofficial **Linux / Wayland (Hyprland) port** of [ClipBoardLine](https://github.com/orkunisitmak/clipboardline), a keyboard-first clipboard history with three shelves (Images, Texts, Links) and a local library.

This project is derived from the MIT-licensed Electron edition of ClipBoardLine (`windows/` folder of the upstream repository). It is **not affiliated with or endorsed by** the ClipBoardLine author. The upstream copyright notice is kept in [LICENSE](LICENSE). The app icon in this repository is an original drawing; it is not the upstream icon.

## What changed from upstream

- The Windows PowerShell bridge was replaced by `lib/native.cjs`, which uses `wl-clipboard` (`wl-paste --watch`), `hyprctl` and `ydotool`.
- Clipboard contents are read with `wl-paste`, because Wayland only gives clipboard data to the focused client (Electron cannot read it in the background).
- File copies are offered as `text/uri-list` through `wl-copy`.
- The Windows installer and signed-update feed are disabled on Linux.

## Status — read this first

Verified on EndeavourOS, Hyprland 0.56, Electron 44, 28 Oct 2026:

- starts as a Wayland window with the three shelves
- copied URLs are detected and stored on the Links shelf (`wl-paste --watch`)

**Not verified, or not working:**

- paste into the previous window: **not working yet.** The overlay does not receive keyboard input from `ydotool` even when Hyprland has focused it (Escape and Ctrl+Enter did nothing in testing). Cause unknown; `focus_on_activate = false` in the compositor config makes Electron's own focus request ineffective, so the port now focuses its window with `hyprctl` (partially helps)
- global shortcuts (Electron cannot register them on Wayland — bind a key in Hyprland instead, see below)
- OCR, image search, link enrichment (code is unchanged from upstream, untested on Linux)
- screen-recording import and trim (needs a Linux media backend; currently reports "not available")
- packaging (no AppImage/AUR package yet)
- the macOS-only features of upstream are not part of this port

## Requirements

`nodejs`, `npm`, `wl-clipboard`, Hyprland (`hyprctl`), and optionally `ydotool` for pasting.

## Install

```sh
git clone https://github.com/gok8lp/clipline-linux ~/.local/share/clipline-linux
cd ~/.local/share/clipline-linux
npm install --no-audit --no-fund
node node_modules/electron/install.js   # downloads the Electron binary if npm skipped it
npm start
```

Running `packaging/clipline` a second time opens the shelves of the running instance.

## Hyprland key binding

In your Lua configuration:

```lua
hl.bind("SUPER + CTRL + T", hl.dsp.exec_cmd(os.getenv("HOME") .. "/.local/share/clipline-linux/packaging/clipline"))
```

For pasting, start the daemon first: `systemctl --user start ydotool` (needs access to `/dev/uinput`).

## License

MIT, see [LICENSE](LICENSE) and the third-party notices in `THIRD_PARTY_NOTICES*.md` and `assets/licenses/`. The license text from upstream states that it does not cover the "Tendedero" name or icon; this port uses neither.
