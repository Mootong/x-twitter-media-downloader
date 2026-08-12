const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "store-assets");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const iconData = fs.readFileSync(path.join(root, "icons", "icon.svg")).toString("base64");
const iconUrl = `data:image/svg+xml;base64,${iconData}`;

fs.mkdirSync(outputDir, { recursive: true });
for (const obsolete of [
  "01-scan-settings-1280x800.png",
  "02-media-preview-1280x800.png"
]) {
  fs.rmSync(path.join(outputDir, obsolete), { force: true });
}

const palette = {
  ink: "#101114",
  muted: "#68707c",
  line: "#e3e6ea",
  panel: "#ffffff",
  blue: "#1d9bf0",
  orange: "#ff6a2a"
};

const commonStyles = `
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
  body {
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: ${palette.ink};
    background: #eef1f4;
  }
  button, input, select { font: inherit; }
  .browser { position: absolute; inset: 0; overflow: hidden; background: #fff; }
  .browser-bar {
    height: 54px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 18px;
    border-bottom: 1px solid ${palette.line};
    background: #f7f8fa;
  }
  .traffic { display: flex; gap: 7px; }
  .traffic i { width: 10px; height: 10px; border-radius: 50%; background: #d2d6dc; }
  .address {
    flex: 1;
    max-width: 760px;
    padding: 9px 16px;
    border: 1px solid #dde1e6;
    border-radius: 999px;
    color: #69717d;
    background: #fff;
    font-size: 13px;
  }
  .extension-icon { width: 30px; height: 30px; background: url("${iconUrl}") center / contain no-repeat; }
  .app { position: absolute; inset: 54px 0 0; }
`;

function browserFrame(content, address = "x.com/example_creator/media") {
  return `
    <div class="browser">
      <div class="browser-bar">
        <div class="traffic"><i></i><i></i><i></i></div>
        <div class="address">${address}</div>
        <div class="extension-icon"></div>
      </div>
      <div class="app">${content}</div>
    </div>`;
}

const xPage = `
  <div class="x-page">
    <aside class="x-nav">
      <div class="x-logo">X</div>
      <div class="nav-item active"><i></i><span>Home</span></div>
      <div class="nav-item"><i></i><span>Explore</span></div>
      <div class="nav-item"><i></i><span>Notifications</span></div>
      <div class="nav-item"><i></i><span>Messages</span></div>
      <div class="nav-item"><i></i><span>Profile</span></div>
    </aside>
    <section class="x-profile">
      <div class="profile-title"><b>Example Creator</b><span>248 posts</span></div>
      <div class="profile-cover"></div>
      <div class="profile-row">
        <div class="avatar"></div>
        <div><b>Example Creator</b><span>@example_creator</span></div>
      </div>
      <div class="tabs"><span>Posts</span><span class="selected">Media</span><span>Likes</span></div>
      <div class="media-grid">
        <div class="tile warm"></div><div class="tile sea"></div><div class="tile violet"><b>▶</b></div>
        <div class="tile sky"></div><div class="tile rose"><b>▶</b></div><div class="tile gold"></div>
        <div class="tile violet"></div><div class="tile warm"></div><div class="tile sea"><b>▶</b></div>
      </div>
    </section>
    <aside class="x-context">
      <div class="search">Search</div>
      <div class="context-card"><b>What’s happening</b><span>Design · Trending</span><strong>Creative workflows</strong><span>Technology · Trending</span><strong>Media tools</strong></div>
    </aside>
  </div>`;

const sidePanelForm = `
  <aside class="side-panel">
    <h1>Media Downloader for X</h1>
    <p class="intro">Download media from a specified X user. Open the target user's page and the username is detected automatically.</p>
    <label><span>Username</span><input value="@example_creator"></label>
    <label><span>Recent usernames</span><select><option>@example_creator</option></select></label>
    <div class="dates">
      <label><span>Start date</span><input value="2026-07-01"></label>
      <label><span>End date</span><input value="2026-07-31"></label>
    </div>
    <label><span>Maximum posts</span><input value="100"></label>
    <button class="primary">Start scan</button>
    <button>Stop</button>
    <button>Open last preview</button>
    <p class="legal">Only download media you own or are authorized to save. Not affiliated with X Corp.</p>
  </aside>`;

