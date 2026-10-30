import type { ModelSettingsStore } from "@/data/model-settings";
/** Private transport/configuration snapshot; never put keys in UI state. */
export type Connection = Awaited<ReturnType<ModelSettingsStore["resolveConnection"]>>;
