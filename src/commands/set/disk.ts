import { Command, Args, Flags } from "@oclif/core";
import { resolveAppId, getWritable, putAppConfig } from "../../lib/helpers.js";

interface DiskConfig {
  storage_class_name: string;
  size_in_Gi: number;
  partitions: Array<{ display_name: string; mount_path: string }>;
}

export default class SetDisk extends Command {
  static description = "Add persistent disk to an app";
  static args = {
    app: Args.string({ description: "App name or ID", required: true }),
    size: Args.integer({ description: "Disk size in GiB", required: true }),
    mountPath: Args.string({ description: "Mount path", required: true }),
  };
  static flags = {
    name: Flags.string({ description: "Partition name", default: "data" }),
    "storage-class": Flags.string({ description: "Storage class", default: "rawfile-btrfs" }),
  };

  async run() {
    const { args, flags } = await this.parse(SetDisk);
    const appId = await resolveAppId(args.app);
    const config = await getWritable(appId);

    const existingDisk = (config as unknown as Record<string, unknown>).disk as DiskConfig | null;
    const existingPartitions: Array<{ display_name: string; mount_path: string }> = existingDisk?.partitions ?? [];
    const existingSize = existingDisk?.size_in_Gi ?? 0;
    const sc = flags["storage-class"] || existingDisk?.storage_class_name || "rawfile-btrfs";

    const other = existingPartitions.filter((p) => p.display_name !== flags.name);
    const partitions = [...other, { display_name: flags.name, mount_path: args.mountPath }];

    (config as unknown as Record<string, unknown>).disk = {
      storage_class_name: sc,
      size_in_Gi: Math.max(existingSize, args.size),
      partitions,
    };

    await putAppConfig(appId, config);
    this.log(`Attached ${args.size}GiB disk to "${args.app}":`);
    for (const p of partitions) {
      this.log(`  ${p.display_name}: ${p.mount_path} (${sc})`);
    }
  }
}