const sidePanelProgress = `
  <aside class="side-panel">
    <h1>Media Downloader for X</h1>
    <p class="intro">Download media from a specified X user. Open the target user's page and the username is detected automatically.</p>
    <label><span>Username</span><input value="@example_creator"></label>
    <label><span>Recent usernames</span><select><option>@example_creator</option></select></label>
    <div class="dates">
      <label><span>Start date</span><input value="2026-07-01"></label>
      <label><span>End date</span><input value="2026-07-31"></label>
    </div>
    <label><span>Maximum posts</span><input value="100"></label>
    <button class="primary">Start scan</button>
    <button>Stop</button>
    <button>Open last preview</button>
    <p class="legal">Only download media you own or are authorized to save. Not affiliated with X Corp.</p>
    <p class="scan-status">Scanned 100 of 100 posts</p>
    <section class="stats-card">
      <b>Scan summary</b>
      <div class="stat-grid">
        <div><strong>100</strong><span>Posts scanned</span></div>
        <div><strong>129</strong><span>Images found</span></div>
        <div><strong>20</strong><span>Videos found</span></div>
      </div>
    </section>
  </aside>`;

const sideStyles = `
  ${commonStyles}
  .x-page { position: absolute; inset: 0 360px 0 0; display: grid; grid-template-columns: 170px 520px 1fr; background: #fff; }
  .x-nav { padding: 24px 22px; border-right: 1px solid #edf0f3; }
  .x-logo { margin: 0 0 28px 14px; font-size: 30px; font-weight: 850; }
  .nav-item { display: flex; align-items: center; gap: 13px; margin: 19px 0; color: #555d68; font-size: 14px; }
  .nav-item i { width: 20px; height: 20px; border: 2px solid #9aa1aa; border-radius: 50%; }
  .nav-item.active { color: #111318; font-weight: 750; }
  .nav-item.active i { border-color: #111318; background: #111318; }
  .x-profile { border-right: 1px solid #edf0f3; }
  .profile-title { display: grid; gap: 2px; height: 54px; padding: 10px 18px; }
  .profile-title b { font-size: 16px; }.profile-title span { color: #777e88; font-size: 11px; }
  .profile-cover { height: 112px; background: linear-gradient(120deg, #ff9b42, #ef4355 50%, #563cc9); }
  .profile-row { display: flex; gap: 12px; align-items: center; padding: 14px 18px; }
  .profile-row .avatar { width: 52px; height: 52px; border: 4px solid #fff; border-radius: 50%; background: linear-gradient(145deg, #202329, #08090b); }
  .profile-row div:last-child { display: grid; gap: 3px; }.profile-row span { color: #747b86; font-size: 12px; }
  .tabs { display: flex; justify-content: space-around; height: 46px; border-bottom: 1px solid #edf0f3; color: #7b818b; }
  .tabs span { position: relative; padding-top: 13px; font-size: 13px; }.tabs .selected { color: #111318; font-weight: 700; }
  .tabs .selected::after { content: ""; position: absolute; left: 4px; right: 4px; bottom: 0; height: 4px; border-radius: 5px; background: ${palette.blue}; }
  .media-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding-top: 3px; }
  .tile { aspect-ratio: 1; display: grid; place-items: center; color: #fff; font-size: 24px; }
  .warm { background: linear-gradient(145deg, #fb7185, #f97316); }.sea { background: linear-gradient(145deg, #22c55e, #0ea5e9); }
  .violet { background: linear-gradient(145deg, #6366f1, #a855f7); }.sky { background: linear-gradient(145deg, #06b6d4, #2563eb); }
  .rose { background: linear-gradient(145deg, #ec4899, #8b5cf6); }.gold { background: linear-gradient(145deg, #f59e0b, #ef4444); }
  .x-context { padding: 18px; }.search { padding: 10px 14px; border-radius: 999px; color: #8a919b; background: #f1f3f5; font-size: 12px; }
  .context-card { display: grid; gap: 7px; margin-top: 16px; padding: 16px; border: 1px solid #edf0f3; border-radius: 15px; }
  .context-card b { margin-bottom: 5px; }.context-card span { color: #8a919b; font-size: 10px; }.context-card strong { font-size: 12px; }
  .side-panel { position: absolute; inset: 0 0 0 auto; width: 360px; padding: 18px; border-left: 1px solid #dfe3e8; background: #fff; box-shadow: -12px 0 28px #0f172a12; }
  .side-panel h1 { margin: 0 0 10px; font-size: 18px; }.intro { margin: 0 0 13px; color: #555d68; font-size: 11px; line-height: 1.45; }
  .side-panel label { display: grid; gap: 4px; margin-bottom: 9px; font-size: 11px; }.side-panel input, .side-panel select { width: 100%; padding: 7px 8px; border: 1px solid #d7dbe0; border-radius: 7px; color: #242830; background: #fff; }
  .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.side-panel button { width: 100%; margin-top: 6px; padding: 8px 12px; border: 1px solid #d7dbe0; border-radius: 999px; background: #fff; font-size: 11px; font-weight: 700; }
  .side-panel button.primary { border-color: ${palette.blue}; color: #fff; background: ${palette.blue}; }.legal { margin: 10px 0 0; color: #858b94; font-size: 9px; line-height: 1.4; }
  .scan-status { margin: 10px 0 0; font-size: 11px; }.stats-card { margin-top: 8px; padding: 10px; border: 1px solid #dfe3e8; border-radius: 10px; background: #f7f8fa; }
  .stats-card > b { font-size: 11px; }.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 7px; text-align: center; }
  .stat-grid div { display: grid; gap: 2px; }.stat-grid strong { font-size: 17px; }.stat-grid span { color: #777e88; font-size: 8px; }
`;

