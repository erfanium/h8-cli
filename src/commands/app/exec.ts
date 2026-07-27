import { Command, Args } from "@oclif/core";
import { resolveAppId } from "../../lib/helpers.js";
import { prepareKubeconfig, runKubectl } from "../../lib/kube.js";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

export default class AppExec extends Command {
  static description = "Run a command inside an app's pod (auto-finds the pod name)";
  static strict = false as false;
  static args = {
    app: Args.string({ description: "App name or ID", required: true }),
  };

  async run() {
    const { args } = await this.parse(AppExec);
    const appId = await resolveAppId(args.app);

    const raw = process.argv.slice(3);
    const dashIdx = raw.indexOf("--");
    if (dashIdx === -1 || dashIdx + 1 >= raw.length) {
      this.error("Usage: h8 app exec <app> -- <command...>\nExample: h8 app exec myapp -- ls /app");
    }
    const execArgs = raw.slice(dashIdx + 1);

    const { path, cleanup } = await prepareKubeconfig();

    try {
      const podsJson = execKubectlJson(["get", "pods", "-o", "json"], path);
      const items = (podsJson as { items?: Array<Record<string, unknown>> }).items ?? [];
      const readyPods = items.filter((p) => {
        const meta = p.metadata as Record<string, unknown> | undefined;
        const name = String(meta?.name ?? "");
        if (!name.startsWith(args.app)) return false;
        const status = p.status as Record<string, unknown> | undefined;
        const conditions = status?.conditions as Array<Record<string, unknown>> | undefined;
        const ready = conditions?.find((c) => c.type === "Ready");
        return ready?.status === "True";
      });

      if (readyPods.length === 0) {
        const allPods = items.filter((p) => {
          const meta = p.metadata as Record<string, unknown> | undefined;
          return String(meta?.name ?? "").startsWith(args.app);
        });
        if (allPods.length === 0) {
          this.error(`No pods found for app "${args.app}". The app may be stopped.`);
        }
        this.error(`No Ready pods found for "${args.app}". ${allPods.length} pod(s) exist but none are Ready yet. Try again shortly.`);
      }

      const podName = String((readyPods[0].metadata as Record<string, unknown>)?.name);
      if (readyPods.length > 1) {
        this.log(`Multiple pods found (${readyPods.length}). Exec-ing into first Ready pod: ${podName}`);
        this.log(`To target a specific pod: h8 kubectl exec -it <pod-name> -- ${execArgs.join(" ")}`);
      }

      const status = runKubectl(["exec", "-it", podName, "--", ...execArgs], path);
      if (status !== 0) process.exitCode = status;
    } finally {
      cleanup();
    }
  }
}

function execKubectlJson(args: string[], kubeconfigPath: string): unknown {
  const tmpFile = join(tmpdir(), `h8-exec-${Date.now()}.json`);
  try {
    const result = spawnSync("kubectl", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, KUBECONFIG: kubeconfigPath },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`kubectl failed (${result.status}): ${result.stderr.toString()}`);
    }
    return JSON.parse(result.stdout.toString());
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}
