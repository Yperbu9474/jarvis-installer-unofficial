import { run, runLive, ask, askSecret, log, warn, error, ok, step, c, loadProfile } from '../utils';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Parse CLI flags into a key-value map.
 * Supports both `--flag value` and `--flag=value` forms.
 */
function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // ── Space-separated flags ───────────────────────────────────────────────
    if (a === '--domain' || a === '-d') { result['domain'] = args[++i] ?? ''; }
    else if (a === '--cf-token')        { result['cfToken'] = args[++i] ?? ''; }
    else if (a === '--cf-zone')         { result['cfZone'] = args[++i] ?? ''; }
    else if (a === '--email')           { result['email'] = args[++i] ?? ''; }
    else if (a === '--vps-ip' || a === '--ip') { result['vpsIp'] = args[++i] ?? ''; }
    else if (a === '--port' || a === '-p')     { result['port'] = args[++i] ?? ''; }
    // ── Equals-sign flags ───────────────────────────────────────────────────
    else if (a.startsWith('--domain='))   { result['domain'] = a.slice('--domain='.length); }
    else if (a.startsWith('--cf-token=')) { result['cfToken'] = a.slice('--cf-token='.length); }
    else if (a.startsWith('--cf-zone=')) { result['cfZone'] = a.slice('--cf-zone='.length); }
    else if (a.startsWith('--email='))   { result['email'] = a.slice('--email='.length); }
    else if (a.startsWith('--vps-ip='))  { result['vpsIp'] = a.slice('--vps-ip='.length); }
    else if (a.startsWith('--ip='))      { result['vpsIp'] = a.slice('--ip='.length); }
    else if (a.startsWith('--port='))    { result['port'] = a.slice('--port='.length); }
    else if (a.startsWith('-p='))        { result['port'] = a.slice('-p='.length); }
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
export async function runProxy(args: string[]): Promise<void> {
  // ── Guard: Linux only ─────────────────────────────────────────────────────
  if (os.platform() !== 'linux') {
    warn('jarv proxy requires Linux (nginx + certbot).');
    warn('Run this command on your VPS, not locally.');
    process.exit(1);
  }

  const flags = parseArgs(args);

  // ── Load profile defaults ─────────────────────────────────────────────────
  const profile = loadProfile();
  const defaultPort = profile?.port ?? 3000;

  // ── Collect values (flags → prompt for missing) ───────────────────────────
  let domain  = flags['domain'] || '';
  let cfToken = flags['cfToken'] || '';
  let cfZone  = flags['cfZone'] || '';
  let email   = flags['email'] || '';
  let vpsIp   = flags['vpsIp'] || '';
  const portStr = flags['port'] || '';

  if (!domain)  domain  = await ask('Domain (e.g. jarvis.example.com):');
  if (!cfToken) cfToken = await askSecret('Cloudflare API token (DNS:Edit scope):');
  if (!cfZone)  cfZone  = await ask('Cloudflare Zone ID:');
  if (!email)   email   = await ask("Let's Encrypt email:");

  // ── Auto-detect VPS IP if not provided ────────────────────────────────────
  if (!vpsIp) {
    log('Auto-detecting VPS IP...');
    try {
      const resp = await fetch('https://api.ipify.org?format=json');
      const data = (await resp.json()) as { ip: string };
      vpsIp = data.ip;
      log(`Detected VPS IP: ${c.cyan(vpsIp)}`);
    } catch {
      vpsIp = await ask('VPS public IP address:');
    }
  }

  const port = portStr ? parseInt(portStr, 10) : defaultPort;

  // ── Show summary ──────────────────────────────────────────────────────────
  console.log('');
  console.log(c.bold('[jarv] Reverse proxy setup'));
  console.log(`  Domain:   ${c.cyan(domain)}`);
  console.log(`  CF Zone:  ${c.dim(cfZone)}`);
  console.log(`  VPS IP:   ${c.cyan(vpsIp)}`);
  console.log(`  Port:     ${c.cyan(String(port))}`);
  console.log("  SSL:      Let's Encrypt (certbot)");
  console.log('');

  const confirm = await ask('Proceed? [Y/n]:', 'Y');
  if (confirm.toLowerCase() === 'n') {
    log('Aborted.');
    return;
  }

  const TOTAL = 5;

  // ── Step 1/5: Cloudflare DNS ──────────────────────────────────────────────
  step(1, TOTAL, 'Cloudflare DNS A-record');
  try {
    const cfBase = `https://api.cloudflare.com/client/v4/zones/${cfZone}/dns_records`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${cfToken}`,
      'Content-Type': 'application/json',
    };

    // Check for existing A-record
    const listResp = await fetch(
      `${cfBase}?type=A&name=${encodeURIComponent(domain)}`,
      { headers },
    );
    const listData = (await listResp.json()) as {
      success: boolean;
      result: Array<{ id: string; name: string; type: string }>;
    };

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
      const putData = (await putResp.json()) as { success: boolean; result?: { id: string } };
      if (!putData.success) throw new Error(`CF DNS update failed: ${JSON.stringify(putData)}`);
      ok(`Updated A-record for ${domain} → ${vpsIp} (id: ${putData.result?.id ?? recordId})`);
    } else {
      // Create new record
      const postResp = await fetch(cfBase, { method: 'POST', headers, body });
      const postData = (await postResp.json()) as { success: boolean; result?: { id: string } };
      if (!postData.success) throw new Error(`CF DNS create failed: ${JSON.stringify(postData)}`);
      ok(`Created A-record for ${domain} → ${vpsIp} (id: ${postData.result?.id ?? '?'})`);
    }
  } catch (err) {
    error(`Step 1 failed: ${String(err)}`);
    process.exit(1);
  }

  // ── Step 2/5: Install nginx ───────────────────────────────────────────────
  step(2, TOTAL, 'Install nginx');
  const nginxOk = await runLive('sudo apt-get update -y && sudo apt-get install -y nginx');
  if (!nginxOk) {
    error('Step 2 failed: nginx installation error');
    process.exit(1);
  }

  // ── Step 3/5: Configure nginx ─────────────────────────────────────────────
  step(3, TOTAL, 'Configure nginx reverse proxy');
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

    const cpResult = await run(`sudo cp ${tmpFile} /etc/nginx/sites-available/jarvis`);
    if (!cpResult.ok) throw new Error(cpResult.output);

    const lnResult = await run(
      'sudo ln -sf /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/jarvis',
    );
    if (!lnResult.ok) throw new Error(lnResult.output);

    const testResult = await run('sudo nginx -t');
    if (!testResult.ok) throw new Error(testResult.output);

    const reloadResult = await run('sudo systemctl reload nginx');
    if (!reloadResult.ok) throw new Error(reloadResult.output);

    ok('nginx configured and reloaded');
  } catch (err) {
    error(`Step 3 failed: ${String(err)}`);
    process.exit(1);
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }

  // ── Step 4/5: Install certbot ─────────────────────────────────────────────
  step(4, TOTAL, 'Install certbot');
  const certbotOk = await runLive('sudo apt-get install -y certbot python3-certbot-nginx');
  if (!certbotOk) {
    error('Step 4 failed: certbot installation error');
    process.exit(1);
  }

  // ── Step 5/5: Obtain SSL certificate ──────────────────────────────────────
  step(5, TOTAL, "Obtain SSL certificate (Let's Encrypt)");
  const sslOk = await runLive(
    `sudo certbot --nginx -d ${domain} -m ${email} --agree-tos --non-interactive --redirect`,
  );
  if (!sslOk) {
    error('Step 5 failed: certbot SSL certificate error');
    process.exit(1);
  }

  // ── Success ───────────────────────────────────────────────────────────────
  console.log('');
  ok('Reverse proxy ready!');
  console.log(`  ${c.cyan(`https://${domain}`)}  →  ${c.dim(`http://127.0.0.1:${port}`)}`);
  console.log('');
  console.log(`Your Jarvis dashboard is live at: ${c.bold(c.green(`https://${domain}`))}`);
}