const previewRows = [
  ["warm", "Jul 31, 2026", "image", "4096 × 2731", "203845102931001001"],
  ["sea", "Jul 31, 2026", "image", "2048 × 2048", "203845102931001001"],
  ["violet", "Jul 29, 2026", "mp4", "2,176 kbps", "203772660440391124"],
  ["sky", "Jul 24, 2026", "image", "3840 × 2160", "203590783292918450"],
  ["rose", "Jul 18, 2026", "mp4", "1,832 kbps", "203373073018440921"],
  ["gold", "Jul 12, 2026", "image", "3000 × 2000", "203155914742316710"]
];

function tableRows(completed = false) {
  return previewRows.map((row) => `
    <tr>
      <td><span class="checkbox">✓</span></td>
      <td><div class="thumb ${row[0]}">${row[2] === "mp4" ? "<b>▶</b>" : ""}</div></td>
      <td>${row[1]}</td><td><span class="kind">${row[2]}</span></td><td>${row[3]}</td>
      <td><a>${row[4]}</a></td><td class="${completed ? "done" : "pending"}">${completed ? "Completed" : "Pending"}</td>
    </tr>`).join("");
}

function reviewPage(completed = false, modal = false) {
  return browserFrame(`
    <div class="review-head">
      <div><h1>Media download preview</h1><p>149 media items · 129 images · 20 videos · 7/31/2026, 2:24 PM</p></div>
      <div class="actions">
        <label class="filter"><span>Media type</span><select><option>All media</option></select></label>
        <button>Select all</button><button>Select none</button><button>Export scan list ▾</button><button class="primary">Download selected</button>
      </div>
    </div>
    <div class="helper">All items can be downloaded directly by the browser.</div>
    <div class="table-wrap"><table><thead><tr><th><span class="checkbox">✓</span></th><th>Preview</th><th>Date</th><th>Type</th><th>Media info</th><th>Post</th><th>Status</th></tr></thead><tbody>${tableRows(completed)}</tbody></table></div>
    ${modal ? `<div class="modal-layer"><div class="modal"><div class="success">✓</div><h2>Downloads complete</h2><p>All 6 selected items have finished downloading.</p><p class="rating">If you are satisfied with the extension, please consider rating it in the Chrome Web Store.</p><div><button class="primary">Rate in Chrome Web Store</button><button>Maybe later</button></div></div></div>` : ""}
  `, "Media download preview");
}

const reviewStyles = `
  ${commonStyles}
  .review-head { height: 96px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 16px 22px; border-bottom: 1px solid ${palette.line}; background: #fff; }
  .review-head h1 { margin: 0; font-size: 21px; }.review-head p { margin: 6px 0 0; color: #737b86; font-size: 12px; }
  .actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }.filter { display: flex; align-items: center; gap: 6px; color: #535b66; font-size: 11px; }
  .filter select, button { padding: 8px 12px; border: 1px solid #d7dbe0; border-radius: 999px; color: #20242a; background: #fff; font-size: 11px; }
  button.primary { border-color: ${palette.blue}; color: #fff; background: ${palette.blue}; font-weight: 700; }.helper { padding: 10px 22px; color: #67520a; background: #ffcc0030; font-size: 12px; }
  .table-wrap { padding: 0 22px 28px; }.table-wrap table { width: 100%; border-collapse: collapse; }th, td { padding: 9px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 12px; }
  th { color: #565d68; background: #fff; font-weight: 650; }.checkbox { display: grid; place-items: center; width: 17px; height: 17px; border-radius: 4px; color: #fff; background: ${palette.blue}; font-size: 11px; }
  .thumb { width: 96px; height: 70px; display: grid; place-items: center; border-radius: 8px; color: #fff; font-size: 20px; }.warm { background: linear-gradient(145deg, #fb7185, #f97316); }.sea { background: linear-gradient(145deg, #22c55e, #0ea5e9); }
  .violet { background: linear-gradient(145deg, #6366f1, #a855f7); }.sky { background: linear-gradient(145deg, #06b6d4, #2563eb); }.rose { background: linear-gradient(145deg, #ec4899, #8b5cf6); }.gold { background: linear-gradient(145deg, #f59e0b, #ef4444); }
  .kind { display: inline-block; min-width: 52px; padding: 4px 8px; border-radius: 999px; color: #3d4652; background: #f0f2f5; text-align: center; }a { color: #1684cf; }.pending { color: #68707c; }.done { color: #16a34a; font-weight: 650; }
  .modal-layer { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; background: #0009; }.modal { width: 420px; padding: 24px; border: 1px solid #7778; border-radius: 18px; background: #fff; box-shadow: 0 20px 60px #0007; text-align: center; }
  .success { display: grid; width: 52px; height: 52px; margin: 0 auto; place-items: center; border-radius: 50%; color: #16a34a; background: #22c55e20; font-size: 28px; font-weight: 800; }.modal h2 { margin: 10px 0 0; font-size: 21px; }.modal p { margin: 9px 0 0; color: #6d7580; line-height: 1.5; }.modal .rating { font-size: 13px; }.modal > div:last-child { display: flex; justify-content: center; gap: 8px; margin-top: 18px; }
`;

