import { Command, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printTable, printJSON, stateIcon } from "../../lib/format.js";

const PAAS = "darkube";
const FIELDS = [
  "id", "namespace", "cluster", "state", "name", "creation_method",
  "build_options", "custom_domain_address", "mirror_custom_domain_address",
  "external_hosts", "ram_limit", "cpu_request", "is_deployable",
  "is_hpa_enbaled", "is_enabled", "replicas", "custom_subdomain_addr",
  "plan", "template_fields", "custom_config", "disk", "enable_SSL",
  "database_properties", "latest_build",
].join(",");

export default class AppList extends Command {
  static description = "List apps";
  static flags = {
    json: Flags.boolean({ description: "JSON output" }),
    limit: Flags.integer({ description: "Max results", default: 50 }),
    offset: Flags.integer({ description: "Pagination offset", default: 0 }),
  };

  async run() {
    const { flags } = await this.parse(AppList);
    const res = await api<{ results: Record<string, unknown>[] }>(
      `/api/v2/${PAAS}/apps/?limit=${flags.limit}&offset=${flags.offset}&fields=${FIELDS}`,
    );
    if (flags.json) { this.log(printJSON(res.results)); return; }
    this.log(printTable(res.results,
      ["NAME", "STATE", "NS", "CLUSTER", "PLAN", "REPLICAS", "DISKS", "DOMAIN"],
      [
        (r) => (r.name as string) ?? "",
        (r) => `${stateIcon(r.state as Record<string, unknown>)} ${(r.state as Record<string, unknown>)?.state_type ?? ""}`,
        (r) => ((r.namespace as Record<string, unknown>)?.name as string) ?? "",
        (r) => ((r.cluster as Record<string, unknown>)?.name as string) ?? "",
        (r) => {
          const p = r.plan as Record<string, unknown>;
          const d = p?.detail as Record<string, number>;
          return `${d?.cpu_request ?? "?"}m/${d?.ram_limit ?? "?"}M`;
        },
        (r) => String(r.replicas ?? 0),
        (r) => {
          const disks = r.disk as Record<string, unknown> | undefined;
          if (!disks || !disks.size_in_Gi) return "-";
          const parts = disks.partitions as Array<Record<string, unknown>> | undefined;
          return `${disks.size_in_Gi}GiB` + (parts?.length ? ` (${parts.map((p) => p.mount_path).join(", ")})` : "");
        },
        (r) => (r.custom_domain_address as string) ?? "",
      ],
    ));
  }
}
