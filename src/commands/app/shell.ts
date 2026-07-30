import { Command, Args } from "@oclif/core";
import { prepareKubeconfig } from "../../lib/kube.js";
import { api } from "../../lib/api.js";
import { resolveAppId } from "../../lib/helpers.js";
import { spawnSync } from "node:child_process";

const PAAS = "darkube";

export default class AppShell extends Command {
  static description = "Open an interactive shell inside an app's pod";
  static args = {
    app: Args.string({ description: "App name or ID", required: true }),
  };

  async run() {
    const { args } = await this.parse(AppShell);

    const appId = await resolveAppId(args.app);

    const app = await api<{ cluster: { name: string }; namespace: { name: string } }>(
      `/api/v2/${PAAS}/apps/${appId}/?fields=cluster,name,namespace`,
    );
    const cluster = app.cluster?.name;
    const namespace = app.namespace?.name;

    const containers = await api<Record<string, string[]>>(
      `/api/v1/${PAAS}/apps/${appId}/app_containers/`,
    );
    const entries = Object.entries(containers ?? {});
    if (entries.length === 0) {
      this.error(`No pods found for app "${args.app}". The app may be stopped.`);
    }

    const podName = entries[0][0];
    this.log(`Shell-ing into pod: ${podName}`);

    const { path, cleanup } = await prepareKubeconfig({
      cluster,
      namespace,
      log: (msg: string) => this.log(msg),
    });

    try {
      const shells = ["/bin/sh", "/bin/bash", "/busybox/sh"];
      let status = -1;
      for (const shell of shells) {
        status = runKubectl(["exec", "-it", podName, "--", ...shell.split(" ")], path);
        if (status === 0 || status === 130) break;
        if (status !== 0) {
          const reason = status === 126 ? `${shell}: permission denied` : `${shell}: not found`;
          this.log(`Tried ${shell}: ${reason}`);
        }
      }
      if (status !== 0 && status !== 130) process.exitCode = status;
    } finally {
      cleanup();
    }
  }
}

function runKubectl(args: string[], kubeconfigPath: string): number {
  const result = spawnSync("kubectl", args, {
    stdio: "inherit",
    env: { ...process.env, KUBECONFIG: kubeconfigPath },
  });
  if (result.error) throw result.error;
  return result.status ?? 0;
}