const smallPromo = `
  <div class="promo-small">
    <div class="glow"></div><div class="ring r1"></div><div class="ring r2"></div>
    <div class="mini-card c1"><i></i><b></b></div><div class="mini-card c2"><span>▶</span></div>
    <img src="${iconUrl}"><div class="small-title">MEDIA DOWNLOADER<br><span>FOR X</span></div>
  </div>`;

const smallPromoStyles = `
  * { box-sizing: border-box; }html, body { width: 440px; height: 280px; margin: 0; overflow: hidden; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .promo-small { position: relative; width: 100%; height: 100%; overflow: hidden; color: #fff; background: radial-gradient(circle at 24% 40%, #ff6a2a50, transparent 32%), linear-gradient(135deg, #24272c, #07080a 68%); }
  .glow { position: absolute; right: -40px; bottom: -70px; width: 260px; height: 200px; border-radius: 50%; background: #ff5a2630; filter: blur(18px); }.ring { position: absolute; border: 1px solid #ffffff18; border-radius: 50%; transform: rotate(-13deg); }.r1 { inset: 30px 40px; }.r2 { inset: 5px -40px; }
  img { position: absolute; left: 54px; top: 67px; width: 146px; height: 146px; filter: drop-shadow(0 18px 28px #0008); }.small-title { position: absolute; left: 228px; top: 97px; font-size: 22px; line-height: 1.2; font-weight: 820; letter-spacing: .7px; }.small-title span { color: #ff7540; }
  .mini-card { position: absolute; width: 66px; height: 48px; overflow: hidden; border: 1px solid #ffffff26; border-radius: 12px; background: #20242a; box-shadow: 0 12px 26px #0006; }.c1 { right: 32px; top: 31px; transform: rotate(8deg); }.c2 { right: 42px; bottom: 28px; display: grid; place-items: center; transform: rotate(-7deg); }
  .mini-card i { position: absolute; left: 11px; top: 10px; width: 8px; height: 8px; border-radius: 50%; background: #ff7540; }.mini-card b { position: absolute; inset: 17px 8px 7px; clip-path: polygon(0 100%, 28% 28%, 51% 70%, 71% 40%, 100% 100%); background: linear-gradient(135deg, #ff9b38, #ef3f4b); }
`;

const marqueePromo = `
  <div class="marquee">
    <div class="hero-copy"><img src="${iconUrl}"><div><p>MEDIA DOWNLOADER FOR X</p><h1>Scan. Preview.<br>Download what you choose.</h1><span>Images and videos, organized by username.</span></div></div>
    <div class="hero-ui">
      <div class="mock-browser"><div class="mock-bar"><i></i><i></i><i></i><span>x.com/example_creator/media</span></div><div class="mock-grid"><b></b><b></b><b></b><b></b><b></b><b></b></div></div>
      <div class="mock-panel"><strong>Media Downloader for X</strong><label>Username</label><div>@example_creator</div><label>Maximum posts</label><div>100</div><button>Start scan</button><section><b>129</b><span>Images</span><b>20</b><span>Videos</span></section></div>
    </div>
  </div>`;

