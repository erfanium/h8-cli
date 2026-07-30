import { Command, Args } from "@oclif/core";
import { prepareKubeconfig, runKubectl } from "../../lib/kube.js";
import { api } from "../../lib/api.js";
import { resolveAppId } from "../../lib/helpers.js";

const PAAS = "darkube";

export default class AppExec extends Command {
  static description = "Run a command inside an app's pod (auto-finds the pod name)";
  static strict = false as false;
  static args = {
    app: Args.string({ description: "App name or ID", required: true }),
  };

  async run() {
    const { args } = await this.parse(AppExec);

    const raw = process.argv.slice(3);
    const dashIdx = raw.indexOf("--");
    if (dashIdx === -1 || dashIdx + 1 >= raw.length) {
      this.error("Usage: h8 app exec <app> -- <command...>\nExample: h8 app exec myapp -- ls /app");
    }
    const execArgs = raw.slice(dashIdx + 1);

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
    this.log(`Exec-ing into pod: ${podName}`);

    const { path, cleanup } = await prepareKubeconfig({
      cluster,
      namespace,
      log: (msg: string) => this.log(msg),
    });

    try {
      const status = runKubectl(["exec", "-it", podName, "--", ...execArgs], path);
      if (status !== 0) process.exitCode = status;
    } finally {
      cleanup();
    }
  }
}
