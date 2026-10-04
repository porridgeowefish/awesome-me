import { describe,expect,it } from 'vitest';
import { changedVisualKinds,initialVisualDrafts,persistVisualChanges,VisualValidationError,type VisualRecords } from '../../src/features/admin/visual-editor-model';
import type { ContentRecord } from '../../src/contracts/content';
import { profile } from '../../src/data/profile';

const record=(kind:'site'|'profile',data:Record<string,unknown>,revision=1)=>({id:'default',kind,data,revision,order:0,createdAt:'2026-10-03',updatedAt:'2026-10-03'} as ContentRecord);
function fixture(){const empty={site:null,profile:record('profile',profile as unknown as Record<string,unknown>)};const drafts=initialVisualDrafts(empty);const records:VisualRecords={site:record('site',drafts.site),profile:empty.profile};return {records,baseline:structuredClone(drafts),drafts};}
describe('merged visual editor saves',()=>{
  it('starts clean and only writes the resource that was edited',async()=>{
    const state=fixture();expect(changedVisualKinds(state.drafts,state.baseline)).toEqual([]);state.drafts.profile.name='新姓名';
    const writes:string[]=[];await persistVisualChanges(state,async(kind,data,previous)=>{writes.push(kind);expect(previous?.revision).toBe(1);return record(kind,data,2);},()=>{});expect(writes).toEqual(['profile']);
  });
  it('validates both resources before any mutation',async()=>{
    const state=fixture();state.drafts.site.footer='新页脚';state.drafts.profile.name='';let writes=0;
    await expect(persistVisualChanges(state,async()=>{writes++;throw new Error();},()=>{})).rejects.toBeInstanceOf(VisualValidationError);expect(writes).toBe(0);
  });
  it('keeps the acknowledged revision and only retries remaining edits after a partial failure',async()=>{
    const state=fixture();state.drafts.site.footer='新页脚';state.drafts.profile.name='新姓名';
    const acknowledge=(kind:'site'|'profile',row:ContentRecord)=>{state.records[kind]=row;state.drafts[kind]=row.data as Record<string,unknown>;state.baseline[kind]=structuredClone(state.drafts[kind]);};
    await expect(persistVisualChanges(state,async(kind,data)=>{if(kind==='profile')throw new Error('conflict');return record(kind,data,5);},acknowledge)).rejects.toThrow('conflict');
    expect(state.records.site?.revision).toBe(5);expect(changedVisualKinds(state.drafts,state.baseline)).toEqual(['profile']);
    const writes:string[]=[];await persistVisualChanges(state,async(kind,data)=>{writes.push(kind);return record(kind,data,2);},acknowledge);expect(writes).toEqual(['profile']);expect(changedVisualKinds(state.drafts,state.baseline)).toEqual([]);
  });
  it('does not write untouched drafts',async()=>{
    let writes=0;expect(await persistVisualChanges(fixture(),async()=>{writes++;throw new Error();},()=>{})).toBe(0);expect(writes).toBe(0);
  });
});
