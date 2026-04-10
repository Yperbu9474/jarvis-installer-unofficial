# jarv CLI

`jarv` is a command-line tool for installing, managing, and exposing [Jarvis AI](https://github.com/Yperbu9474/jarvis-installer-unofficial) daemon on your VPS.

---

## Installation

**One-liner** (Linux / macOS):

```bash
curl -fsSL https://raw.githubusercontent.com/Yperbu9474/jarvis-installer-unofficial/main/install-cli.sh | bash
```

This will:

1. Install Node.js 20 if missing
2. Clone the repository to `~/.jarv`
3. Build the CLI and link `jarv` to `/usr/local/bin`

### Manual install

```bash
git clone https://github.com/Yperbu9474/jarvis-installer-unofficial.git ~/.jarv
cd ~/.jarv
npm install --ignore-scripts
npx tsc -p tsconfig.cli.json
sudo ln -sf "$HOME/.jarv/dist-cli/jarv.js" /usr/local/bin/jarv
```

---

## Commands

### `jarv install`

Install the Jarvis daemon. Pulls the Docker image, creates a container, and writes a local profile.

```bash
jarv install
```

### `jarv start`

Start the Jarvis container.

```bash
jarv start
```

### `jarv stop`

Stop the running Jarvis container.

```bash
jarv stop
```

### `jarv restart`

Restart the Jarvis container (stop + start).

```bash
jarv restart
```

### `jarv status`

Show Jarvis status — container state, port, and recent log output.

```bash
jarv status
```

### `jarv update`

Pull the latest Jarvis Docker image and restart the container.

```bash
jarv update
```

### `jarv proxy`

Set up an **nginx + Let's Encrypt SSL** reverse proxy on your Linux VPS so Jarvis is accessible over HTTPS.

```bash
jarv proxy [flags]
```

#### Flags

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--domain` | `-d` | Full domain name (e.g. `jarvis.example.com`) | *(prompted)* |
| `--cf-token` | | Cloudflare API token (needs **DNS:Edit** permission) | *(prompted, hidden)* |
| `--cf-zone` | | Cloudflare Zone ID | *(prompted)* |
| `--email` | | Email for Let's Encrypt / certbot registration | *(prompted)* |
| `--vps-ip` | `--ip` | VPS public IP address | *(auto-detected)* |
| `--port` | `-p` | Local Jarvis port to reverse-proxy to | `3000` |

#### What it does

1. **Cloudflare DNS** — Creates or updates an A-record pointing your domain to the VPS IP.
2. **nginx** — Installs nginx and writes a reverse-proxy site config.
3. **certbot** — Installs certbot and obtains a free Let's Encrypt TLS certificate with automatic HTTPS redirect.

#### Example

```bash
jarv proxy \
  --domain jarvis.example.com \
  --cf-token xxxxxxxxxxx \
  --cf-zone zzzzzzzzz \
  --email user@example.com
```

If you omit flags, `jarv proxy` will prompt you interactively for each value.

### `jarv help`

Show available commands and usage.

```bash
jarv help
```

---

## VPS Quick Start

Get Jarvis up and running with HTTPS in three commands:

```bash
# 1. Install the Jarvis daemon
jarv install

# 2. Set up HTTPS reverse proxy (interactive — prompts for domain, CF token, etc.)
jarv proxy --domain jarvis.example.com --email user@example.com

# 3. Visit your dashboard
# https://jarvis.example.com
```

---

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 18+ | The install script auto-installs Node 20 if missing |
| **Docker** | 20+ | Required for `jarv install` / container management |
| **Linux** | Ubuntu 20.04+ recommended | `jarv proxy` requires Linux (nginx + certbot) |
| **git** | any | Used to clone and update the installer |

### For `jarv proxy` specifically

- A **domain name** pointed at your VPS (Cloudflare DNS managed)
- A **Cloudflare API token** with **DNS:Edit** permission for the zone
- **Port 80 and 443** open in your VPS firewall / security group

---

## Troubleshooting

### `jarv: command not found`

The symlink may not be on your PATH. Re-run the installer or manually link:

```bash
sudo ln -sf "$HOME/.jarv/dist-cli/jarv.js" /usr/local/bin/jarv
```

### `jarv proxy` fails at "Install nginx"

Make sure `apt-get` is available and you have sudo access:

```bash
sudo apt-get update && sudo apt-get install -y nginx
```

### Certbot fails to obtain a certificate

- Ensure **port 80** is open (Let's Encrypt uses HTTP-01 challenge).
- Ensure the **DNS A-record** has propagated (`dig +short YOUR_DOMAIN`).
- If using Cloudflare proxy (orange cloud), set it to **DNS only** (grey cloud) while obtaining the certificate.

### Docker permission errors

Add your user to the docker group:

```bash
sudo usermod -aG docker $USER
# Log out and back in for the change to take effect
```

### Node.js version too old

`jarv` requires Node.js 18+ (for built-in `fetch`). Check your version:

```bash
node --version
```

Upgrade via [NodeSource](https://github.com/nodesource/distributions) or use `nvm`:

```bash
nvm install 20
nvm use 20
```
