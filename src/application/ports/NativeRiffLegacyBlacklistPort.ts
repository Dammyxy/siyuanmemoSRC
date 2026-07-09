export interface NativeRiffLegacyBlacklistPort {
  listBlockIds(): Promise<readonly string[]>;
  clear(): Promise<void>;
}
