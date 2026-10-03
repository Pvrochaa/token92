(function(){
"use strict";

/* ===================== CONFIGURATION ===================== */
/* Fill in these fields. The rest of the file doesn't need to be touched. */
const CONFIG = {
  // The public RPC works for testing, but it's rate-limited.
  // Recommended: grab a free key at https://www.helius.dev and swap in:
  // "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
  RPC_URL: "https://mainnet.helius-rpc.com/?api-key=4a95d1f4-043d-46ac-a4fa-e48b6a114b65",

  // Paste the $T92 mint address here once it exists (generated when you create it on pump.fun).
  MINT_ADDRESS: "Ac63ucqtjLTmjhA1DjPZQM7T95q2tmVHJ8XffR9XWtYx",

  // PUBLIC addresses (not private keys). Leave "" for any you don't have yet.
  // They're shown on the site only after launch (MINT_ADDRESS set), and buys made
  // by the dev and treasury wallets don't count toward the core fill.
  TREASURY_ADDRESS: "FvgJUyqa8ZUetpjqmBgARWb2Pji1uAbecKeFK5aFbZ7h",
  DEV_ADDRESS: "2MqWND3hdXhQ7uZ1SQCwAAymCaAH3xRuMiUtX3JXjCfE",
  LIQUIDITY_ADDRESS: "",

  // Initial token supply, in "human" format (not accounting for decimals).
  INITIAL_SUPPLY: 1000000000,

  // ---- Core fill bar, fueled by real community buys ----
  // Every $T92 buy counts — it doesn't matter if it was made on Axiom, pump.fun,
  // Jupiter, or any other exchange: they all end up as a transaction on the same
  // mint on Solana, so the site sees them all the same way. Buy volume since the
  // last Fission keeps adding up; once it hits this target, the core reaches 100%
  // and waits for the real Fission (burn) to happen.
  //
  // Set to 1% of INITIAL_SUPPLY: frequent enough to feel alive early on, without
  // emptying the supply too fast. Watch the real pace after launch and adjust —
  // raise it if Fissions fire too often, lower it if the core fills too slowly.
  //
  // Want the core to fill SLOWER? Raise this number.
  // Want it FASTER? Lower it.
  FISSION_VOLUME_TARGET: 10000000,

  // Guard against a "single whale": no single buy can count for more than this
  // toward the core, even if the real buy is bigger — stops one big buy from
  // filling the bar on its own. Set to 10% of the target above.
  MAX_BUY_IMPACT: 1000000,

  // How much the treasury needs to accumulate until the next Fission (real burn,
  // shown in the panel). This is NOT what fills the core — that's the item above.
  // Kept equal to FISSION_VOLUME_TARGET so the two line up: the core hits 100%
  // right as the treasury has enough to actually burn.
  BURN_TARGET: 10000000,

  // How many real burns need to happen to unlock Chapter 4 of the story.
  LORE_UNLOCK_AT: 25,

  // Price/volume/liquidity come from Dexscreener (public API, no key needed). Only
  // works once a trading pair is indexed for the mint (can take a few minutes after
  // launch). Price refresh interval, in ms.
  PRICE_POLL_MS: 15000,

  // How many recent mint transactions to scan when building the burn history AND
  // the current cycle's buy volume. Higher = more complete, but more RPC requests
  // (consider a Helius key if you raise this a lot).
  LOOKBACK: 40,

  // Auto-refresh interval, in milliseconds. 0 disables it.
  POLL_MS: 30000,
};
/* =================== END OF CONFIGURATION =================== */

var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var nf = new Intl.NumberFormat('en-US');
var nf1 = new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
var $ = function(id){return document.getElementById(id);};
function short(s,a,b){ a=a||6; b=b||6; return s.length>a+b+1 ? s.slice(0,a)+'…'+s.slice(-b) : s; }
function relTime(tsSeconds){
  if(!tsSeconds) return '';
  var m = Math.round((Date.now()/1000 - tsSeconds)/60);
  if (m<1) return 'just now';
  if (m<60) return m+'m ago';
  var h = Math.round(m/60);
  if (h<24) return h+'h ago';
  return Math.round(h/24)+'d ago';
}

var state = { rid:0, showAll:false, burns:[], lastBurnCount:-1 };
// Confirmed transactions never change, so each one is fetched and parsed only once.
var txCache = {};

/* ---------- Core visual (92 rods) ---------- */
var rodsG = $('rods'), rodEls = [];
(function(){
  var pts=[], s=26.5;
  for (var r=-9;r<=9;r++) for (var c=-9;c<=9;c++) pts.push({x:(c+((r%2+2)%2)*.5)*s-s*.25, y:r*s*.866});
  pts.forEach(function(p){p.d=Math.hypot(p.x,p.y);});
  pts.sort(function(a,b){return a.d-b.d;});
  var rods=pts.slice(0,92), cx=0, cy=0;
  rods.forEach(function(p){cx+=p.x;cy+=p.y;}); cx/=92; cy/=92;
  var svgNS='http://www.w3.org/2000/svg';
  rods.forEach(function(p,i){
    var g=document.createElementNS(svgNS,'g'); g.setAttribute('class','rod');
    var t=document.createElementNS(svgNS,'title'); t.textContent='Fuel rod '+String(i+1).padStart(2,'0'); g.appendChild(t);
    g.setAttribute('transform','translate('+(p.x-cx).toFixed(2)+' '+(p.y-cy).toFixed(2)+')');
    var halo=document.createElementNS(svgNS,'circle'); halo.setAttribute('class','halo'); halo.setAttribute('r','13.5');
    var h=document.createElementNS(svgNS,'circle'); h.setAttribute('class','housing'); h.setAttribute('r','10.5');
    var f=document.createElementNS(svgNS,'circle'); f.setAttribute('class','fuel'); f.setAttribute('r','5.6');
    g.appendChild(halo); g.appendChild(h); g.appendChild(f); rodsG.appendChild(g); rodEls.push(g);
  });
  // 92 tick marks around the dial, one per rod
  var ticks=$('ticks');
  for (var i=0;i<92;i++){
    var a=i/92*2*Math.PI-Math.PI/2, big=i%10===0, r1=188, r2=big?198:193;
    var l=document.createElementNS(svgNS,'line');
    l.setAttribute('x1',(Math.cos(a)*r1).toFixed(2)); l.setAttribute('y1',(Math.sin(a)*r1).toFixed(2));
    l.setAttribute('x2',(Math.cos(a)*r2).toFixed(2)); l.setAttribute('y2',(Math.sin(a)*r2).toFixed(2));
    if (big) l.setAttribute('class','tk-big');
    ticks.appendChild(l);
  }
})();
var ARC_LEN = 2*Math.PI*181;
function renderLevel(pct){
  pct = Math.max(0, Math.min(100, pct));
  var lit = Math.floor(pct/100*92+1e-6);
  rodEls.forEach(function(el,i){ el.classList.toggle('lit', i<lit); });
  $('glow').setAttribute('opacity',(0.12+Math.pow(pct/100,1.4)*0.88).toFixed(3));
  $('arc').setAttribute('stroke-dasharray',(ARC_LEN*pct/100).toFixed(1)+' '+ARC_LEN.toFixed(1));
  $('lvl').textContent = nf1.format(pct);
  $('rodCount').textContent = lit;
  $('barFill').style.width = pct+'%';
  document.documentElement.setAttribute('data-heat', pct>=92 ? 'critical' : pct>=60 ? 'hot' : 'cold');
}
function playFission(){
  if (reduce) return;
  var panel = $('corePanel');
  panel.classList.remove('fission'); void panel.offsetWidth; panel.classList.add('fission');
  panel.classList.add('shake'); setTimeout(function(){ panel.classList.remove('shake'); },520);
  var fl=$('flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  setTimeout(function(){ panel.classList.remove('fission'); }, 1800);
}

/* ---------- Status (header) ---------- */
function setStatus(s, label){
  var el=$('status');
  el.setAttribute('data-s', s);
  el.querySelector('span').textContent = label;
}

/* ---------- Standard Solana JSON-RPC call ---------- */
var reqId=0;
function rpc(method, params){
  reqId++;
  return fetch(CONFIG.RPC_URL, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({jsonrpc:'2.0', id:reqId, method:method, params:params})
  }).then(function(r){
    if(!r.ok) throw new Error('RPC HTTP '+r.status);
    return r.json();
  }).then(function(j){
    if (j.error) throw new Error('RPC: '+(j.error.message||JSON.stringify(j.error)));
    return j.result;
  });
}
function getSupply(){
  return rpc('getTokenSupply',[CONFIG.MINT_ADDRESS]).then(function(res){
    return { amount:Number(res.value.amount), decimals:res.value.decimals, ui:res.value.uiAmount };
  });
}
function getOwnerTokenBalance(owner){
  if (!owner) return Promise.resolve(null);
  return rpc('getTokenAccountsByOwner',[owner,{mint:CONFIG.MINT_ADDRESS},{encoding:'jsonParsed'}]).then(function(res){
    var total=0;
    (res.value||[]).forEach(function(acc){ total += Number(acc.account.data.parsed.info.tokenAmount.uiAmount||0); });
    return total;
  });
}
function getSignatures(limit){ return rpc('getSignaturesForAddress',[CONFIG.MINT_ADDRESS,{limit:limit}]); }
// maxSupportedTransactionVersion is capped at 0 by default by most RPCs, but real
// swaps commonly come back as newer versioned transactions — raise the cap so
// those aren't silently dropped (returned as null and skipped).
function getParsedTx(sig){ return rpc('getTransaction',[sig,{encoding:'jsonParsed',maxSupportedTransactionVersion:2}]); }
function extractBurns(tx, sig){
  var out=[];
  if (!tx || !tx.transaction) return out;
  var allIx = [].concat(tx.transaction.message.instructions||[]);
  (tx.meta && tx.meta.innerInstructions||[]).forEach(function(group){ allIx=allIx.concat(group.instructions||[]); });
  allIx.forEach(function(ix){
    if (ix.parsed && (ix.parsed.type==='burn' || ix.parsed.type==='burnChecked')){
      var info=ix.parsed.info;
      if (info.mint===CONFIG.MINT_ADDRESS){
        var amt = info.tokenAmount ? Number(info.tokenAmount.uiAmount) : Number(info.amount);
        out.push({ amount:amt, signature:sig, time:tx.blockTime });
      }
    }
  });
  return out;
}
/* Detects a BUY of $T92 in a transaction, no matter which exchange it was made
   on (Axiom, pump.fun, Jupiter...): they all end up as a transaction on the same
   mint on Solana. The rule: we only look at the wallet that paid the fee (the one
   that signed and initiated the transaction, i.e. the real person) — if their SOL
   actually dropped (not just the tiny network fee) and their $T92 balance went up,
   it was a buy. This ignores what happens inside the pool/curve, so sells don't
   get counted here. */
function extractBuys(tx, sig){
  var out=[];
  if (!tx || !tx.transaction || !tx.meta) return out;
  var keys = tx.transaction.message.accountKeys || [];
  var payerIdx = keys.findIndex(function(k){ return k && k.signer; });
  if (payerIdx<0) payerIdx = 0;
  var payerPub = String(keys[payerIdx] && (keys[payerIdx].pubkey || keys[payerIdx]));

  var preSol = tx.meta.preBalances ? tx.meta.preBalances[payerIdx] : null;
  var postSol = tx.meta.postBalances ? tx.meta.postBalances[payerIdx] : null;
  if (preSol==null || postSol==null) return out;
  var solDelta = (postSol - preSol) / 1e9; // negative = the wallet spent SOL

  // Token balance entries are keyed by the token ACCOUNT's position in the
  // transaction, not the wallet's — a wallet's own index almost never matches
  // its (separate) associated token account. Match by owner instead.
  function findBal(list){
    return (list||[]).find(function(b){ return b.owner===payerPub && b.mint===CONFIG.MINT_ADDRESS; });
  }
  var preT = findBal(tx.meta.preTokenBalances);
  var postT = findBal(tx.meta.postTokenBalances);
  var preAmt = preT ? Number(preT.uiTokenAmount.uiAmount||0) : 0;
  var postAmt = postT ? Number(postT.uiTokenAmount.uiAmount||0) : 0;
  var tokenDelta = postAmt - preAmt;

  // -0.0005 SOL is just so the tiny network fee alone doesn't count as a "buy"
  if (solDelta < -0.0005 && tokenDelta > 0){
    out.push({ amount:tokenDelta, sol:Math.abs(solDelta), signature:sig, time:tx.blockTime, wallet:payerPub });
  }
  return out;
}

/* ---------- Public wallets ---------- */
function renderWallets(){
  var rows = [
    ['Burn treasury', CONFIG.TREASURY_ADDRESS, 'Holds the tokens destroyed at each Fission'],
    ['Dev wallet', CONFIG.DEV_ADDRESS, 'Tagged as creator on pump.fun'],
    ['Liquidity', CONFIG.LIQUIDITY_ADDRESS, 'Trading pool once the curve graduates']
  ];
  $('walletsList').innerHTML = rows.map(function(r){
    // addresses stay hidden until launch so snipers can't watch the dev wallet for the creation tx
    if (!r[1] || !CONFIG.MINT_ADDRESS) return '<li class="pending"><span class="n">'+r[0]+'</span><span class="a">'+r[2]+'</span><span class="tag">at launch</span></li>';
    return '<li><span class="n">'+r[0]+'</span><span class="a">'+r[1]+'</span><button class="btn btn-ghost btn-sm" data-copy="'+r[1]+'">Copy</button></li>';
  }).join('');
}

/* ---------- Burn chart ---------- */
function renderChart(){
  var svg=$('chart'), W=640, H=200, pad=28;
  var data = state.burns.slice(0,14).slice().reverse();
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  if (!data.length){
    // ghost bars: a preview of what the chart will look like once burns happen
    var ghost = '<line x1="'+pad+'" y1="'+(H-pad)+'" x2="'+(W-pad)+'" y2="'+(H-pad)+'" stroke="currentColor" stroke-opacity=".2"/>';
    var gh = [.35,.5,.42,.62,.55,.72,.66,.8,.74,.9], gw = (W-pad*2)/gh.length;
    gh.forEach(function(v,i){
      var bh = v*(H-pad*2-20), gx = pad+i*gw+gw*.2;
      ghost += '<rect x="'+gx.toFixed(1)+'" y="'+(H-pad-bh).toFixed(1)+'" width="'+(gw*.6).toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="2" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-dasharray="4 4"/>';
    });
    ghost += '<text x="'+(W/2)+'" y="24" text-anchor="middle">'+(CONFIG.MINT_ADDRESS ? 'No burns yet' : 'Each Fission adds a bar here')+'</text>';
    svg.innerHTML = ghost;
    return;
  }
  var max = Math.max.apply(null,data.map(function(d){return d.amount;}))*1.12;
  var bw=(W-pad*2)/data.length, out='';
  out += '<line x1="'+pad+'" y1="'+(H-pad)+'" x2="'+(W-pad)+'" y2="'+(H-pad)+'" stroke="currentColor" stroke-opacity=".2"/>';
  data.forEach(function(d,i){
    var h=(d.amount/max)*(H-pad*2), x=pad+i*bw+bw*.18, y=H-pad-h, last=i===data.length-1;
    out += '<rect class="b'+(last?' last':'')+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+(bw*.64).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2"><title>'+nf.format(d.amount)+' $T92</title></rect>';
    out += '<text x="'+(x+bw*.32).toFixed(1)+'" y="'+(H-pad+16)+'" text-anchor="middle">#'+(data.length-i)+'</text>';
  });
  out += '<text x="'+pad+'" y="16">'+nf1.format(max/1e6)+'M</text>';
  svg.innerHTML = out;
}

/* ---------- Fission history ---------- */
function renderHistory(){
  var list = state.showAll ? state.burns : state.burns.slice(0,5);
  if (!list.length){
    var emptyMsg = CONFIG.MINT_ADDRESS
      ? 'No burns found yet in the mint\'s last '+CONFIG.LOOKBACK+' transactions.'
      : 'No Fissions yet. The first one will be logged here, hash included.';
    $('histBody').innerHTML = '<div class="hist-row"><span class="c">—</span><span>'+emptyMsg+'</span><span></span><span></span></div>';
  } else {
    $('histBody').innerHTML = list.map(function(f,i){
      return '<div class="hist-row"><span class="c">#'+(list.length-i)+'</span>'+
        '<span class="burn">'+nf.format(f.amount)+' $T92</span>'+
        '<span class="tx"><code title="'+f.signature+'">'+short(f.signature,6,6)+'</code><button data-copy="'+f.signature+'">Copy</button></span>'+
        '<span class="t">'+relTime(f.time)+'</span></div>';
    }).join('');
  }
  $('moreBtn').textContent = state.showAll ? 'Show less' : 'Show all ('+state.burns.length+')';
  $('moreBtn').parentNode.style.display = state.burns.length > 5 ? '' : 'none';
}

/* ---------- Real unlock for Chapter 4 (lore) ---------- */
function renderLore(){
  var n = state.burns.length, need = CONFIG.LORE_UNLOCK_AT;
  var tab = $('t4');
  if (n >= need){
    tab.classList.remove('locked');
    tab.querySelector('span').textContent = 'The name on the panel';
    $('ch4Locked').hidden = true;
    $('ch4Unlocked').hidden = false;
  } else {
    tab.classList.add('locked');
    tab.querySelector('span').textContent = 'Locked';
    $('ch4Locked').hidden = false;
    $('ch4Unlocked').hidden = true;
    var left = need - n;
    $('unlockInfo').textContent = left===need
      ? 'No Fissions recorded yet in this reading.'
      : 'Need '+left+' more Fission'+(left===1?'':'s')+' to unlock (found '+n+' of '+need+').';
  }
}

/* ---------- Recent activity feed ---------- */
function renderFeed(sigs){
  var feed=$('feed');
  feed.innerHTML = sigs.slice(0,6).map(function(s){
    return '<li><span><a href="https://solscan.io/tx/'+s.signature+'" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">'+short(s.signature,6,6)+'</a></span><b>'+relTime(s.blockTime)+'</b></li>';
  }).join('') || '<li class="empty">No transactions found yet.</li>';
}

/* ---------- Live price (Dexscreener, public API, no key needed) ---------- */
var priceState = { last:null, timer:null };
function fmtUsd(n){
  if (n==null || isNaN(n)) return '—';
  if (n >= 1) return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
  // memecoin prices usually have lots of zeros after the decimal — show enough digits
  var decimals = n < 0.0001 ? 8 : n < 0.01 ? 6 : 4;
  return '$'+n.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
}
function fmtCompactUsd(n){
  if (n==null || isNaN(n)) return '—';
  if (n>=1e9) return '$'+(n/1e9).toFixed(2)+'B';
  if (n>=1e6) return '$'+(n/1e6).toFixed(2)+'M';
  if (n>=1e3) return '$'+(n/1e3).toFixed(1)+'K';
  return '$'+n.toFixed(0);
}
function applyPriceDir(dir){
  var ticker=$('priceTicker'), usdEl=$('priceUsd');
  ticker.setAttribute('data-dir', dir);
  if (dir==='up'){ usdEl.classList.remove('flash-down'); void usdEl.offsetWidth; usdEl.classList.add('flash-up'); }
  if (dir==='down'){ usdEl.classList.remove('flash-up'); void usdEl.offsetWidth; usdEl.classList.add('flash-down'); }
}
function fetchPrice(){
  if (!CONFIG.MINT_ADDRESS) return;
  fetch('https://api.dexscreener.com/latest/dex/tokens/'+CONFIG.MINT_ADDRESS)
    .then(function(r){ if(!r.ok) throw new Error('Dexscreener HTTP '+r.status); return r.json(); })
    .then(function(data){
      var pairs = data && data.pairs;
      if (!pairs || !pairs.length){
        $('priceChg').textContent = 'no trading pair indexed yet';
        $('pPriceSub').textContent = 'waiting for Dexscreener to index the pair';
        return;
      }
      // pick the pair with the most liquidity (most reliable when there's more than one)
      pairs.sort(function(a,b){ return (b.liquidity&&b.liquidity.usd||0) - (a.liquidity&&a.liquidity.usd||0); });
      var p = pairs[0];
      var price = parseFloat(p.priceUsd);
      var chg = p.priceChange && typeof p.priceChange.h24==='number' ? p.priceChange.h24 : null;
      var vol = p.volume && p.volume.h24;
      var liq = p.liquidity && p.liquidity.usd;
      var mcap = p.fdv || p.marketCap;

      var dir = 'flat';
      if (priceState.last!=null && price!=null){
        if (price > priceState.last) dir='up';
        else if (price < priceState.last) dir='down';
      }
      priceState.last = price;

      $('priceUsd').textContent = fmtUsd(price);
      $('pPrice').textContent = fmtUsd(price);
      if (chg!=null){
        var arrow = chg>0 ? '▲' : chg<0 ? '▼' : '—';
        var chgTxt = arrow+' '+Math.abs(chg).toFixed(2)+'% (24h)';
        $('priceChg').textContent = chgTxt;
        $('pChg').textContent = (chg>0?'+':'')+chg.toFixed(2)+'%';
        $('pChg').className = 'v '+(chg>0?'up':chg<0?'down':'');
      }
      $('pPriceSub').textContent = 'via '+(p.dexId||'DEX')+' · updated at '+new Date().toLocaleTimeString('en-US');
      $('pVol').textContent = fmtCompactUsd(vol);
      $('pLiq').textContent = fmtCompactUsd(liq);
      $('pMcap').textContent = mcap ? ('market cap: '+fmtCompactUsd(mcap)) : '—';

      if (dir!=='flat') applyPriceDir(dir); else $('priceTicker').setAttribute('data-dir', priceState.lastDir||'flat');
      if (dir!=='flat') priceState.lastDir = dir;
    })
    .catch(function(err){
      $('priceChg').textContent = 'failed to fetch price: '+err.message;
    });
}
function schedulePricePoll(){
  clearInterval(priceState.timer);
  if (autoOn && CONFIG.PRICE_POLL_MS>0) priceState.timer = setInterval(function(){ if (!document.hidden) fetchPrice(); }, CONFIG.PRICE_POLL_MS);
}

/* ---------- Main orchestration ---------- */
function refresh(){
  var myRid = ++state.rid;

  if (!CONFIG.MINT_ADDRESS){
    $('setupBox').hidden=false;
    setStatus('prelaunch','Pre-launch');
    // nothing to buy yet: point the main calls to action at X instead
    [['heroCta','Follow @T0KEN92 <span class="arr">→</span>'],['topCta','Follow on X']].forEach(function(c){
      var a=$(c[0]); a.innerHTML=c[1]; a.href='https://x.com/T0KEN92'; a.target='_blank'; a.rel='noopener';
    });
    $('heroNote').textContent='Reactor offline. Ignition at launch.';
    $('priceChg').textContent='pre-launch';
    $('treasuryInline').textContent='0 $T92';
    $('targetInline').textContent=nf.format(CONFIG.FISSION_VOLUME_TARGET)+' $T92';
    $('feed').innerHTML='<li class="empty">Awaiting ignition…</li>';
    renderWallets(); renderHistory(); renderChart();
    return;
  }
  $('setupBox').hidden=true;
  $('errBox').hidden=true;
  setStatus('loading','Updating…');

  Promise.all([ getSupply(), getOwnerTokenBalance(CONFIG.TREASURY_ADDRESS), getSignatures(CONFIG.LOOKBACK) ])
    .then(function(r){
      if (myRid!==state.rid) return;
      var supply=r[0], treasury=r[1], sigs=r[2];

      var circ = supply.ui;
      var burned = Math.max(0, CONFIG.INITIAL_SUPPLY - circ);
      $('gSupply').textContent = nf.format(Math.round(circ));
      $('gSupplySub').textContent = 'of '+nf.format(CONFIG.INITIAL_SUPPLY)+' initial';
      $('gBurn').textContent = nf.format(Math.round(burned));
      $('gBurnPct').textContent = nf1.format(burned/CONFIG.INITIAL_SUPPLY*100)+'% of supply';

      if (treasury===null){
        $('gBuys').textContent='—'; $('gSol').textContent='set TREASURY_ADDRESS';
      } else {
        $('gBuys').textContent = nf.format(Math.round(treasury));
        $('gSol').textContent = 'burn target: '+nf.format(CONFIG.BURN_TARGET)+' $T92';
      }
      $('heroNote').textContent = 'Live data from the Solana blockchain. Updated at '+new Date().toLocaleTimeString('en-US')+'.';
      renderFeed(sigs);
      renderWallets();

      // Fission history (real burns) + community buy volume: scans the mint's
      // recent transactions for both things at once.
      var toCheck = sigs.slice(0, CONFIG.LOOKBACK);
      var chain = Promise.resolve({burns:[], buys:[]});
      toCheck.forEach(function(s){
        chain = chain.then(function(acc){
          var hit = txCache[s.signature];
          if (hit){
            acc.burns = acc.burns.concat(hit.burns);
            acc.buys = acc.buys.concat(hit.buys);
            return acc;
          }
          return getParsedTx(s.signature).then(function(tx){
            var parsed = { burns:extractBurns(tx,s.signature), buys:extractBuys(tx,s.signature) };
            if (tx) txCache[s.signature] = parsed;
            acc.burns = acc.burns.concat(parsed.burns);
            acc.buys = acc.buys.concat(parsed.buys);
            return acc;
          }).catch(function(){ return acc; });
        });
      });
      chain.then(function(acc){
        if (myRid!==state.rid) return;
        var burns=acc.burns, buys=acc.buys;
        state.burns = burns;
        $('gFis').textContent = burns.length;
        renderHistory(); renderChart(); renderLore();
        if (state.lastBurnCount>=0 && burns.length>state.lastBurnCount) playFission();
        state.lastBurnCount = burns.length;

        // current cycle = since the last real Fission found (or since the start
        // of the lookback window, if no burn has shown up in it yet)
        var cycleStart = burns.length ? burns[0].time : 0;
        // buys from the project's own wallets never fuel the core: only the community does
        var own = [CONFIG.DEV_ADDRESS, CONFIG.TREASURY_ADDRESS].filter(Boolean);
        var volume = buys
          .filter(function(b){ return b.time > cycleStart && own.indexOf(b.wallet) < 0; })
          .reduce(function(sum,b){ return sum + Math.min(b.amount, CONFIG.MAX_BUY_IMPACT); }, 0);
        var pct = CONFIG.FISSION_VOLUME_TARGET>0 ? (volume/CONFIG.FISSION_VOLUME_TARGET*100) : 0;
        renderLevel(pct);
        $('treasuryInline').textContent = nf.format(Math.round(volume))+' $T92';
        $('targetInline').textContent = nf.format(CONFIG.FISSION_VOLUME_TARGET)+' $T92';
      });

      setStatus('stable','Live');
      $('lastUpdate').textContent = 'Last read: '+new Date().toLocaleTimeString('en-US');
    })
    .catch(function(err){
      if (myRid!==state.rid) return;
      setStatus('error','Read failed');
      var b=$('errBox'); b.hidden=false;
      b.textContent="Couldn't read the blockchain: "+err.message+". Check the MINT_ADDRESS, the TREASURY_ADDRESS, and whether the configured RPC is up (a public RPC can rate-limit requests — consider a Helius key).";
    });
}

/* ---------- UI: menu, tabs, copy, auto-refresh ---------- */
var menuBtn=$('menuBtn'), nav=$('nav');
menuBtn.addEventListener('click',function(){
  var open=!nav.classList.contains('open'); nav.classList.toggle('open',open);
  menuBtn.setAttribute('aria-expanded',String(open)); menuBtn.setAttribute('aria-label',open?'Close menu':'Open menu');
});
nav.querySelectorAll('a').forEach(function(a){ a.addEventListener('click',function(){ nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded','false'); }); });

var toastT;
function toast(msg){ var t=$('toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(function(){t.classList.remove('on');},2600); }
function copy(text,label){
  function ok(){toast(label+' copied');}
  function fallback(){
    try{ var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok(); }
    catch(e){ toast('Could not copy. Please select the text manually.'); }
  }
  try{ if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok,fallback); else fallback(); }
  catch(e){ fallback(); }
}
document.addEventListener('click',function(e){
  var b=e.target.closest('[data-copy],[data-copy-el]'); if(!b) return;
  if (b.hasAttribute('data-copy-el')) copy($(b.getAttribute('data-copy-el')).textContent.trim(),'Contract');
  else copy(b.getAttribute('data-copy'), b.closest('.tx')?'Hash':'Address');
});

$('moreBtn').addEventListener('click',function(){ state.showAll=!state.showAll; renderHistory(); });
$('refreshBtn').addEventListener('click', refresh);

var autoOn=true, pollTimer=null;
function schedulePoll(){
  clearInterval(pollTimer);
  if (autoOn && CONFIG.POLL_MS>0) pollTimer=setInterval(function(){ if (!document.hidden) refresh(); }, CONFIG.POLL_MS);
}
// Polling is skipped while the tab is hidden; catch up as soon as it's visible again.
document.addEventListener('visibilitychange', function(){
  if (!document.hidden && autoOn && CONFIG.MINT_ADDRESS){ refresh(); fetchPrice(); }
});
$('autoBtn').addEventListener('click',function(){
  autoOn=!autoOn; this.setAttribute('aria-pressed',String(autoOn)); schedulePoll(); schedulePricePoll();
});

var tabs=[].slice.call(document.querySelectorAll('.tab'));
function selectTab(tab){
  tabs.forEach(function(t){
    var on=t===tab; t.setAttribute('aria-selected',String(on)); t.tabIndex=on?0:-1;
    $(t.getAttribute('aria-controls')).hidden=!on;
  });
}
tabs.forEach(function(t,i){
  t.addEventListener('click',function(){ if (t.classList.contains('locked')) return; selectTab(t); });
  t.addEventListener('keydown',function(e){
    var d=(e.key==='ArrowDown'||e.key==='ArrowRight')?1:(e.key==='ArrowUp'||e.key==='ArrowLeft')?-1:0;
    if(!d) return; e.preventDefault(); var n=tabs[(i+d+tabs.length)%tabs.length]; n.focus(); if(!n.classList.contains('locked')) selectTab(n);
  });
});

/* ---------- Visual effects: particles, card glow, scroll reveal ---------- */
// Radioactive particles drifting up in the background (lightweight canvas, pauses when the tab is hidden)
(function(){
  var cv=$('fx'), ctx=cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  var dpr=Math.min(2, window.devicePixelRatio||1), W=0, H=0, P=[], rings=[], raf=null;
  var COLORS=['168,255,46','168,255,46','168,255,46','61,242,255','255,210,31'];
  function size(){ W=innerWidth; H=innerHeight; cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
  function spawn(anyY){
    return { x:Math.random()*W, y:anyY?Math.random()*H:H+10, r:.6+Math.random()*1.8,
      vy:-(.12+Math.random()*.45), vx:(Math.random()-.5)*.15, ph:Math.random()*6.28,
      c:COLORS[(Math.random()*COLORS.length)|0], a:.25+Math.random()*.55 };
  }
  function init(){ size(); P=[]; var n=Math.round(Math.min(90, W*H/18000)); for(var i=0;i<n;i++) P.push(spawn(true)); }
  function frame(){
    ctx.clearRect(0,0,W,H);
    ctx.globalCompositeOperation='lighter';
    for (var i=0;i<P.length;i++){
      var p=P[i]; p.y+=p.vy; p.ph+=.02; p.x+=p.vx+Math.sin(p.ph)*.15;
      if (p.y<-10) P[i]=p=spawn(false);
      var fl=.6+Math.sin(p.ph*3)*.4;
      ctx.fillStyle='rgba('+p.c+','+(p.a*.12*fl)+')'; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*5,0,6.283); ctx.fill();
      ctx.fillStyle='rgba('+p.c+','+(p.a*fl)+')'; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.283); ctx.fill();
    }
    // "decay": every once in a while a particle emits a ring that expands outward
    if (Math.random()<.008 && P.length){ var q=P[(Math.random()*P.length)|0]; rings.push({x:q.x,y:q.y,r:2,a:.6,c:q.c}); }
    for (var j=rings.length-1;j>=0;j--){
      var g=rings[j]; g.r+=1.1; g.a-=.012;
      if (g.a<=0){ rings.splice(j,1); continue; }
      ctx.strokeStyle='rgba('+g.c+','+g.a+')'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(g.x,g.y,g.r,0,6.283); ctx.stroke();
    }
    ctx.globalCompositeOperation='source-over';
    raf=requestAnimationFrame(frame);
  }
  init();
  window.addEventListener('resize', function(){ init(); if (reduce) frameOnce(); });
  function frameOnce(){ frame(); cancelAnimationFrame(raf); raf=null; }
  if (reduce){ frameOnce(); return; }
  raf=requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', function(){
    if (document.hidden){ cancelAnimationFrame(raf); raf=null; }
    else if (!raf){ raf=requestAnimationFrame(frame); }
  });
})();

// Glow that follows the cursor on cards
document.addEventListener('pointermove', function(e){
  var el=e.target.closest && e.target.closest('.hud'); if(!el) return;
  var r=el.getBoundingClientRect();
  el.style.setProperty('--mx',(e.clientX-r.left)+'px');
  el.style.setProperty('--my',(e.clientY-r.top)+'px');
}, {passive:true});

// Smooth reveal of sections on scroll
if ('IntersectionObserver' in window && !reduce){
  document.documentElement.classList.add('rv-on');
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){ if (en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
  },{rootMargin:'0px 0px -8% 0px', threshold:.08});
  document.querySelectorAll('.rv').forEach(function(el){ io.observe(el); });
}

/* ---------- The coin ---------- */
// Front: the logo. Back: an engraved line. Every 9th flip lands on a rarer one.
(function(){
  var coin=$('coin'); if (!coin) return;
  var tilt=$('coinTilt'), msg=$('coinMsg'), live=$('coinLive');
  var LINES = {
    common: 'The core<br>remembers<br>who came<br>first',
    rare:   'You found<br>the signal.<br>Tell no one.<small>Operator 0</small>'
  };
  var PLAIN = {
    common: 'The core remembers who came first.',
    rare:   'You found the signal. Tell no one. Operator 0.'
  };
  var KEY='t92.coin', angle=0, back=false, flips=0, audio=null, landT=null;
  try{ flips = parseInt(localStorage.getItem(KEY),10) || 0; }catch(e){}
  msg.innerHTML = LINES.common;

  // short metallic "ting" when the coin lands
  function ting(){
    try{
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      [1318.5, 1975.5].forEach(function(freq, i){
        var o=audio.createOscillator(), g=audio.createGain();
        o.type='sine'; o.frequency.value=freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(i ? 0.018 : 0.035, t+0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t+(i ? 0.5 : 0.9));
        o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t+1);
      });
    }catch(e){}
  }

  function signal(){
    var el=$('status'), prevS=el.getAttribute('data-s'), prevL=el.querySelector('span').textContent;
    setStatus('fission','Signal decoded');
    toast('Signal decoded. Operator 0 is watching.');
    setTimeout(function(){ if (el.getAttribute('data-s')==='fission') setStatus(prevS, prevL); }, 3200);
  }

  function flip(){
    flips++;
    try{ localStorage.setItem(KEY, String(flips)); }catch(e){}
    var rare = flips % 9 === 0;
    // a rare flip always lands on the back; any other flip turns the coin over
    var toBack = rare ? true : !back;
    angle += 720 + (toBack !== back ? 180 : 0);
    back = toBack;
    coin.classList.add('spinning');
    coin.style.setProperty('--ry', angle+'deg');
    // swap the engraving mid-spin
    msg.classList.add('swap');
    setTimeout(function(){
      msg.innerHTML = rare ? LINES.rare : LINES.common;
      coin.setAttribute('data-rare', rare ? '1' : '0');
      msg.classList.remove('swap');
    }, reduce ? 0 : 420);
    clearTimeout(landT);
    landT = setTimeout(function(){
      coin.classList.remove('spinning');
      ting();
      live.textContent = back ? 'Back of the coin: '+(rare ? PLAIN.rare : PLAIN.common) : 'Front of the coin.';
      if (rare) signal();
    }, reduce ? 0 : 1250);
  }
  coin.addEventListener('click', flip);

  // gentle 3D tilt that follows the mouse
  if (!reduce && window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches){
    coin.addEventListener('pointermove', function(e){
      var r=coin.getBoundingClientRect(), x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
      tilt.style.setProperty('--tx', (-y*22).toFixed(1)+'deg');
      tilt.style.setProperty('--ty', (x*22).toFixed(1)+'deg');
    });
    coin.addEventListener('pointerleave', function(){
      tilt.style.setProperty('--tx','0deg'); tilt.style.setProperty('--ty','0deg');
    });
  }
})();

// For the ones who open the console.
try{
  console.log('%c☢ REACTOR 92', 'color:#A8FF2E;font:900 22px/1.4 monospace');
  console.log('%cYou looked under the hood. Most people never do.\nThe coin has two sides. The ninth time, it has three.', 'color:#8B9A86;font:12px/1.6 monospace');
}catch(e){}

/* ---------- Startup ---------- */
renderWallets();
renderLore();
if (CONFIG.MINT_ADDRESS){
  var mint = encodeURIComponent(CONFIG.MINT_ADDRESS);
  $('caText').textContent = CONFIG.MINT_ADDRESS;
  $('caCopy').disabled = false;
  $('caNote').innerHTML = 'Official contract. Double-check it matches the one on <span class="handle">@T0KEN92</span>.';
  $('lnkDex').href = 'https://dexscreener.com/solana/'+mint;
  $('lnkScan').href = 'https://solscan.io/token/'+mint;
  $('lnkPump').href = 'https://pump.fun/coin/'+mint;
  $('caLinks').hidden = false;
} else {
  console.info('[T92] Pre-launch mode: set CONFIG.MINT_ADDRESS to power up the reactor.');
}
refresh();
schedulePoll();
fetchPrice();
schedulePricePoll();
})();
