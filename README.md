# Clipline (Linux)

Unofficial **Linux / Wayland (Hyprland) port** of [ClipBoardLine](https://github.com/orkunisitmak/clipboardline), a keyboard-first clipboard history with three shelves (Images, Texts, Links) and a local library.

This project is derived from the MIT-licensed Electron edition of ClipBoardLine (`windows/` folder of the upstream repository). It is **not affiliated with or endorsed by** the ClipBoardLine author. The upstream copyright notice is kept in [LICENSE](LICENSE). The app icon in this repository is an original drawing; it is not the upstream icon.

## What changed from upstream

- The Windows PowerShell bridge was replaced by `lib/native.cjs`, which uses `wl-clipboard` (`wl-paste --watch`), `hyprctl` and `ydotool`.
- Clipboard contents are read with `wl-paste`, because Wayland only gives clipboard data to the focused client (Electron cannot read it in the background).
- File copies are offered as `text/uri-list` through `wl-copy`.
- The Windows installer and signed-update feed are disabled on Linux.

## Status — read this first

Tested on EndeavourOS, Hyprland 0.56, Electron 44, 28 Oct 2026, by driving the running app (its command API, `wl-paste`, `ydotool`, screenshots):

**Works (verified)**

- starts as a Wayland window with the Images / Texts / Links shelves
- capture of links, text and images (text and image capture are off by default; turn them on in Settings)
- OCR on a captured image (Tesseract, English/Turkish data from `node_modules`)
- Library window: pin, folders, tags, name, note, trash and undo, sidebar and inspector
- copy of a text item or a single image back to the clipboard (through `wl-copy`)
- paste into the previous window with Ctrl+Enter: the selected item (not whatever was already on the clipboard) was pasted into a GTK text field (`zenity --entry`) via `ydotool`
- saving an edited image, "copy OCR text", new note, link refresh (the command API accepted them; the editor UI itself was not driven)
- the shelves take keyboard focus when opened through `packaging/clipline`

**Not working**

- offline image search (MobileCLIP): the model files are not part of this repository, the app reports "unavailable"
- screen-recording import and trim (needs a Linux media backend)
- automatic updates (disabled on Linux)
- copying text and an image together: Wayland clipboards via `wl-copy` offer one MIME type, so an image wins over text; several images are copied as a `text/uri-list`
- paste target safety: every window is treated as editable, so paste can reach a password field

**Not tested**

- the image editor UI (crop, markup), preview, drag and drop out of the shelves, export dialogs, tray icon
- settings changes for theme, card size and language (a command-API patch was accepted but the values did not change; the valid values are not documented here)
- "clear unsaved history" (accepted, effect not confirmed)
- the Hyprland key binding (loaded without errors, not pressed for real)
- packaging (no AppImage/AUR package)

**Caveats**

- Terminals paste with Ctrl+Shift+V, so Ctrl+V does not paste there.
- Keyboard input must not be held by another panel: an open `quickshell:sidebarLeft` swallowed all keys during testing.
- Electron cannot register global shortcuts on Wayland: bind a key in Hyprland instead (see below).

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
