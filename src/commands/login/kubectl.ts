import { Command, Flags } from "@oclif/core";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const ISSUER = "https://api.console.hamravesh.ir/openid";
const CLIENT_ID = "kubernetes";
const TOKEN_URL = `${ISSUER}/token`;

function prompt(q: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); resolve(a.trim()); }));
}

function promptSecret(q: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(q);
    if (!stdin.isTTY) {
      // non-TTY: read a line
      const rl = createInterface({ input: stdin, output: stdout });
      rl.on("line", (line) => { rl.close(); resolve(line.trim()); });
      return;
    }
    let secret = "";
    stdin.setRawMode(true);
    stdin.resume();
    function onData(buf: Buffer) {
      for (const b of buf) {
        if (b === 0x0d || b === 0x0a) { // Enter / newline
          stdout.write("\n");
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          resolve(secret);
          return;
        }
        if (b === 0x03) { process.exit(1); } // Ctrl+C
        if (b === 0x7f) { // Backspace
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

export default class LoginKubectl extends Command {
  static description = "Get a k8s OIDC token via password grant";
  static flags = {
    email: Flags.string({ description: "Console email" }),
    password: Flags.string({ description: "Console password" }),
  };

  async run() {
    const { flags } = await this.parse(LoginKubectl);
    const email = flags.email || await prompt("Email: ");
    const password = flags.password || await promptSecret("Password: ");
    if (!email || !password) {
      this.error("Email and password are required.");
    }

    const body = new URLSearchParams({
      grant_type: "password",
      client_id: CLIENT_ID,
      username: email,
      password,
      scope: "openid profile email",
    });

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      this.error(`OIDC token request failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { id_token: string };
    this.log(data.id_token);
  }
}
