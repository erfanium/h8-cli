import { Command, Args } from "@oclif/core";
import { resolveAppId, getWritable, putAppConfig } from "../../lib/helpers.js";

function parseImage(raw: string): { repo: string; tag?: string } {
  const idx = raw.lastIndexOf(":");
  if (idx === -1) return { repo: raw };
  const tag = raw.slice(idx + 1);
  const repo = raw.slice(0, idx);
  if (tag.includes("/")) return { repo: raw };
  return { repo, tag };
}

export default class SetImage extends Command {
  static description = "Set the image for an app";
  static args = {
    app: Args.string({ description: "App name or ID", required: true }),
    image: Args.string({ description: "Image (repo:tag)", required: true }),
  };

  async run() {
    const { args } = await this.parse(SetImage);
    const appId = await resolveAppId(args.app);
    const config = await getWritable(appId);
    const parsed = parseImage(args.image);
    const oldRepo = config.image_repo;
    const oldTag = config.image_tag;
    config.image_repo = parsed.repo;
    if (parsed.tag) config.image_tag = parsed.tag;
    await putAppConfig(appId, config);
    this.log(`Updated "${args.app}" image:`);
    this.log(`  ${oldRepo}:${oldTag} -> ${config.image_repo}:${config.image_tag}`);
  }
}
