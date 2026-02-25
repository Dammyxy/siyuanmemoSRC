export interface CardCreationSiyuanPort {
  getBlockText(blockId: string): Promise<string>;
}
