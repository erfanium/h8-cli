import { Command, Args, Flags } from "@oclif/core";
import { resolveAppId, getWritable, putAppConfig } from "../../lib/helpers.js";

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

    (config as unknown as Record<string, unknown>).disk = {
      storage_class_name: flags["storage-class"],
      size_in_Gi: args.size,
      partitions: [{ display_name: flags.name, mount_path: args.mountPath }],
    };

    await putAppConfig(appId, config);
    this.log(`Attached ${args.size}GiB disk to "${args.app}":`);
    this.log(`  ${flags.name}: ${args.mountPath} (${flags["storage-class"]})`);
  }
}
