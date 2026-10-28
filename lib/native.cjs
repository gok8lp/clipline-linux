'use strict';
// Linux / Wayland (Hyprland) bridge. It replaces the Windows PowerShell helper
// and exposes the same functions that main.cjs expects:
//   monitor, clipboardSequence, capture, restore, preparePaste, validatePaste,
//   paste, copyImages, cancelPaste, captureDiagnostics, selfTestFocusPolicy.
// External tools: wl-clipboard (wl-paste, wl-copy), hyprctl, ydotool (paste only).
const {spawn, execFile} = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const pasteChildren = new Set();
let sequence = 0;

function hyprctl(args) {
  return new Promise((resolve, reject) => {
    execFile('hyprctl', args, {timeout: 4000, maxBuffer: 1 << 20}, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

// Maps a Hyprland window to the focus snapshot shape that paste-target.cjs accepts.
function snapshot(window) {
  if (!window || !window.address || !Number.isInteger(window.pid) || window.pid <= 0) return null;
  let handle;
  try { handle = BigInt(window.address).toString(); } catch { return null; }
  return {handle, processId: window.pid, runtime: '1', editable: true, secure: false, appClass: String(window.class || '').slice(0, 80)};
}

async function activeWindow() {
  try { return snapshot(JSON.parse(await hyprctl(['activewindow', '-j']))); } catch { return null; }
}

async function windowExists(handle) {
  try {
    const clients = JSON.parse(await hyprctl(['clients', '-j']));
    return clients.some(c => c.mapped && BigInt(c.address).toString() === String(handle));
  } catch { return false; }
}

function addressOf(target) {
  if (!target || typeof target.handle !== 'string' || !/^\d{1,20}$/.test(target.handle)) throw new Error('No application window was captured.');
  return '0x' + BigInt(target.handle).toString(16);
}

async function focusWindow(target) {
  const address = addressOf(target);
  await hyprctl(['dispatch', `hl.dsp.focus({ window = 'address:${address}' })`]);
}

function run(command, args, {input, timeout = 5000} = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {timeout, maxBuffer: 1 << 20}, (error, stdout, stderr) => {
      pasteChildren.delete(child);
      if (error) reject(new Error(`${command} failed: ${String(stderr || error.message).trim().slice(0, 300)}`)); else resolve(stdout);
    });
    pasteChildren.add(child);
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
  });
}


// Wayland only delivers clipboard contents to the focused client, so a background
// Electron process cannot call clipboard.read(). Read through wl-paste instead and
// present the same ClipboardItem-like shape that clipboard-policy.cjs expects.
const clipboard = {
  async read() {
    let listed;
    try { listed = await run('wl-paste', ['--list-types'], {timeout: 3000}); } catch { return []; }
    const raw = listed.split('\n').map(line => line.trim()).filter(Boolean);
    if (!raw.length) return [];
    const types = new Set(raw);
    if (raw.some(type => type.startsWith('text/plain'))) types.add('text/plain');
    const bytes = type => new Promise((resolve, reject) => {
      const source = type === 'text/plain' ? (raw.find(item => item.startsWith('text/plain;')) || 'text/plain') : type;
      const child = execFile('wl-paste', ['--no-newline', '--type', source], {encoding: 'buffer', timeout: 5000, maxBuffer: 70 * 1024 * 1024}, (error, stdout) => error ? reject(error) : resolve(stdout));
      child.stdin.end();
    });
    return [{types: [...types], getType: async type => new Blob([await bytes(type)], {type})}];
  },
};

function monitor(changed, failed, focused = () => {}) {
  // wl-paste runs `echo` once per clipboard change (and once at start).
  const watcher = spawn('wl-paste', ['--watch', 'echo', 'c'], {stdio: ['ignore', 'pipe', 'pipe']});
  let pending = '';
  watcher.stdout.on('data', chunk => {
    pending += chunk.toString();
    let newline;
    while ((newline = pending.indexOf('\n')) >= 0) { pending = pending.slice(newline + 1); sequence++; changed(sequence); }
    if (pending.length > 4096) pending = '';
  });
  watcher.on('error', failed);
  watcher.on('exit', code => { if (code) failed(new Error('wl-paste stopped. Is wl-clipboard installed and a Wayland session running?')); });

  // Hyprland's event socket reports focus changes without polling.
  let socket = null;
  const signature = process.env.HYPRLAND_INSTANCE_SIGNATURE, runtime = process.env.XDG_RUNTIME_DIR;
  if (signature && runtime) {
    socket = net.connect(path.join(runtime, 'hypr', signature, '.socket2.sock'));
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString();
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (line.startsWith('activewindowv2>>')) activeWindow().then(value => { if (value) focused(value); });
      }
      if (buffer.length > 65536) buffer = '';
    });
    socket.on('error', () => {});
  }
  const child = {
    kill() { try { watcher.kill(); } catch {} try { socket?.destroy(); } catch {} },
  };
  watcher.on('exit', () => { try { socket?.destroy(); } catch {} });
  return child;
}

