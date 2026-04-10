import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// mirrored in src/lib/types.ts
export type ProxyConfig = {
  domain: string;      // e.g. "jarvis.example.com" — full subdomain or domain
  cfApiToken: string;  // Cloudflare API token with DNS edit permission
  cfZoneId: string;    // Cloudflare Zone ID for the domain
  email: string;       // email for Let's Encrypt / certbot
  vpsIp: string;       // public IP of the VPS (user-supplied or auto-detected)
  port: number;        // Jarvis dashboard port (from saved profile)
};

export type ProxyResult = {
  ok: boolean;
  output: string;
  url?: string;        // final https:// URL on success
};

/** Run a shell command, capturing stdout+stderr combined. Never throws. */
async function runShell(cmd: string): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, out: [stdout, stderr].filter(Boolean).join('\n') };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const combined = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n');
    return { ok: false, out: combined };
  }
}

export async function setupProxy(config: ProxyConfig): Promise<ProxyResult> {
  const { domain, cfApiToken, cfZoneId, email, vpsIp, port } = config;
  const lines: string[] = [];
  let anyFailed = false;

  // Guard: Linux only
  if (os.platform() !== 'linux') {
    return {
      ok: false,
      output: 'Reverse proxy setup is only supported on Linux/VPS.',
      url: undefined,
    };
  }

  // ── Step 1: Cloudflare DNS A-record ────────────────────────────────────────
  lines.push('=== Step 1: Cloudflare DNS A-record ===');
  try {
    const cfBase = `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/dns_records`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${cfApiToken}`,
      'Content-Type': 'application/json',
    };

    // List existing records to check for duplicate
    const listResp = await fetch(`${cfBase}?type=A&name=${encodeURIComponent(domain)}`, { headers });
    const listData = (await listResp.json()) as {
      success: boolean;
      result: Array<{ id: string; name: string; type: string }>;
    };

    let cfOk = false;
    let cfMsg = '';

    if (listData.success && listData.result.length > 0) {
      // Update existing record
      const recordId = listData.result[0].id;
      const putResp = await fetch(`${cfBase}/${recordId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ type: 'A', name: domain, content: vpsIp, proxied: false, ttl: 120 }),
      });
      const putData = (await putResp.json()) as { success: boolean; errors?: unknown[] };
      cfOk = putData.success;
      cfMsg = cfOk
        ? `Updated existing A-record for ${domain} → ${vpsIp}`
        : `Failed to update A-record: ${JSON.stringify(putData.errors)}`;
    } else {
      // Create new record
      const postResp = await fetch(cfBase, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'A', name: domain, content: vpsIp, proxied: false, ttl: 120 }),
      });
      const postData = (await postResp.json()) as { success: boolean; errors?: unknown[] };
      cfOk = postData.success;
      cfMsg = cfOk
        ? `Created A-record for ${domain} → ${vpsIp}`
        : `Failed to create A-record: ${JSON.stringify(postData.errors)}`;
    }

    lines.push(cfMsg);
    if (!cfOk) anyFailed = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`Cloudflare DNS error: ${msg}`);
    anyFailed = true;
  }

  // ── Step 2: Install nginx ───────────────────────────────────────────────────
  lines.push('=== Step 2: Install nginx ===');
  {
    const r = await runShell('sudo apt-get update -y && sudo apt-get install -y nginx');
    lines.push(r.out);
    if (!r.ok) anyFailed = true;
  }

  // ── Step 3: Write nginx config, symlink, test, reload ─────────────────────
  lines.push('=== Step 3: Configure nginx ===');
  {
    const nginxConf = `server {
    listen 80;
    server_name ${domain};
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
    const confPath = '/etc/nginx/sites-available/jarvis';
    try {
      await fs.writeFile(confPath, nginxConf, 'utf8');
      lines.push(`Wrote nginx config to ${confPath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`Failed to write nginx config: ${msg}`);
      anyFailed = true;
    }

    const symlinkResult = await runShell(
      'sudo ln -sf /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/jarvis',
    );
    lines.push(symlinkResult.out);
    if (!symlinkResult.ok) anyFailed = true;

    const testReload = await runShell('sudo nginx -t && sudo systemctl reload nginx');
    lines.push(testReload.out);
    if (!testReload.ok) anyFailed = true;
  }

  // ── Step 4: Install certbot ────────────────────────────────────────────────
  lines.push('=== Step 4: Install certbot ===');
  {
    const r = await runShell('sudo apt-get install -y certbot python3-certbot-nginx');
    lines.push(r.out);
    if (!r.ok) anyFailed = true;
  }

  // ── Step 5: Run certbot ────────────────────────────────────────────────────
  lines.push('=== Step 5: Run certbot ===');
  {
    const r = await runShell(
      `sudo certbot --nginx -d ${domain} -m ${email} --agree-tos --non-interactive --redirect`,
    );
    lines.push(r.out);
    if (!r.ok) anyFailed = true;
  }

  // ── Step 6: Return result ──────────────────────────────────────────────────
  const output = lines.join('\n');
  if (anyFailed) {
    return { ok: false, output, url: undefined };
  }
  return { ok: true, output, url: `https://${domain}` };
}
