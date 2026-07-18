import { Command } from "@oclif/core";
import { getConfig } from "../lib/config.js";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, dump } from "js-yaml";

export default class Kubectl extends Command {
  static description = "Run kubectl against your Darkube namespace";
  static strict = false;

  async run() {
    const config = getConfig();
    const org = config.organization || process.env.H8_ORGANIZATION || "";
    if (!org) throw new Error("H8_ORGANIZATION not set.");

    const token = process.env.H8_KUBECTL_TOKEN;
    if (!token) {
      this.log("H8_KUBECTL_TOKEN not set.");
      this.log("Run: h8 login kubectl  (to get a token)");
      this.log("Then: export H8_KUBECTL_TOKEN=<token>");
      return;
    }

    const headers: Record<string, string> = {
      "Authorization": `Api-key ${config.api_key}`,
      "x-organization": org,
    };
    const res = await fetch(`${config.base_url}/api/v1/darkube/kubeconfig/generate/`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch kubeconfig: ${res.status}`);

    const kcfg = load(await res.text()) as Record<string, unknown>;

    // Replace OIDC exec with static token
    const users = kcfg.users as Array<Record<string, unknown>>;
    for (const u of users) {
      if (u.user && typeof u.user === "object") {
        const user = u.user as Record<string, unknown>;
        delete user.exec;
        user.token = token;
      }
    }

    const tmpFile = join(tmpdir(), `h8-kubeconfig-${Date.now()}.yaml`);
    writeFileSync(tmpFile, dump(kcfg, { lineWidth: -1 }), "utf-8");

    try {
      const args = process.argv.slice(3);
      if (args.length === 0) {
        this.log("Usage: h8 kubectl <kubectl-args>");
        this.log("Examples:");
        this.log("  h8 kubectl get pods");
        this.log("  h8 kubectl logs <pod-name>");
        return;
      }

      const result = spawnSync("kubectl", args, {
        stdio: "inherit",
        env: { ...process.env, KUBECONFIG: tmpFile },
      });

      if (result.error) throw result.error;
      if (result.status !== 0) process.exitCode = result.status ?? 1;
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }
}
