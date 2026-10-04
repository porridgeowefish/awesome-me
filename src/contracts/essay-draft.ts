import type { ResourceData } from './content';
export interface EssayWorkingDraft {
  data: ResourceData<'essays'>;
  revision: number;
  baseRevision: number;
  updatedAt: string;
}
