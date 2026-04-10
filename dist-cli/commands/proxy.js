"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runProxy = runProxy;
const utils_1 = require("../utils");
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Parse CLI flags into a key-value map.
 * Supports both `--flag value` and `--flag=value` forms.
 */
function parseArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        // ── Space-separated flags ───────────────────────────────────────────────
        if (a === '--domain' || a === '-d') {
            result['domain'] = args[++i] ?? '';
        }
        else if (a === '--cf-token') {
            result['cfToken'] = args[++i] ?? '';
        }
        else if (a === '--cf-zone') {
            result['cfZone'] = args[++i] ?? '';
        }
        else if (a === '--email') {
            result['email'] = args[++i] ?? '';
        }
        else if (a === '--vps-ip' || a === '--ip') {
            result['vpsIp'] = args[++i] ?? '';
        }
        else if (a === '--port' || a === '-p') {
            result['port'] = args[++i] ?? '';
        }
        // ── Equals-sign flags ───────────────────────────────────────────────────
        else if (a.startsWith('--domain=')) {
            result['domain'] = a.slice('--domain='.length);
        }
        else if (a.startsWith('--cf-token=')) {
            result['cfToken'] = a.slice('--cf-token='.length);
        }
        else if (a.startsWith('--cf-zone=')) {
            result['cfZone'] = a.slice('--cf-zone='.length);
        }
        else if (a.startsWith('--email=')) {
            result['email'] = a.slice('--email='.length);
        }
        else if (a.startsWith('--vps-ip=')) {
            result['vpsIp'] = a.slice('--vps-ip='.length);
        }
        else if (a.startsWith('--ip=')) {
            result['vpsIp'] = a.slice('--ip='.length);
        }
        else if (a.startsWith('--port=')) {
            result['port'] = a.slice('--port='.length);
        }
        else if (a.startsWith('-p=')) {
            result['port'] = a.slice('-p='.length);
        }
    }
    return result;
}
/**
 * `jarv proxy` — Set up an nginx + Let's Encrypt reverse proxy on a Linux VPS.
 *
 * Steps:
 *   1. Upsert Cloudflare DNS A-record
 *   2. Install nginx
 *   3. Write and activate nginx site config
 *   4. Install certbot
 *   5. Obtain SSL certificate via Let's Encrypt
 */
