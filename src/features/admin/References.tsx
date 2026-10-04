import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ContentRecord, ResourceKind } from '../../contracts/content';
import { api } from './api';
interface References {footprints:ContentRecord<'footprints'>[];photos:ContentRecord<'gallery'>[];brands:ContentRecord<'brands'>[]}
const Context=createContext<References>({footprints:[],photos:[],brands:[]});
export const useAdminReferences=()=>useContext(Context);
export function AdminReferences({children}:{children:ReactNode}) {
  const [references,setReferences]=useState<References>({footprints:[],photos:[],brands:[]}),[error,setError]=useState('');
  useEffect(()=>{let alive=true;
    const list=async(kind:ResourceKind)=>{const rows:ContentRecord[]=[];for(let offset=0;offset<10000;offset+=1000){const page=await api<{items:ContentRecord[];total:number}>(`/api/v1/admin/${kind}?limit=1000&offset=${offset}`);rows.push(...page.items);if(rows.length>=page.total)break;}return rows;};
    void Promise.all([list('footprints'),list('gallery'),list('brands')]).then(([footprints,photos,brands])=>{if(alive)setReferences({footprints:footprints as References['footprints'],photos:photos as References['photos'],brands:brands as References['brands']});}).catch(e=>alive&&setError((e as Error).message));return()=>{alive=false;};
  },[]);
  return <Context.Provider value={references}>{error&&<p role="alert" className="admin-errors">关联内容未能加载：{error}</p>}{children}</Context.Provider>;
}
