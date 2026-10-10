type Card = { id: string; rank: number; suit: string };
type Score = { category: number; tie: number[]; name: string };
type Hands = { pool: Card[]; front: Card[]; middle: Card[]; back: Card[] };
type AnalysisRequest = { cards: Card[]; player?: Hands | null; mode?: "normal" | "deep" };
type Metrics = { rates: number[]; expected: number; expectedNoShoot: number; shootRate: number; shotRate: number };

type Candidate = { front: number; middle: number; back: number; heuristic: number };
const FULL = 8191;
const suits = ['♠','♥','♦','♣'];
function evaluate(cards: Card[]): Score {
  const counts = new Map<number,number>();
  for (const c of cards) counts.set(c.rank,(counts.get(c.rank)||0)+1);
  const groups = [...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const values = [...counts.keys()].sort((a,b)=>b-a);
  const flush = cards.length===5 && cards.every(c=>c.suit===cards[0].suit);
  let straight=0;
  if(cards.length===5 && values.length===5){
    if(values[0]-values[4]===4) straight=values[0];
    else if(values.join(',')==='14,5,4,3,2') straight=5;
  }
  const pattern=groups.map(g=>g[1]).join(',');
  if(flush&&straight)return {category:8,tie:[straight],name:'同花順'};
  if(pattern==='4,1')return {category:7,tie:groups.map(g=>g[0]),name:'鐵支'};
  if(pattern==='3,2')return {category:6,tie:groups.map(g=>g[0]),name:'葫蘆'};
  if(flush)return {category:5,tie:values,name:'同花'};
  if(straight)return {category:4,tie:[straight],name:'順子'};
  if(groups[0][1]===3)return {category:3,tie:groups.map(g=>g[0]),name:'三條'};
  if(pattern==='2,2,1')return {category:2,tie:groups.map(g=>g[0]),name:'兩對'};
  if(groups[0][1]===2)return {category:1,tie:groups.map(g=>g[0]),name:'一對'};
  return {category:0,tie:values,name:'高牌'};
}
function compare(a:Score,b:Score):number{
  if(a.category!==b.category)return a.category-b.category;
  for(let i=0;i<Math.max(a.tie.length,b.tie.length);i++){
    const d=(a.tie[i]||0)-(b.tie[i]||0);if(d)return d;
  }return 0;
}
function power(s:Score){return s.category*100+s.tie.reduce((v,r,i)=>v+r/Math.pow(15,i),0)/10;}
function prepare(cards:Card[]){
  const hands:(Card[]|undefined)[]=Array(8192);
  const scores:(Score|undefined)[]=Array(8192);
  const powers=new Float64Array(8192);
  const three:number[]=[],five:number[]=[];
  for(let mask=1;mask<=FULL;mask++){
    let count=0,bits=mask;
    while(bits){bits&=bits-1;count++;}
    if(count!==3&&count!==5)continue;
    const hand:Card[]=[];
    for(let i=0;i<13;i++)if(mask&(1<<i))hand.push(cards[i]);
    const score=evaluate(hand);
    hands[mask]=hand;scores[mask]=score;powers[mask]=power(score);
    (count===3?three:five).push(mask);
  }
  return {hands,scores,powers,three,five};
}
// 對手使用快速啟發式排牌；玩家候選則從多種權重策略中挑選，避免只偏重某一墩。
function bestCandidates(cards:Card[], limit:number, diverse=false){
  const p=prepare(cards);
  const weightSets = diverse ? [
    [1.15,1.1,1], [1.8,1,0.8], [0.8,1.8,1], [0.8,1,1.8],
    [1.5,1.5,0.7], [0.7,1.5,1.5]
  ] : [[1.15,1.1,1]];
  const perGroup = diverse ? Math.ceil(limit/weightSets.length) : limit;
  const lists:Candidate[][] = weightSets.map(()=>[]);
  for(const f of p.three){
    const front=p.scores[f]!;
    for(const m of p.five){
      if(f&m)continue;
      const middle=p.scores[m]!;
      if(compare(middle,front)<0)continue;
      const b=FULL^f^m;
      if(compare(p.scores[b]!,middle)<0)continue;
      for(let k=0;k<weightSets.length;k++){
        const [fw,mw,bw]=weightSets[k];
        const heuristic=p.powers[f]*fw+p.powers[m]*mw+p.powers[b]*bw;
        const list=lists[k];
        if(list.length===perGroup && heuristic<=list[list.length-1].heuristic)continue;
        let lo=0,hi=list.length;
        while(lo<hi){const mid=(lo+hi)>>1;if(list[mid].heuristic>=heuristic)lo=mid+1;else hi=mid;}
        list.splice(lo,0,{front:f,middle:m,back:b,heuristic});
        if(list.length>perGroup)list.pop();
      }
    }
  }
  const seen=new Set<string>();
  const best:Candidate[]=[];
  for(const list of lists)for(const c of list){
    const key=`${c.front}/${c.middle}`;
    if(!seen.has(key)){seen.add(key);best.push(c);}
  }
  return {p,best};
}
function dealOpponent(excluded:Set<string>):Card[]{
  const deck:Card[]=[];
  for(const suit of suits)for(let rank=2;rank<=14;rank++){
    const id=`${suit}-${rank}`;
    if(!excluded.has(id))deck.push({id,suit,rank});
  }
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  return deck.slice(0,13);
}
function getScores(p:ReturnType<typeof prepare>,c:Candidate){
  return [p.scores[c.front]!,p.scores[c.middle]!,p.scores[c.back]!];
}
// 三墩全贏或全輸，總得分由 +/-3 加倍為 +/-6。
function matchPoints(a: Score[], b: Score[]) {
  const results = a.map((score, i) => Math.sign(compare(score, b[i])));
  const base = results.reduce((sum, result) => sum + result, 0);
  if (results.every(result => result === 1)) return { points: 6, shoot: true, shot: false };
  if (results.every(result => result === -1)) return { points: -6, shoot: false, shot: true };
  return { points: base, shoot: false, shot: false };
}
function metrics(mine: Score[], opponents: Score[][]): Metrics {
  const wins = [0, 0, 0];
  let totalPoints = 0;
  let totalNoShoot = 0;
  let shoots = 0;
  let shots = 0;
  for (const opponent of opponents) {
    for (let i = 0; i < 3; i++) {
      const result = compare(mine[i], opponent[i]);
      wins[i] += result > 0 ? 1 : result === 0 ? 0.5 : 0;
    }
    const match = matchPoints(mine, opponent);
    totalPoints += match.points;
    totalNoShoot += mine.reduce((sum, score, i) => sum + Math.sign(compare(score, opponent[i])), 0);
    if (match.shoot) shoots++;
    if (match.shot) shots++;
  }
  const n = opponents.length;
  return {
    rates: wins.map(w => w / n),
    expected: totalPoints / n,
    expectedNoShoot: totalNoShoot / n,
    shootRate: shoots / n,
    shotRate: shots / n
  };
}

// 將牌型與逐張踢腳牌編碼成可直接比較的整數，供深度分析快速遍歷使用。
function scoreNumber(s: Score): number {
  let result = s.category;
  for (let i = 0; i < 5; i++) result = result * 15 + (s.tie[i] ?? 0);
  return result;
}
type DeepItem = { front: number; middle: number; back: number; pilot: number };
function deepCandidates(cards: Card[], pilotOpponents: Score[][], limit = 240, withShoot = true) {
  const p = prepare(cards);
  const nums = new Float64Array(8192);
  for (const mask of [...p.three, ...p.five]) nums[mask] = scoreNumber(p.scores[mask]!);
  const opponentNums = pilotOpponents.map(h => h.map(scoreNumber));
  const heap: DeepItem[] = [];
  let legalCount = 0;
  function push(item: DeepItem) {
    if (heap.length === limit && item.pilot <= heap[0].pilot) return;
    if (heap.length === limit) {
      heap[0] = item;
      let i = 0;
      while (true) {
        let j = i, l = i * 2 + 1, r = l + 1;
        if (l < heap.length && heap[l].pilot < heap[j].pilot) j = l;
        if (r < heap.length && heap[r].pilot < heap[j].pilot) j = r;
        if (j === i) break;
        [heap[i], heap[j]] = [heap[j], heap[i]];
        i = j;
      }
    } else {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent].pilot <= heap[i].pilot) break;
        [heap[parent], heap[i]] = [heap[i], heap[parent]];
        i = parent;
      }
    }
  }
  for (const f of p.three) {
    const fn = nums[f];
    for (const m of p.five) {
      if (f & m) continue;
      const mn = nums[m];
      if (mn < fn) continue;
      const b = FULL ^ f ^ m;
      const bn = nums[b];
      if (bn < mn) continue;
      legalCount++;
      let points = 0;
      for (const o of opponentNums) {
        const a = fn > o[0] ? 1 : fn < o[0] ? -1 : 0;
        const c = mn > o[1] ? 1 : mn < o[1] ? -1 : 0;
        const d = bn > o[2] ? 1 : bn < o[2] ? -1 : 0;
        points += withShoot && a === 1 && c === 1 && d === 1 ? 6 : withShoot && a === -1 && c === -1 && d === -1 ? -6 : a + c + d;
      }
      push({front:f,middle:m,back:b,pilot:points});
    }
  }
  return { p, best: heap.map(({front,middle,back,pilot}) => ({front,middle,back,heuristic:pilot})), legalCount };
}
function opponentBatch(cards: Card[], rounds: number): Score[][] {
  const opponents: Score[][] = [];
  const excluded = new Set(cards.map(c => c.id));
  for (let round = 0; round < rounds; round++) {
    const deck: Card[] = [];
    for (const suit of suits) for (let rank = 2; rank <= 14; rank++) {
      const id = `${suit}-${rank}`;
      if (!excluded.has(id)) deck.push({id,suit,rank});
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i],deck[j]] = [deck[j],deck[i]];
    }
    for (let k = 0; k < 3; k++) {
      const other = bestCandidates(deck.slice(k * 13,k * 13 + 13),1);
      if (other.best.length) opponents.push(getScores(other.p,other.best[0]));
    }
  }
  return opponents;
}

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const started = performance.now();
  try {
    const { cards, player, mode = 'normal' } = event.data;
    if (cards.length !== 13 || new Set(cards.map(c => c.id)).size !== 13) throw Error('需要 13 張不重複的牌');
    const deep = mode === 'deep';
    const pilot = deep ? opponentBatch(cards, 15) : [];
    const search = deep ? deepCandidates(cards, pilot, 240, true) : bestCandidates(cards, 180, true);
    const searchPlain = deep ? deepCandidates(cards, pilot, 240, false) : search;
    const { p, best } = search;
    if (!best.length || !searchPlain.best.length) throw Error('找不到合法排法');
    const opponents = deep ? opponentBatch(cards, 1000) : opponentBatch(cards, 100);
    if (!opponents.length) throw Error('無法產生模擬對手');
    const choose = (candidates: Candidate[], withShoot: boolean) => {
      const ranked = candidates.map(c => ({ c, ...metrics(getScores(p, c), opponents) }))
        .sort((a,b) => (withShoot ? b.expected-a.expected : b.expectedNoShoot-a.expectedNoShoot) || b.c.heuristic-a.c.heuristic);
      const winner = ranked[0];
      const c = winner.c;
      const hands: Hands = {pool:[],front:p.hands[c.front]!,middle:p.hands[c.middle]!,back:p.hands[c.back]!};
      return {hands,front:p.scores[c.front],middle:p.scores[c.middle],back:p.scores[c.back],...winner};
    };
    const winner = choose(best,true);
    const plainWinner = choose(searchPlain.best,false);
    let playerResult: (Metrics & { valid: boolean; error?: string }) | null = null;
    if (player) {
      const all = [...player.front, ...player.middle, ...player.back];
      if (player.front.length === 3 && player.middle.length === 5 && player.back.length === 5 &&
          new Set(all.map(c => c.id)).size === 13 && all.every(c => cards.some(owned => owned.id === c.id))) {
        const f = evaluate(player.front), m = evaluate(player.middle), b = evaluate(player.back);
        if (compare(b,m)>=0 && compare(m,f)>=0) playerResult={...metrics([f,m,b],opponents),valid:true};
        else playerResult={rates:[0,0,0],expected:0,expectedNoShoot:0,shootRate:0,shotRate:0,valid:false,error:'你的排牌倒水，無法計算合法勝率'};
      }
    }
    const shared = {player:playerResult,samples:opponents.length,mode,legalCount:deep && 'legalCount' in search ? search.legalCount : undefined,finalists:best.length,pilotSamples:pilot.length,elapsedMs:Math.round(performance.now()-started)};
    const asResult = (w: ReturnType<typeof choose>) => ({hands:w.hands,front:w.front,middle:w.middle,back:w.back,value:w.c.heuristic,expected:w.expected,expectedNoShoot:w.expectedNoShoot,rates:w.rates,shootRate:w.shootRate,shotRate:w.shotRate,...shared});
    self.postMessage({result:{...asResult(winner),alternative:asResult(plainWinner)}});
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
