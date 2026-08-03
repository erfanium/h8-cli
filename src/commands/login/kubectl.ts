import { Command } from "@oclif/core";
import http from "node:http";
import { exec } from "node:child_process";
import { saveRefreshToken } from "../../lib/kube.js";

const ISSUER = "https://api.console.hamravesh.ir/openid";
const CLIENT_ID = "kubernetes";

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
  const authUrl = `${ISSUER}/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("openid profile email offline_access")}`;

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

export default class LoginKubectl extends Command {
  static description = "Get a k8s OIDC token via browser login";

  async run() {
    const tokens = JSON.parse(await browserLogin()) as { access_token: string; id_token: string; refresh_token: string };

    const org = process.env.H8_ORGANIZATION?.trim() || "default";

    saveRefreshToken(org, tokens.refresh_token);
    this.log("Refresh token saved successfully.");
  }
}
