import { Command, Flags } from "@oclif/core";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import http from "node:http";
import { exec } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TOKEN_DIR = join(tmpdir(), "h8");
const REF_TOKEN_FILE = join(TOKEN_DIR, ".ref");

const ISSUER = "https://api.console.hamravesh.ir/openid";
const CLIENT_ID = "kubernetes";

function prompt(q: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); resolve(a.trim()); }));
}

function promptSecret(q: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(q);
    if (!stdin.isTTY) {
      const rl = createInterface({ input: stdin, output: stdout });
      rl.on("line", (line) => { rl.close(); resolve(line.trim()); });
      return;
    }
    let secret = "";
    stdin.setRawMode(true);
    stdin.resume();
    function onData(buf: Buffer) {
      for (const b of buf) {
        if (b === 0x0d || b === 0x0a) {
          stdout.write("\n");
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          resolve(secret);
          return;
        }
        if (b === 0x03) { process.exit(1); }
        if (b === 0x7f) {
          if (secret.length > 0) { secret = secret.slice(0, -1); stdout.write("\b \b"); }
          continue;
        }
        secret += String.fromCharCode(b);
        stdout.write("*");
      }
    }
    stdin.on("data", onData);
  });
}

const REDIRECT_PORTS = [8000, 18000];

async function startServer(): Promise<{ server: http.Server; port: number }> {
  for (const port of REDIRECT_PORTS) {
    try {
      const server = http.createServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, resolve);
      });
      return { server, port };
    } catch {
      // port in use, try next
    }
  }
  throw new Error("Ports 8000 and 18000 are in use. Free one and retry.");
}

async function browserLogin(): Promise<string> {
  const { server, port } = await startServer();
  const redirectUri = `http://localhost:${port}`;
  const authUrl = `${ISSUER}/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("openid profile email")}`;

  console.log("Opening browser for login...");
  console.log(`If the browser does not open, visit:\n  ${authUrl}`);

  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(authUrl)}`);

  const token = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 2 minutes."));
    }, 120_000);

    server.on("request", async (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.end(`Login error: ${error}. You can close this window.`);
        clearTimeout(timeout);
        server.close();
        reject(new Error(`Authorization error: ${error}`));
        return;
      }
      if (!code) {
        res.end("Authorization code not found. You can close this window.");
        clearTimeout(timeout);
        return;
      }

      res.end("Logged in successfully! You can close this window.");
      clearTimeout(timeout);
      server.close();

      try {
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          code,
          redirect_uri: redirectUri,
        });

        const tokenRes = await fetch(`${ISSUER}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          reject(new Error(`OIDC token request failed (${tokenRes.status}): ${text.slice(0, 200)}`));
          return;
        }

        const data = await tokenRes.json() as { access_token: string; id_token: string; refresh_token: string };
        resolve(JSON.stringify({
          access_token: data.access_token,
          id_token: data.id_token,
          refresh_token: data.refresh_token,
        }));
      } catch (e) {
        reject(e);
      }
    });
  });

  return token;
}

async function passwordLogin(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: CLIENT_ID,
    username: email,
    password,
    scope: "openid profile email",
  });

  const res = await fetch(`${ISSUER}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OIDC token request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { access_token: string; id_token: string; refresh_token: string };
  return JSON.stringify({
    access_token: data.access_token,
    id_token: data.id_token,
    refresh_token: data.refresh_token,
  });
}

export default class LoginKubectl extends Command {
  static description = "Get a k8s OIDC token";
  static flags = {
    email: Flags.string({ description: "Console email (password grant)" }),
    password: Flags.string({ description: "Console password (password grant)" }),
    browser: Flags.boolean({ description: "Use browser-based login (default)", default: true, allowNo: true }),
  };

  async run() {
    const { flags } = await this.parse(LoginKubectl);

    const raw = flags.browser
      ? await browserLogin()
      : await passwordLogin(
          flags.email || await prompt("Email: "),
          flags.password || await promptSecret("Password: "),
        );
    const tokens = JSON.parse(raw) as { access_token: string; id_token: string; refresh_token: string };

    mkdirSync(TOKEN_DIR, { recursive: true });
    writeFileSync(REF_TOKEN_FILE, tokens.refresh_token, "utf-8");

    this.log("");
    this.log("Refresh token:");
    this.log(`  ${tokens.refresh_token}`);
    this.log("");
    this.log("Set it as an environment variable to avoid re-login:");
    this.log('  export H8_KUBECTL_REFRESH_TOKEN="' + tokens.refresh_token + '"');
    this.log("");
    this.log("Add the export line to your shell profile (.bashrc / .zshrc) to persist it.");
    this.log("(Saved to /tmp/h8/.ref as fallback.)");
  }
}
