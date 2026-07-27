import { Command, Flags } from "@oclif/core";
import { prepareKubeconfig, runKubectl } from "../lib/kube.js";

export default class Kubectl extends Command {
  static description = "Run kubectl against your Darkube namespace";
  static strict = false as false;
  static flags = {
    cluster: Flags.string({ description: "Target cluster name", char: "c" }),
    namespace: Flags.string({ description: "Target namespace", char: "n" }),
  };

  async run() {
    let flags: { cluster?: string; namespace?: string };
    try {
      ({ flags } = await this.parse(Kubectl));
    } catch {
      flags = {};
      const raw = process.argv.slice(3);
      for (let i = 0; i < raw.length; i++) {
        if ((raw[i] === "-c" || raw[i] === "--cluster") && raw[i + 1]) {
          flags.cluster = raw[i + 1];
        }
        if ((raw[i] === "-n" || raw[i] === "--namespace") && raw[i + 1]) {
          flags.namespace = raw[i + 1];
        }
      }
    }

    const { path, cleanup } = await prepareKubeconfig({ cluster: flags.cluster, namespace: flags.namespace });

    try {
      const args = process.argv.slice(3).filter((a, i, arr) => {
        if (a === "-c" || a === "--cluster" || a === "-n" || a === "--namespace") {
          arr[i + 1] = "__skip__";
          return false;
        }
        return a !== "__skip__";
      });
      if (args.length === 0) {
        this.log("Usage: h8 kubectl <kubectl-args>");
        this.log("Examples:");
        this.log("  h8 kubectl get pods");
        this.log("  h8 kubectl logs <pod-name>");
        return;
      }

      const status = runKubectl(args, path);
      if (status !== 0) process.exitCode = status;
    } finally {
      cleanup();
    }
  }
}
