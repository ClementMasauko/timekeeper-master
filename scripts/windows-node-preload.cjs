// Work around a libuv/Windows userInfo failure observed with Node 24 in some sandboxes.
const os = require('node:os');
const original = os.userInfo;
os.userInfo = (...args) => {
  try { return original(...args); }
  catch { return { uid: -1, gid: -1, username: process.env.USERNAME || 'user', homedir: process.env.USERPROFILE || '.', shell: process.env.COMSPEC || 'cmd.exe' }; }
};