const marqueeStyles = `
  * { box-sizing: border-box; }html, body { width: 1400px; height: 560px; margin: 0; overflow: hidden; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .marquee { position: relative; display: grid; grid-template-columns: 48% 52%; width: 100%; height: 100%; overflow: hidden; color: #fff; background: radial-gradient(circle at 17% 20%, #ff6a2a42, transparent 29%), radial-gradient(circle at 90% 85%, #6638d333, transparent 28%), linear-gradient(135deg, #292c31, #07080a 63%); }
  .marquee::after { content: ""; position: absolute; inset: 0; background-image: linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px); background-size: 40px 40px; mask-image: linear-gradient(90deg, #000, transparent 70%); }
  .hero-copy { position: relative; z-index: 1; display: flex; gap: 28px; align-items: center; padding-left: 74px; }.hero-copy img { width: 150px; height: 150px; filter: drop-shadow(0 22px 34px #0009); }.hero-copy p { margin: 0 0 14px; color: #ff7540; font-size: 17px; font-weight: 800; letter-spacing: 1.5px; }.hero-copy h1 { margin: 0; font-size: 43px; line-height: 1.08; letter-spacing: -1.2px; }.hero-copy span { display: block; margin-top: 17px; color: #c5c9cf; font-size: 18px; }
  .hero-ui { position: relative; z-index: 1; }.mock-browser { position: absolute; left: 12px; top: 78px; width: 590px; height: 404px; overflow: hidden; border: 1px solid #ffffff24; border-radius: 20px; background: #f7f8fa; box-shadow: 0 30px 70px #0009; transform: rotate(-2deg); }.mock-bar { height: 45px; display: flex; align-items: center; gap: 7px; padding: 0 14px; background: #e9ebee; }.mock-bar i { width: 9px; height: 9px; border-radius: 50%; background: #c4c8ce; }.mock-bar span { width: 320px; margin-left: 10px; padding: 7px 13px; border-radius: 999px; color: #777e88; background: #fff; font-size: 11px; }.mock-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 30px 140px 20px 28px; }.mock-grid b { height: 120px; border-radius: 8px; background: linear-gradient(145deg, #fb7185, #f97316); }.mock-grid b:nth-child(2n) { background: linear-gradient(145deg, #22c55e, #0ea5e9); }.mock-grid b:nth-child(3n) { background: linear-gradient(145deg, #6366f1, #a855f7); }
  .mock-panel { position: absolute; right: 58px; top: 48px; width: 270px; padding: 20px; border: 1px solid #ffffff3a; border-radius: 20px; color: #181b20; background: #fff; box-shadow: 0 28px 64px #0009; transform: rotate(2deg); }.mock-panel strong { display: block; margin-bottom: 18px; font-size: 17px; }.mock-panel label { display: block; margin: 11px 0 5px; color: #606873; font-size: 11px; }.mock-panel > div { padding: 9px; border: 1px solid #d9dde2; border-radius: 7px; font-size: 12px; }.mock-panel button { width: 100%; margin-top: 16px; padding: 10px; border: 0; border-radius: 999px; color: #fff; background: ${palette.blue}; font-weight: 700; }.mock-panel section { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 9px; margin-top: 16px; padding: 12px; border-radius: 10px; background: #f3f5f7; text-align: center; }.mock-panel section b { font-size: 21px; }.mock-panel section span { color: #68707c; font-size: 10px; }
`;

function documentHtml(body, styles) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body>${body}</body></html>`;
}

async function capture(browser, filename, width, height, body, styles) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: "light" });
  const page = await context.newPage();
  await page.setContent(documentHtml(body, styles), { waitUntil: "load" });
  await page.screenshot({ path: path.join(outputDir, filename), type: "png", fullPage: false });
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromeExecutable });
  try {
    await capture(browser, "01-side-panel-scan-1280x800.png", 1280, 800, browserFrame(xPage + sidePanelForm), sideStyles);
    await capture(browser, "02-scan-progress-1280x800.png", 1280, 800, browserFrame(xPage + sidePanelProgress), sideStyles);
    await capture(browser, "03-media-preview-1280x800.png", 1280, 800, reviewPage(false, false), reviewStyles);
    await capture(browser, "04-download-complete-1280x800.png", 1280, 800, reviewPage(true, true), reviewStyles);
    await capture(browser, "promo-small-440x280.png", 440, 280, smallPromo, smallPromoStyles);
    await capture(browser, "promo-marquee-1400x560.png", 1400, 560, marqueePromo, marqueeStyles);
    fs.copyFileSync(path.join(root, "icons", "icon128.png"), path.join(outputDir, "store-icon-128x128.png"));
  } finally {
    await browser.close();
  }
  console.log(`Store assets created in ${outputDir}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