async function paste(target) {
  await focusWindow(target);
  await new Promise(resolve => setTimeout(resolve, 80));
  // Ctrl (29) + V (47). ydotoold must be running and /dev/uinput must be writable.
  const env = {...process.env, YDOTOOL_SOCKET: process.env.YDOTOOL_SOCKET || path.join(process.env.XDG_RUNTIME_DIR || '/tmp', '.ydotool_socket')};
  await new Promise((resolve, reject) => {
    const child = execFile('ydotool', ['key', '29:1', '47:1', '47:0', '29:0'], {timeout: 5000, env}, (error, stdout, stderr) => {
      pasteChildren.delete(child);
      if (error) reject(new Error('Paste needs ydotool: start ydotoold (systemctl --user start ydotool). The item is already on the clipboard.' + String(stderr || '').slice(0, 120))); else resolve();
    });
    pasteChildren.add(child);
  });
  return {ok: true};
}

async function copyImages({files, text = ''}) {
  if (!Array.isArray(files) || !files.length || files.some(file => typeof file !== 'string' || !path.isAbsolute(file))) throw new Error('A copied image is unavailable.');
  // wl-copy offers one MIME type; file managers and chat apps read text/uri-list.
  const list = files.map(file => pathToFileURL(file).href).join('\r\n') + '\r\n';
  await run('wl-copy', ['--type', 'text/uri-list'], {input: list});
  return {ok: true};
}

// Hyprland ignores Electron's own focus request when misc:focus_on_activate is off,
// so give this app's window keyboard focus explicitly.
async function focusSelf() {
  try {
    const clients = JSON.parse(await hyprctl(['clients', '-j']));
    const mine = clients.find(c => c.mapped && c.pid === process.pid);
    if (mine) await hyprctl(['dispatch', `hl.dsp.focus({ window = 'address:${mine.address}' })`]);
  } catch {}
}

module.exports = {
  clipboard,
  focusSelf,
  monitor,
  clipboardSequence: async () => sequence,
  cancelPaste: () => { for (const child of pasteChildren) child.kill(); pasteChildren.clear(); },
  capture: () => activeWindow(),
  captureDiagnostics: async () => ({platform: 'linux', session: process.env.XDG_SESSION_TYPE || '', compositor: process.env.XDG_CURRENT_DESKTOP || ''}),
  selfTestFocusPolicy: async () => ({ok: true}),
  restore: async target => { await focusWindow(target); return {ok: true}; },
  preparePaste: async target => {
    if (!await windowExists(target.handle)) throw new Error('The target window is gone. Select a field in another application and reopen the shelves.');
    return {ok: true};
  },
  validatePaste: async target => {
    if (!await windowExists(target.handle)) throw new Error('The target window is gone.');
    return {ok: true};
  },
  paste,
  copyImages,
};
