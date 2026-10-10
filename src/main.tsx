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
type Metrics = { rates: number[]; expected: number; shootRate: number; shotRate: number };
type Suggestion = {mode?:"normal"|"deep"; legalCount?:number; finalists?:number; pilotSamples?:number; hands:Hands; front:Score; middle:Score; back:Score; value:number; expected:number; rates:number[]; shootRate:number; shotRate:number; samples:number; elapsedMs:number; player?: (Metrics & {valid:boolean;error?:string}) | null};
function cardText(cards:Card[]){return cards.map(c=>`${names[c.rank]||c.rank}${c.suit}`).join('  ');}
function App(){
  const [hands,setHands]=useState<Hands>(deal);
  const [suggestion,setSuggestion]=useState<Suggestion|null>(null);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<{zone:Zone;id:string}|null>(null);
  const [message,setMessage]=useState('先點選一張牌，再點選要放入的墩位。');
  const move=(from:Zone,id:string,to:Zone)=>{
    if(from===to){setSelected(null);return;}
    if(hands[to].length>=caps[to]){setMessage(`${labels[to]}已滿，請先移出其他牌。`);return;}
    const card=hands[from].find(c=>c.id===id);if(!card)return;
    setSuggestion(null);
    setHands(prev=>({...prev,[from]:prev[from].filter(c=>c.id!==id),[to]:[...prev[to],card]}));
    setSelected(null);setMessage(`已將 ${names[card.rank]||card.rank}${card.suit} 放入${labels[to]}。`);
  };
  const tapCard=(zone:Zone,id:string)=>{
    if(selected){move(selected.zone,selected.id,zone);return;}
    setSelected({zone,id});setMessage('已選牌，點擊其他墩位或牌即可移動。');
  };
  const tapZone=(zone:Zone)=>{if(selected)move(selected.zone,selected.id,zone);};
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
  const useSuggestion=()=>{
    if(!suggestion)return;
    setHands(suggestion.hands);setSelected(null);setMessage('已套用建議排法，請按「確認排牌」驗證。');
  };
  const renderZone=(zone:Zone)=>{
    const score=evaluate(hands[zone]);
    return <section className="zone" onClick={()=>tapZone(zone)} key={zone}>
      <header><strong>{labels[zone]} <small>{hands[zone].length}/{caps[zone]}</small></strong><span>{score?.name||'尚未完成'}</span></header>
      <div className="cards">{hands[zone].map(card=><button type="button" key={card.id} className={`playing-card ${card.suit==='♥'||card.suit==='♦'?'red':''} ${selected?.id===card.id?'selected':''}`} onClick={e=>{e.stopPropagation();tapCard(zone,card.id);}} aria-label={`${names[card.rank]||card.rank}${card.suit}`}><span>{names[card.rank]||card.rank}</span><span>{card.suit}</span></button>)}{Array.from({length:Math.max(0,caps[zone]-hands[zone].length)},(_,i)=><div className="empty" key={i}>+</div>)}</div>
    </section>;
  };
  return <main><div className="app"><div className="title"><h1>♠ 俊佑の十三支默示錄</h1><span>APOCALYPSE XIII · v0.7</span></div>
    {renderZone('front')}{renderZone('middle')}{renderZone('back')}
    <div className="notice" role="status">{message}</div>
    {renderZone('pool')}
    <div className="actions"><button onClick={reset}>重新發牌</button><button onClick={clear}>清空排牌</button><button className="primary" onClick={verify}>確認排牌</button></div>
    <button className="deep-button" onClick={analyze} disabled={busy || hands.front.length!==3 || hands.middle.length!==5 || hands.back.length!==5}>{busy?'🔍 AI 深度分析中…':'🔍 AI分析建議排法'}</button>
    <p className="deep-help">請先排滿頭墩 3 張、中墩 5 張、尾墩 5 張，才能使用 AI分析建議排法。系統遍歷合法排法並分階段篩選，以 3,000 次對手比較評估候選；結果不保證是真實對戰的絕對最佳解。</p>
    {suggestion&&<section className="advice" aria-label="建議排法">
      <h2>⚔️ AI分析建議排法</h2>
      <p>{`AI 深度搜尋遍歷 ${suggestion.legalCount?.toLocaleString()??'所有'} 種合法排法，先用 ${suggestion.pilotSamples} 次對手比較初篩，選出 ${suggestion.finalists} 種候選，再與 ${suggestion.samples} 次模擬對手比較。`}這是練習用估算，不代表真實勝率。</p>
      {suggestion.player?.valid && (['front','middle','back'] as const).every(zone => suggestion.hands[zone].map(c=>c.id).sort().join(',') === hands[zone].map(c=>c.id).sort().join(',')) && <div className="same-alert">🎉 你的排牌與 AI 建議完全一致！這是深度搜尋的最佳入選排法，但不代表絕對最佳解。</div>}
      {(['front','middle','back'] as const).map(zone=><div className="advice-row" key={zone}>
        <strong>{labels[zone]}（{zone==='front'?suggestion.front.name:zone==='middle'?suggestion.middle.name:suggestion.back.name}）</strong>
        <span>{cardText(suggestion.hands[zone])}</span>
      </div>)}
      <div className="comparison">
        <h3>⚔ 玩家 VS AI · 模擬對戰</h3>
        <p>同一批 {suggestion.samples} 名模擬對手，兩種排法公平比較（勝率含半個平手）。</p>
        {suggestion.player?.valid ? (
          <>
            <div className="compare-head"><span>墩位</span><span>你的排法</span><span>AI 建議</span></div>
            {(['front','middle','back'] as const).map((zone,i)=><div className="compare-row" key={zone}>
              <strong>{labels[zone]}</strong>
              <span>{(suggestion.player!.rates[i]*100).toFixed(1)}%</span>
              <span>{(suggestion.rates[i]*100).toFixed(1)}%</span>
            </div>)}
            <div className="compare-summary">
              <div><small>你的預期得分（含打槍）</small><strong>{suggestion.player.expected>=0?'+':''}{suggestion.player.expected.toFixed(2)}</strong></div>
              <div><small>AI 預期得分（含打槍）</small><strong>{suggestion.expected>=0?'+':''}{suggestion.expected.toFixed(2)}</strong></div>
            </div>
            <p>AI 相對改善：{(suggestion.expected-suggestion.player.expected).toFixed(2)} 分／對手</p>
            <div className="compare-head"><span>打槍統計</span><span>你的排法</span><span>AI 建議</span></div>
            <div className="compare-row"><strong>打槍率</strong><span>{(suggestion.player.shootRate*100).toFixed(1)}%</span><span>{(suggestion.shootRate*100).toFixed(1)}%</span></div>
            <div className="compare-row"><strong>被打槍率</strong><span>{(suggestion.player.shotRate*100).toFixed(1)}%</span><span>{(suggestion.shotRate*100).toFixed(1)}%</span></div>
          </>
        ) : (
          <p className="compare-note">{suggestion.player?.error || '請先完成頭墩 3 張、中墩 5 張、尾墩 5 張，再按分析，即可比較你的排法與 AI。'}</p>
        )}
        {!suggestion.player?.valid && <p>AI 打槍率 {(suggestion.shootRate*100).toFixed(1)}% · 被打槍率 {(suggestion.shotRate*100).toFixed(1)}%</p>}
        <div className="compare-head"><span>AI 各墩</span><span>估計勝率</span><span></span></div>
        {(['front','middle','back'] as const).map((zone,i)=><div key={zone} className="rate-row">
          <span>{labels[zone]} {(suggestion.rates[i]*100).toFixed(1)}%</span>
          <div className="rate-track"><div style={{width:`${suggestion.rates[i]*100}%`}} /></div>
        </div>)}
        <p>模擬比較 {suggestion.samples} 次 · 耗時 {(suggestion.elapsedMs/1000).toFixed(2)} 秒</p>
        <small>每墩勝 +1、負 −1、平 0；三墩全贏 +6、全輸 −6（打槍雙倍）；不含全壘打及特殊牌型。AI 採用分階段搜尋，模擬結果不是實際勝率或絕對最佳解。</small>
      </div>
      <button className="apply" onClick={useSuggestion}>套用建議排法</button>
    </section>}
    <div className="rules-entry"><a href="/rules.html" target="_blank" rel="noopener noreferrer">📖 十三支遊戲規則與新手教學 ↗</a><p>新手也能快速上手：排牌、牌型大小、倒水與打槍計分。</p></div>
    <p className="hint">玩法：先點牌，再點目標墩位。點已選牌可取消；點另一張牌可交換位置（目標墩位有空格時）。本版提供牌型檢查、AI 深度分析與每墩勝負估算。打槍雙倍已納入 AI 模擬預期得分；暫不支援特殊牌及全壘打。</p>
  </div></main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
