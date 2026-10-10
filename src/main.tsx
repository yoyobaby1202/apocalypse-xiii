import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Card = { id: string; rank: number; suit: string };
type Zone = 'pool' | 'front' | 'middle' | 'back';
type Hands = Record<Zone, Card[]>;
const suits = ['♠', '♥', '♦', '♣'];
const names: Record<number,string> = {11:'J',12:'Q',13:'K',14:'A'};
const caps: Record<Zone,number> = {pool:13,front:3,middle:5,back:5};
const labels: Record<Zone,string> = {pool:'手牌',front:'頭墩',middle:'中墩',back:'尾墩'};
function deal(): Hands {
  const deck = suits.flatMap(suit => Array.from({length:13},(_,i)=>({id:`${suit}-${i+2}`,suit,rank:i+2})));
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  return {pool:deck.slice(0,13).sort((a,b)=>b.rank-a.rank),front:[],middle:[],back:[]};
}
type Score = {category:number; tie:number[]; name:string};
function evaluate(cards:Card[]):Score | null {
  if(cards.length!==3 && cards.length!==5)return null;
  const counts=new Map<number,number>(); cards.forEach(c=>counts.set(c.rank,(counts.get(c.rank)||0)+1));
  const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const values=[...counts.keys()].sort((a,b)=>b-a);
  const flush=cards.length===5&&cards.every(c=>c.suit===cards[0].suit);
  let high=0;
  if(cards.length===5&&values.length===5){if(values[0]-values[4]===4)high=values[0];else if(values.join(',')==='14,5,4,3,2')high=5;}
  const pattern=groups.map(g=>g[1]).join(',');
  let category=0,name='高牌',tie=values;
  if(cards.length===5&&flush&&high){category=8;name='同花順';tie=[high];}
  else if(pattern==='4,1'){category=7;name='鐵支';tie=groups.map(g=>g[0]);}
  else if(cards.length===5&&pattern==='3,2'){category=6;name='葫蘆';tie=groups.map(g=>g[0]);}
  else if(flush){category=5;name='同花';tie=values;}
  else if(high){category=4;name='順子';tie=[high];}
  else if(groups[0][1]===3){category=3;name='三條';tie=groups.map(g=>g[0]);}
  else if(cards.length===5&&pattern==='2,2,1'){category=2;name='兩對';tie=groups.map(g=>g[0]);}
  else if(groups[0][1]===2){category=1;name='一對';tie=groups.map(g=>g[0]);}
  return {category,tie,name};
}
function compare(a:Score,b:Score){if(a.category!==b.category)return a.category-b.category;for(let i=0;i<Math.max(a.tie.length,b.tie.length);i++){const d=(a.tie[i]||0)-(b.tie[i]||0);if(d)return d;}return 0;}
type Metrics = { rates: number[]; expected: number; expectedNoShoot: number; shootRate: number; shotRate: number };
type Suggestion = {alternative?: Suggestion; mode?:"normal"|"deep"; legalCount?:number; finalists?:number; pilotSamples?:number; hands:Hands; front:Score; middle:Score; back:Score; value:number; expected:number; expectedNoShoot:number; rates:number[]; shootRate:number; shotRate:number; samples:number; elapsedMs:number; player?: (Metrics & {valid:boolean;error?:string}) | null};
function cardText(cards:Card[]){return cards.map(c=>`${names[c.rank]||c.rank}${c.suit}`).join('  ');}
function App(){
  const [hands,setHands]=useState<Hands>(deal);
  const [suggestion,setSuggestion]=useState<Suggestion|null>(null);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<{zone:Zone;ids:string[]}|null>(null);
  const [message,setMessage]=useState('先點選一張牌，再點選要放入的墩位。');
  const move=(from:Zone,ids:string[],to:Zone)=>{
    if(from===to)return;
    const cards=hands[from].filter(c=>ids.includes(c.id));
    if(!cards.length)return;
    if(hands[to].length+cards.length>caps[to]){
      setMessage(`${labels[to]}只剩 ${caps[to]-hands[to].length} 個位置，已選 ${cards.length} 張，請減少選取。`);return;
    }
    setSuggestion(null);
    setHands(prev=>({...prev,[from]:prev[from].filter(c=>!ids.includes(c.id)),[to]:[...prev[to],...cards]}));
    setSelected(null);setMessage(`已將 ${cards.length} 張牌移到${labels[to]}。`);
  };
  const tapCard=(zone:Zone,id:string)=>{
    setSelected(prev=>{
      if(!prev || prev.zone!==zone){setMessage(`已選取 1 張${labels[zone]}牌，可繼續多選。`);return {zone,ids:[id]};}
      const ids=prev.ids.includes(id)?prev.ids.filter(x=>x!==id):[...prev.ids,id];
      setMessage(ids.length?`已選取 ${ids.length} 張牌，按墩位按鈕即可一起移動。`:'已取消選牌。');
      return ids.length?{zone,ids}:null;
    });
  };
  const tapZone=(zone:Zone)=>{if(selected)move(selected.zone,selected.ids,zone);};
  const reset=()=>{workerRef.current?.terminate();workerRef.current=null;setBusy(false);setSuggestion(null);setHands(deal());setSelected(null);setMessage('已重新發牌。');};
  const clear=()=>{workerRef.current?.terminate();workerRef.current=null;setBusy(false);setSuggestion(null);setHands(prev=>({pool:[...prev.pool,...prev.front,...prev.middle,...prev.back].sort((a,b)=>b.rank-a.rank),front:[],middle:[],back:[]}));setSelected(null);setMessage('已清空排牌。');};
  const verify=()=>{
    if(hands.front.length!==3||hands.middle.length!==5||hands.back.length!==5){setMessage('請先完成頭墩 3 張、中墩 5 張、尾墩 5 張。');return;}
    const f=evaluate(hands.front)!,m=evaluate(hands.middle)!,b=evaluate(hands.back)!;
    setMessage(compare(b,m)>=0&&compare(m,f)>=0?`排牌合法！頭墩：${f.name}／中墩：${m.name}／尾墩：${b.name}`:'倒水（擺烏龍）！必須尾墩 ≥ 中墩 ≥ 頭墩。');
  };
  const workerRef=React.useRef<Worker|null>(null);
  const analyze=()=>{
    const mode = "deep" as const;
    workerRef.current?.terminate();
    setBusy(true);setSuggestion(null);setMessage('AI 深度分析中：正在搜尋合法排法並進行 3,000 次對手比較…');
    const all=[...hands.pool,...hands.front,...hands.middle,...hands.back];
    const complete = hands.front.length===3 && hands.middle.length===5 && hands.back.length===5;
    const worker=new Worker(new URL('./analyzer.worker.ts',import.meta.url),{type:'module'});
    workerRef.current=worker;
    const timeout=window.setTimeout(()=>{
      if(workerRef.current!==worker)return;
      worker.terminate();workerRef.current=null;setBusy(false);
      setMessage('AI 分析超過 120 秒，已自動停止。請稍後重試。');
    },120000);
    const finish=()=>{window.clearTimeout(timeout);worker.terminate();if(workerRef.current===worker)workerRef.current=null;setBusy(false);};
    worker.onmessage=(event:MessageEvent<{result?:Suggestion|null;error?:string}>)=>{
      if(workerRef.current!==worker)return;
      finish();
      if(event.data.error){setMessage('分析發生錯誤：'+event.data.error);return;}
      const result=event.data.result??null;setSuggestion(result);
      if (result?.player?.valid && (['front','middle','back'] as const).every(zone =>
        result.hands[zone].map(c=>c.id).sort().join(',') === hands[zone].map(c=>c.id).sort().join(','))) {
        setMessage('🎉 你的排牌與 AI 建議完全一致！這是本次深度搜尋的最佳入選排法，但不代表絕對最佳解。');
      } else {
        setMessage(result?'模擬分析完成！這是依照簡化對手模型估算的建議，不保證實戰最佳。':'找不到合法排法。');
      }
    };
    worker.onerror=()=>{if(workerRef.current!==worker)return;finish();setMessage('分析程式發生錯誤，請重新整理網頁後再試。');};
    worker.postMessage({cards:all,player:complete?hands:null,mode});
  };
  const useSuggestion=(choice:Suggestion)=>{
    setHands(choice.hands);setSelected(null);setMessage('已套用建議排法，請按「確認排牌」驗證。');
  };
  const renderZone=(zone:Zone)=>{
    const score=evaluate(hands[zone]);
    return <section className="zone" onClick={()=>tapZone(zone)} key={zone}>
      <header><strong>{labels[zone]} <small>{hands[zone].length}/{caps[zone]}</small></strong><span>{score?.name||'尚未完成'}</span></header>
      <div className={`cards ${zone==='pool'?'pool-cards':'zone-cards'}`}>{hands[zone].map(card=><button type="button" key={card.id} className={`playing-card ${card.suit==='♥'||card.suit==='♦'?'red':''} ${selected?.zone===zone&&selected.ids.includes(card.id)?'selected':''}`} onClick={e=>{e.stopPropagation();tapCard(zone,card.id);}} aria-label={`${names[card.rank]||card.rank}${card.suit}`}><span>{names[card.rank]||card.rank}</span><span>{card.suit}</span></button>)}{Array.from({length:Math.max(0,caps[zone]-hands[zone].length)},(_,i)=><div className="empty" key={i}>+</div>)}</div>
    </section>;
  };
  return <main><div className="app"><div className="title"><h1>♠ 俊佑の十三支默示錄</h1><span>APOCALYPSE XIII · v0.7.2</span></div>
    {renderZone('front')}{renderZone('middle')}{renderZone('back')}
    <div className="notice" role="status">{message}</div>
    {renderZone('pool')}
    <div className="touch-controls" aria-label="觸控移牌操作">
      <strong>{selected ? `已選 ${labels[selected.zone]} ${selected.ids.length} 張（可繼續點牌多選）` : '① 可連續選多張牌，② 按目標墩位一次移動'}</strong>
      <div className="touch-targets">{(['front','middle','back','pool'] as const).map(zone=><button key={zone} type="button" disabled={!selected || selected.zone===zone || hands[zone].length+(selected?.ids.length||0)>caps[zone]} onClick={()=>tapZone(zone)}>{zone==='pool'?'↩ 返回手牌':`→ ${labels[zone]} ${hands[zone].length}/${caps[zone]}`}</button>)}</div>
      {selected&&<button type="button" className="cancel-selection" onClick={()=>setSelected(null)}>取消選取（{selected.ids.length} 張）</button>}
    </div>
    <div className="actions"><button onClick={reset}>重新發牌</button><button onClick={clear}>清空排牌</button><button className="primary" onClick={verify}>確認排牌</button></div>
    <button className="deep-button" onClick={analyze} disabled={busy || hands.front.length!==3 || hands.middle.length!==5 || hands.back.length!==5}>{busy?'🔍 AI 深度分析中…':'🔍 AI分析建議排法'}</button>
    <p className="deep-help">請先排滿頭墩 3 張、中墩 5 張、尾墩 5 張，才能使用 AI分析建議排法。系統遍歷合法排法並分階段篩選，以 3,000 次對手比較評估候選；結果不保證是真實對戰的絕對最佳解。</p>
    {suggestion&&<section className="advice" aria-label="雙 AI 建議排法">
      <h2>⚔️ 雙 AI 分析建議</h2>
      <p>同一批 {suggestion.samples} 次模擬對手，分別搜尋「包含打槍」與「不包含打槍」的高分排法。共檢查 {suggestion.legalCount?.toLocaleString()??'多種'} 種合法排法；候選初篩為近似搜尋，不保證全域最佳。</p>
      {([suggestion,suggestion.alternative].filter(Boolean) as Suggestion[]).map((choice,i)=><div className="ai-choice" key={i}>
        <h3>{i===0?'🅰️ AI A｜包含打槍':'🅱️ AI B｜不包含打槍'}</h3>
        <p>{i===0?'三墩全贏 +6、全輸 −6':'三墩全贏 +3、全輸 −3'}；其他每墩勝 +1、輸 −1、平 0。</p>
        {(['front','middle','back'] as const).map(zone=><div className="advice-row" key={zone}><strong>{labels[zone]}（{zone==='front'?choice.front.name:zone==='middle'?choice.middle.name:choice.back.name}）</strong><span>{cardText(choice.hands[zone])}</span></div>)}
        <div className="compare-summary">
          <div><small>含打槍預期得分</small><strong>{choice.expected>=0?'+':''}{choice.expected.toFixed(2)}</strong></div>
          <div><small>不含打槍預期得分</small><strong>{choice.expectedNoShoot>=0?'+':''}{choice.expectedNoShoot.toFixed(2)}</strong></div>
        </div>
        <p>各墩勝率：頭 {(choice.rates[0]*100).toFixed(1)}%／中 {(choice.rates[1]*100).toFixed(1)}%／尾 {(choice.rates[2]*100).toFixed(1)}%</p>
        <p>打槍率 {(choice.shootRate*100).toFixed(1)}% · 被打槍率 {(choice.shotRate*100).toFixed(1)}%</p>
        {choice.player?.valid&&<div className="player-comparison">
          <strong>你的排法（相同對手比較）</strong>
          <p>含打槍 {choice.player.expected.toFixed(2)} 分／不含打槍 {choice.player.expectedNoShoot.toFixed(2)} 分</p>
          <p>本 AI 相對你的改善：{((i===0?choice.expected:choice.expectedNoShoot)-(i===0?choice.player.expected:choice.player.expectedNoShoot)).toFixed(2)} 分／對手</p>
        </div>}
        <button className="apply" onClick={()=>useSuggestion(choice)}>套用 AI {i===0?'A（含打槍）':'B（不含打槍）'} 排法</button>
      </div>)}
      {suggestion.player&&!suggestion.player.valid&&<p>{suggestion.player.error}</p>}
      <p>模擬比較 {suggestion.samples} 次 · 耗時 {(suggestion.elapsedMs/1000).toFixed(2)} 秒。兩套使用相同模擬對手；對手為簡化模型，不代表實戰保證勝率。</p>
    </section>}
    <div className="rules-entry"><a href="/rules.html" target="_blank" rel="noopener noreferrer">📖 十三支遊戲規則與新手教學 ↗</a><p>新手也能快速上手：排牌、牌型大小、倒水與打槍計分。</p></div>
    <p className="hint">玩法：同一區域可連續點選多張牌，再按頭墩／中墩／尾墩一次放入；取回時也能多選並按返回手牌。再點已選牌可取消選取；切換區域會重新選牌。本版提供牌型檢查、AI 深度分析與每墩勝負估算。打槍雙倍已納入 AI 模擬預期得分；暫不支援特殊牌及全壘打。</p>
  </div></main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