async function runProxy(args) {
    // ── Guard: Linux only ─────────────────────────────────────────────────────
    if (os.platform() !== 'linux') {
        (0, utils_1.warn)('jarv proxy requires Linux (nginx + certbot).');
        (0, utils_1.warn)('Run this command on your VPS, not locally.');
        process.exit(1);
    }
    const flags = parseArgs(args);
    // ── Load profile defaults ─────────────────────────────────────────────────
    const profile = (0, utils_1.loadProfile)();
    const defaultPort = profile?.port ?? 3000;
    // ── Collect values (flags → prompt for missing) ───────────────────────────
    let domain = flags['domain'] || '';
    let cfToken = flags['cfToken'] || '';
    let cfZone = flags['cfZone'] || '';
    let email = flags['email'] || '';
    let vpsIp = flags['vpsIp'] || '';
    const portStr = flags['port'] || '';
    if (!domain)
        domain = await (0, utils_1.ask)('Domain (e.g. jarvis.example.com):');
    if (!cfToken)
        cfToken = await (0, utils_1.askSecret)('Cloudflare API token (DNS:Edit scope):');
    if (!cfZone)
        cfZone = await (0, utils_1.ask)('Cloudflare Zone ID:');
    if (!email)
        email = await (0, utils_1.ask)("Let's Encrypt email:");
    // ── Auto-detect VPS IP if not provided ────────────────────────────────────
    if (!vpsIp) {
        (0, utils_1.log)('Auto-detecting VPS IP...');
        try {
            const resp = await fetch('https://api.ipify.org?format=json');
            const data = (await resp.json());
            vpsIp = data.ip;
            (0, utils_1.log)(`Detected VPS IP: ${utils_1.c.cyan(vpsIp)}`);
        }
        catch {
            vpsIp = await (0, utils_1.ask)('VPS public IP address:');
        }
    }
    const port = portStr ? parseInt(portStr, 10) : defaultPort;
    // ── Show summary ──────────────────────────────────────────────────────────
    console.log('');
    console.log(utils_1.c.bold('[jarv] Reverse proxy setup'));
    console.log(`  Domain:   ${utils_1.c.cyan(domain)}`);
    console.log(`  CF Zone:  ${utils_1.c.dim(cfZone)}`);
    console.log(`  VPS IP:   ${utils_1.c.cyan(vpsIp)}`);
    console.log(`  Port:     ${utils_1.c.cyan(String(port))}`);
    console.log("  SSL:      Let's Encrypt (certbot)");
    console.log('');
    const confirm = await (0, utils_1.ask)('Proceed? [Y/n]:', 'Y');
    if (confirm.toLowerCase() === 'n') {
        (0, utils_1.log)('Aborted.');
        return;
    }
    const TOTAL = 5;
    // ── Step 1/5: Cloudflare DNS ──────────────────────────────────────────────
    (0, utils_1.step)(1, TOTAL, 'Cloudflare DNS A-record');
    try {
        const cfBase = `https://api.cloudflare.com/client/v4/zones/${cfZone}/dns_records`;
        const headers = {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json',
        };
        // Check for existing A-record
        const listResp = await fetch(`${cfBase}?type=A&name=${encodeURIComponent(domain)}`, { headers });
        const listData = (await listResp.json());
        const body = JSON.stringify({
            type: 'A',
            name: domain,
            content: vpsIp,
            proxied: false,
            ttl: 120,
        });
        if (listData.success && listData.result.length > 0) {
            // Update existing record
            const recordId = listData.result[0].id;
            const putResp = await fetch(`${cfBase}/${recordId}`, {
                method: 'PUT',
                headers,
                body,
            });
            const putData = (await putResp.json());
            if (!putData.success)
                throw new Error(`CF DNS update failed: ${JSON.stringify(putData)}`);
            (0, utils_1.ok)(`Updated A-record for ${domain} → ${vpsIp} (id: ${putData.result?.id ?? recordId})`);
        }
        else {
            // Create new record
            const postResp = await fetch(cfBase, { method: 'POST', headers, body });
            const postData = (await postResp.json());
            if (!postData.success)
                throw new Error(`CF DNS create failed: ${JSON.stringify(postData)}`);
            (0, utils_1.ok)(`Created A-record for ${domain} → ${vpsIp} (id: ${postData.result?.id ?? '?'})`);
        }
    }
    catch (err) {
        (0, utils_1.error)(`Step 1 failed: ${String(err)}`);
        process.exit(1);
    }
    // ── Step 2/5: Install nginx ───────────────────────────────────────────────
    (0, utils_1.step)(2, TOTAL, 'Install nginx');
    const nginxOk = await (0, utils_1.runLive)('sudo apt-get update -y && sudo apt-get install -y nginx');
    if (!nginxOk) {
        (0, utils_1.error)('Step 2 failed: nginx installation error');
        process.exit(1);
    }
    // ── Step 3/5: Configure nginx ─────────────────────────────────────────────
    (0, utils_1.step)(3, TOTAL, 'Configure nginx reverse proxy');
    const nginxConfig = [
        'server {',
        '    listen 80;',
        `    server_name ${domain};`,
        '',
        '    location / {',
        `        proxy_pass http://127.0.0.1:${port};`,
        '        proxy_http_version 1.1;',
        '        proxy_set_header Upgrade $http_upgrade;',
        "        proxy_set_header Connection 'upgrade';",
        '        proxy_set_header Host $host;',
        '        proxy_cache_bypass $http_upgrade;',
        '        proxy_set_header X-Real-IP $remote_addr;',
        '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
        '        proxy_set_header X-Forwarded-Proto $scheme;',
        '    }',
        '}',
        '',
    ].join('\n');
    const tmpFile = path.join(os.tmpdir(), 'jarvis-nginx.conf');
    try {
        fs.writeFileSync(tmpFile, nginxConfig, 'utf8');
        const cpResult = await (0, utils_1.run)(`sudo cp ${tmpFile} /etc/nginx/sites-available/jarvis`);
        if (!cpResult.ok)
            throw new Error(cpResult.output);
        const lnResult = await (0, utils_1.run)('sudo ln -sf /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/jarvis');
        if (!lnResult.ok)
            throw new Error(lnResult.output);
        const testResult = await (0, utils_1.run)('sudo nginx -t');
        if (!testResult.ok)
            throw new Error(testResult.output);
        const reloadResult = await (0, utils_1.run)('sudo systemctl reload nginx');
        if (!reloadResult.ok)
            throw new Error(reloadResult.output);
        (0, utils_1.ok)('nginx configured and reloaded');
    }
    catch (err) {
        (0, utils_1.error)(`Step 3 failed: ${String(err)}`);
        process.exit(1);
    }
    finally {
        // Clean up temp file
        try {
            fs.unlinkSync(tmpFile);
        }
        catch { /* ignore */ }
    }
    // ── Step 4/5: Install certbot ─────────────────────────────────────────────
    (0, utils_1.step)(4, TOTAL, 'Install certbot');
    const certbotOk = await (0, utils_1.runLive)('sudo apt-get install -y certbot python3-certbot-nginx');
    if (!certbotOk) {
        (0, utils_1.error)('Step 4 failed: certbot installation error');
        process.exit(1);
    }
    // ── Step 5/5: Obtain SSL certificate ──────────────────────────────────────
    (0, utils_1.step)(5, TOTAL, "Obtain SSL certificate (Let's Encrypt)");
    const sslOk = await (0, utils_1.runLive)(`sudo certbot --nginx -d ${domain} -m ${email} --agree-tos --non-interactive --redirect`);
    if (!sslOk) {
        (0, utils_1.error)('Step 5 failed: certbot SSL certificate error');
        process.exit(1);
    }
    // ── Success ───────────────────────────────────────────────────────────────
    console.log('');
    (0, utils_1.ok)('Reverse proxy ready!');
    console.log(`  ${utils_1.c.cyan(`https://${domain}`)}  →  ${utils_1.c.dim(`http://127.0.0.1:${port}`)}`);
    console.log('');
    console.log(`Your Jarvis dashboard is live at: ${utils_1.c.bold(utils_1.c.green(`https://${domain}`))}`);
}
