import { Command, Args } from "@oclif/core";
import { prepareKubeconfig, runKubectl } from "../../lib/kube.js";
import { api } from "../../lib/api.js";
import { resolveAppId } from "../../lib/helpers.js";

const PAAS = "darkube";

export default class AppPortForward extends Command {
  static description = "Forward local ports to an app's pod (auto-finds the pod name)";
  static args = {
    app: Args.string({ description: "App name or ID", required: true }),
    ports: Args.string({ description: "Ports to forward, e.g. 3306:3306 (bare ports map to the app's internal port)", multiple: true }),
  };

  async run() {
    const { args } = await this.parse(AppPortForward);

    const rawPorts = (args.ports ?? []) as string[];
    if (rawPorts.length === 0) {
      this.error(
        "Usage: h8 app port-forward <app> <port|port:port> [...]\n" +
        "Example: h8 app port-forward myapp 3306",
      );
    }

    const appId = await resolveAppId(args.app);

    const app = await api<Record<string, unknown>>(`/api/v2/${PAAS}/apps/${appId}/`);
    const cluster = (app.cluster as Record<string, unknown>)?.name as string | undefined;
    const namespace = (app.namespace as Record<string, unknown>)?.name as string | undefined;

    const svcPorts = Object.values(
      ((app.svc ?? {}) as Record<string, unknown>).ports as Record<string, { servicePort?: number; containerPort?: number }> ?? {},
    );

    const ports = rawPorts.map((p) => {
      if (p.includes(":")) return p;
      const num = Number(p);
      if (Number.isNaN(num)) return p;
      const match = svcPorts.find((e) => e.servicePort === num) ?? svcPorts.find((e) => e.containerPort === num);
      return match && match.containerPort && match.containerPort !== num ? `${p}:${match.containerPort}` : p;
    });

    const containers = await api<Record<string, string[]>>(
      `/api/v1/${PAAS}/apps/${appId}/app_containers/`,
    );
    const entries = Object.entries(containers ?? {});
    if (entries.length === 0) {
      this.error(`No pods found for app "${args.app}". The app may be stopped.`);
    }

    const podName = entries[0][0];
    this.log(`Forwarding ${ports.join(", ")} to pod: ${podName}`);

    const { path, cleanup } = await prepareKubeconfig({
      cluster,
      namespace,
      log: (msg: string) => this.log(msg),
    });

    try {
      const status = runKubectl(["port-forward", `pod/${podName}`, ...ports], path);
      if (status !== 0) process.exitCode = status;
    } finally {
      cleanup();
    }
  }
}
