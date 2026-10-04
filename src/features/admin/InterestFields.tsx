import { useRef,useState } from 'react';

export function InterestFields({value,onChange}:{value:string[];onChange:(value:string[])=>void}) {
  const [newInterest,setNewInterest]=useState(''),[message,setMessage]=useState('');
  const input=useRef<HTMLInputElement>(null);
  function add(){
    const interest=newInterest.trim();
    if(!interest){setMessage('先输入一个爱好，例如游泳。');input.current?.focus();return;}
    if(interest.length>200){setMessage('每个爱好最多 200 个字符。');return;}
    if(value.some(item=>item.trim().toLocaleLowerCase()===interest.toLocaleLowerCase())){setMessage('这个爱好已经在列表里了。');return;}
    if(value.length>=100){setMessage('最多可以添加 100 个爱好。');return;}
    onChange([...value,interest]);setNewInterest('');setMessage(`已添加「${interest}」，保存到网站后公开。`);input.current?.focus();
  }
  return <section className="admin-interest-fields" aria-label="管理爱好" data-field-path="interests">
    <p className="muted">添加新的爱好，也可以修改、移除或调整已有爱好的顺序。</p>
    <div className="admin-interest-add"><label>新爱好<input ref={input} value={newInterest} onChange={event=>{setNewInterest(event.target.value);setMessage('');}} placeholder="例如：游泳、阅读" maxLength={200} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add();}}}/></label><button type="button" className="btn btn-primary" onClick={add} disabled={value.length>=100}>添加爱好</button></div>
    {message&&<p role="status" className="muted">{message}</p>}
    <div className="admin-interest-list">{value.map((interest,index)=><div className="admin-interest-row" key={index}><label>爱好 {index+1}<input value={interest} onChange={event=>onChange(value.map((item,itemIndex)=>itemIndex===index?event.target.value:item))}/></label><div className="admin-row-tools"><button type="button" aria-label={`上移爱好 ${index+1}`} disabled={!index} onClick={()=>{const next=[...value];[next[index-1],next[index]]=[next[index],next[index-1]];onChange(next);}}>↑</button><button type="button" aria-label={`下移爱好 ${index+1}`} disabled={index===value.length-1} onClick={()=>{const next=[...value];[next[index+1],next[index]]=[next[index],next[index+1]];onChange(next);}}>↓</button><button type="button" aria-label={`移除爱好 ${index+1}`} onClick={()=>onChange(value.filter((_,itemIndex)=>itemIndex!==index))}>移除</button></div></div>)}</div>
    {!value.length&&<p className="muted">还没有爱好，输入第一个吧。</p>}
  </section>;
}
