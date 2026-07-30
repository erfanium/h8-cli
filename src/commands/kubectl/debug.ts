import { Command } from "@oclif/core";
import { prepareKubeconfig } from "../../lib/kube.js";
import { readFileSync, unlinkSync } from "node:fs";
import { load } from "js-yaml";

export default class KubectlDebug extends Command {
  static description = "Show kubectl credentials used for auth";

  async run() {
    const { path, cleanup } = await prepareKubeconfig({
      log: (msg: string) => this.log(msg),
    });

    try {
      const raw = readFileSync(path, "utf-8");
      const kcfg = load(raw) as Record<string, unknown>;

      const currentCtx = kcfg["current-context"] as string;
      const contexts = kcfg.contexts as Array<{ name: string; context: { cluster: string; namespace?: string; user?: string } }>;
      const clusters = kcfg.clusters as Array<{ name: string; cluster: { server: string } }>;
      const users = kcfg.users as Array<{ name: string; user: { token?: string } }>;

      const ctx = contexts?.find((c) => c.name === currentCtx);
      const cluster = clusters?.find((c) => c.name === ctx?.context?.cluster);
      const user = users?.find((u) => u.name === ctx?.context?.user);

      this.log(`Context:     ${currentCtx || "-"}`);
      this.log(`Cluster:     ${cluster?.name ?? "-"}`);
      this.log(`Server:      ${cluster?.cluster?.server ?? "-"}`);
      this.log(`Namespace:   ${ctx?.context?.namespace || "(default)"}`);
      this.log(`User:        ${user?.name ?? "-"}`);

      if (user?.user?.token) {
        const parts = user.user.token.split(".");
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
            this.log(`Token sub:   ${payload.sub ?? "-"}`);
            this.log(`Token iss:   ${payload.iss ?? "-"}`);
            this.log(`Token exp:   ${new Date((payload.exp as number) * 1000).toISOString()}`);
          } catch {}
        }
      }

      if (contexts) {
        this.log(`\nAll contexts (${contexts.length}):`);
        for (const c of contexts) {
          const marker = c.name === currentCtx ? "*" : " ";
          this.log(`  ${marker} ${c.name}  →  ${c.context.cluster}  /  ${c.context.namespace || "(default)"}`);
        }
      }
    } finally {
      try { unlinkSync(path); } catch {}
      cleanup();
    }
  }
}
