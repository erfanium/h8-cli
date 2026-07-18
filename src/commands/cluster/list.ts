import { Command, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printTable, printJSON } from "../../lib/format.js";

export default class ClusterList extends Command {
  static description = "List available clusters";
  static flags = { json: Flags.boolean({ description: "JSON output" }) };

  async run() {
    const { flags } = await this.parse(ClusterList);
    const profile = await api<{
      organizations: Array<{
        available_clusters: Array<Record<string, unknown>>;
      }>;
    }>("/api/v2/users/profile");
    const clusters = profile.organizations[0]?.available_clusters ?? [];
    if (flags.json) { this.log(printJSON(clusters)); return; }
    this.log(printTable(clusters,
      ["NAME", "LOCATION", "DOMAIN", "INGRESS", "CAPACITY"],
      [
        (r) => (r.name as string) ?? "",
        (r) => `${r.location_country} / ${(r.location_datacenter as string) ?? ""}`,
        (r) => (r.apps_custom_base_domain as string) ?? "",
        (r) => (r.ingress_controller_type as string) ?? "",
        (r) => r.has_capacity_to_create_app ? "yes" : "no",
      ],
    ));
  }
}
