// ===== グローバル =====
let STATIONS={},EDGES={},STATION_NAMES=[];
let stationCount=0;
const MAX_STATIONS=10,TRANSFER_PENALTY=5;
let suggestTimers={};

// ===== データ読み込み =====
async function loadData(){
  try{
    document.getElementById('initLoading').textContent='駅データをダウンロード中...';
    const res=await fetch('stations_graph.json');
    document.getElementById('initLoading').textContent='駅データを解析中...';
    const data=await res.json();
    document.getElementById('initLoading').textContent='駅データを準備中...';
    STATIONS=data.stations;
    EDGES=data.edges;
    STATION_NAMES=Object.keys(STATIONS).sort();
    document.getElementById('initLoading').style.display='none';
    document.getElementById('mainApp').style.display='block';
    addStation();addStation();
  }catch(e){
    document.getElementById('initLoading').textContent='データの読み込みに失敗しました: '+e.message+' (URLが http://127.0.0.1:8080 か確認してください)';
  }
}

// ===== ダイクストラ法（優先度キュー付き） =====
function dijkstra(startName,maxMinutes){
  if(maxMinutes===undefined) maxMinutes=180;
  var dist={},prev={},prevLine={},visited={};
  dist[startName]=0;
  // 簡易バイナリヒープ
  var heap=[[0,startName]];
  function heapPush(item){
    heap.push(item);
    var i=heap.length-1;
    while(i>0){
      var p=(i-1)>>1;
      if(heap[p][0]<=heap[i][0]) break;
      var tmp=heap[p];heap[p]=heap[i];heap[i]=tmp;
      i=p;
    }
  }
  function heapPop(){
    var top=heap[0],last=heap.pop();
    if(heap.length>0){
      heap[0]=last;
      var i=0,n=heap.length;
      while(true){
        var l=2*i+1,r=2*i+2,smallest=i;
        if(l<n&&heap[l][0]<heap[smallest][0]) smallest=l;
        if(r<n&&heap[r][0]<heap[smallest][0]) smallest=r;
        if(smallest===i) break;
        var tmp=heap[i];heap[i]=heap[smallest];heap[smallest]=tmp;
        i=smallest;
      }
    }
    return top;
  }

  while(heap.length>0){
    var pair=heapPop();
    var cost=pair[0],u=pair[1];
    if(visited[u]) continue;
    visited[u]=true;
    if(cost>maxMinutes) continue;
    var edges=EDGES[u];
    if(!edges) continue;
    for(var j=0;j<edges.length;j++){
      var e=edges[j],v=e.to;
      if(visited[v]) continue;
      var transferCost=0;
      if(prev[u]!==undefined&&prevLine[u]!==e.line) transferCost=TRANSFER_PENALTY;
      var newCost=cost+e.min+transferCost;
      if(dist[v]===undefined||newCost<dist[v]){
        dist[v]=newCost;
        prev[v]=u;
        prevLine[v]=e.line;
        heapPush([newCost,v]);
      }
    }
  }
  return {dist:dist,prev:prev,prevLine:prevLine};
}

// 経路復元
function reconstructPath(prev,prevLine,from,to){
  if(prev[to]===undefined&&from!==to) return null;
  var path=[],cur=to;
  while(cur!==from){
    path.unshift({station:cur,line:prevLine[cur]});
    cur=prev[cur];
    if(cur===undefined) return null;
  }
  path.unshift({station:from,line:path.length>0?path[0].line:''});
  var transfers=0;
  for(var i=1;i<path.length;i++){
    if(path[i].line!==path[i-1].line) transfers++;
  }
  var routeLines=[],currentLine='';
  for(var i=0;i<path.length;i++){
    if(path[i].line&&path[i].line!==currentLine){
      routeLines.push(path[i].line);
      currentLine=path[i].line;
    }
  }
  // 総距離を計算
  var totalKm=0;
  for(var i=0;i<path.length-1;i++){
    var edges=EDGES[path[i].station];
    if(edges){
      for(var j=0;j<edges.length;j++){
        if(edges[j].to===path[i+1].station&&edges[j].line===path[i+1].line){
          totalKm+=edges[j].km||0;
          break;
        }
      }
    }
  }
  return {path:path,transfers:transfers,routeLines:routeLines,km:Math.round(totalKm*10)/10};
}

// JR概算運賃テーブル（距離→円）
function estimateFare(km){
  if(km<=3) return 150;
  if(km<=6) return 190;
  if(km<=10) return 200;
  if(km<=15) return 230;
  if(km<=20) return 260;
  if(km<=25) return 330;
  if(km<=30) return 420;
  if(km<=35) return 510;
  if(km<=40) return 580;
  if(km<=45) return 670;
  if(km<=50) return 760;
  if(km<=60) return 860;
  if(km<=70) return 990;
  if(km<=80) return 1170;
  if(km<=90) return 1340;
  if(km<=100) return 1520;
  return Math.round(1520+(km-100)*15);
}

// ===== UI =====
function addStation(){
  if(stationCount>=MAX_STATIONS) return;
  stationCount++;
  var idx=stationCount;
  var container=document.getElementById('stationInputs');
  var row=document.createElement('div');
  row.className='station-row';
  row.id='row-'+idx;
  row.innerHTML=
    '<label for="st-'+idx+'">出発駅'+idx+'</label>'+
    '<input type="text" id="st-'+idx+'" placeholder="駅名を入力" autocomplete="off"'+
    ' oninput="onInput('+idx+')" onfocus="onInput('+idx+')"'+
    ' onkeydown="onKeydown(event,'+idx+')"'+
    ' aria-label="出発駅'+idx+'の駅名">'+
    '<div class="suggest-list" id="suggest-'+idx+'"></div>'+
    (idx>2?'<button class="btn-remove" onclick="removeStation('+idx+')" aria-label="出発駅'+idx+'を削除">✕</button>':'');
  container.appendChild(row);
  document.getElementById('btnAdd').disabled=stationCount>=MAX_STATIONS;
  document.getElementById('st-'+idx).focus();
}

function removeStation(idx){
  var row=document.getElementById('row-'+idx);
  if(row) row.remove();
  document.getElementById('btnAdd').disabled=
    document.querySelectorAll('.station-row').length>=MAX_STATIONS;
}

function onInput(idx){
  clearTimeout(suggestTimers[idx]);
  suggestTimers[idx]=setTimeout(function(){showSuggest(idx);},150);
}

function showSuggest(idx){
  var input=document.getElementById('st-'+idx);
  if(!input) return;
  var q=input.value.trim();
  var list=document.getElementById('suggest-'+idx);
  if(!q){list.style.display='none';return;}
  var exact=[],partial=[];
  for(var i=0;i<STATION_NAMES.length;i++){
    var name=STATION_NAMES[i];
    if(name.indexOf(q)===0) exact.push(name);
    else if(name.indexOf(q)>=0) partial.push(name);
    if(exact.length+partial.length>=12) break;
  }
  var results=exact.concat(partial).slice(0,12);
  if(!results.length){list.style.display='none';return;}
  var html='';
  for(var i=0;i<results.length;i++){
    var name=results[i];
    var lines=STATIONS[name].lines.slice(0,3).join(', ');
    html+='<div class="suggest-item" data-idx="'+i+'" onmousedown="selectStation('+idx+',\''+name.replace(/'/g,"\\'")+'\')">'
      +name+'<span class="line-info">'+lines+'</span></div>';
  }
  list.innerHTML=html;
  list.style.display='block';
  list._activeIdx=-1;
}

function onKeydown(e,idx){
  var list=document.getElementById('suggest-'+idx);
  if(list.style.display==='none') return;
  var items=list.querySelectorAll('.suggest-item');
  if(!items.length) return;
  if(e.key==='ArrowDown'){
    e.preventDefault();
    list._activeIdx=Math.min((list._activeIdx||0)+1,items.length-1);
    for(var i=0;i<items.length;i++) items[i].classList.toggle('active',i===list._activeIdx);
  }else if(e.key==='ArrowUp'){
    e.preventDefault();
    list._activeIdx=Math.max((list._activeIdx||0)-1,0);
    for(var i=0;i<items.length;i++) items[i].classList.toggle('active',i===list._activeIdx);
  }else if(e.key==='Enter'){
    e.preventDefault();
    var active=list.querySelector('.suggest-item.active');
    if(active) active.onmousedown();
    else if(items[0]) items[0].onmousedown();
  }
}

function selectStation(idx,name){
  document.getElementById('st-'+idx).value=name;
  document.getElementById('suggest-'+idx).style.display='none';
}

document.addEventListener('click',function(e){
  if(!e.target.closest('.station-row'))
    document.querySelectorAll('.suggest-list').forEach(function(el){el.style.display='none';});
});

// ===== 検索 =====
function doSearch(){
  var inputs=document.querySelectorAll('.station-row input');
  var departures=[];
  for(var i=0;i<inputs.length;i++){
    var v=inputs[i].value.trim();
    if(!v) continue;
    if(!STATIONS[v]){showError('駅が見つかりません: '+v);return;}
    departures.push(v);
  }
  if(departures.length<2){showError('2駅以上入力してください');return;}

  var area=document.getElementById('resultArea');
  area.innerHTML='<div style="text-align:center;padding:20px;color:#718096">経路を計算中...</div>';
  document.getElementById('btnSearch').disabled=true;

  setTimeout(function(){
    try{
      var results=calculateMeetingStations(departures);
      renderResults(departures,results);
    }catch(e){
      showError('計算エラー: '+e.message);
    }finally{
      document.getElementById('btnSearch').disabled=false;
    }
  },50);
}

function calculateMeetingStations(departures){
  var dijkResults=[];
  for(var i=0;i<departures.length;i++){
    dijkResults.push(dijkstra(departures[i]));
  }
  var depSet={};
  for(var i=0;i<departures.length;i++) depSet[departures[i]]=true;

  var candidates=[];
  for(var si=0;si<STATION_NAMES.length;si++){
    var name=STATION_NAMES[si];
    if(depSet[name]) continue;
    var allReachable=true,maxMin=0,totalMin=0,times=[];
    for(var i=0;i<departures.length;i++){
      var d=dijkResults[i].dist[name];
      if(d===undefined){allReachable=false;break;}
      var mins=Math.round(d);
      times.push(mins);
      totalMin+=mins;
      if(mins>maxMin) maxMin=mins;
    }
    if(!allReachable) continue;
    var avgMin=Math.round(totalMin/departures.length);
    candidates.push({name:name,times:times,maxMin:maxMin,avgMin:avgMin,totalMin:totalMin});
  }

  candidates.sort(function(a,b){return a.maxMin-b.maxMin||(a.avgMin-b.avgMin);});

  var top=candidates.slice(0,5);
  for(var ci=0;ci<top.length;ci++){
    var c=top[ci];
    c.routes=[];
    for(var i=0;i<departures.length;i++){
      var route=reconstructPath(dijkResults[i].prev,dijkResults[i].prevLine,departures[i],c.name);
      c.routes.push({
        from:departures[i],
        minutes:c.times[i],
        transfers:route?route.transfers:0,
        routeLines:route?route.routeLines:[],
        path:route?route.path:[],
        km:route?route.km:0,
        fare:route?estimateFare(route.km):0
      });
    }
    // 候補全体の集計
    c.totalTransfers=0;c.totalFare=0;
    for(var i=0;i<c.routes.length;i++){
      c.totalTransfers+=c.routes[i].transfers;
      c.totalFare+=c.routes[i].fare;
    }
  }

  // バッジ判定
  if(top.length>0){
    var minTime=top[0].maxMin,minFare=Infinity,minTransfers=Infinity;
    for(var i=0;i<top.length;i++){
      if(top[i].totalFare<minFare) minFare=top[i].totalFare;
      if(top[i].totalTransfers<minTransfers) minTransfers=top[i].totalTransfers;
    }
    for(var i=0;i<top.length;i++){
      top[i].badges=[];
      if(top[i].maxMin===minTime) top[i].badges.push('最速');
      if(top[i].totalFare===minFare) top[i].badges.push('最安');
      if(top[i].totalTransfers===minTransfers) top[i].badges.push('乗換最少');
    }
  }
  return top;
}

// ===== 結果表示 =====
function renderResults(departures,results){
  var area=document.getElementById('resultArea');
  if(!results.length){
    area.innerHTML='<div class="card"><p>全出発駅から到達可能な候補が見つかりませんでした</p></div>';
    return;
  }
  var html='<div class="card"><div style="font-size:1.05em;font-weight:600;color:#2c5282;margin-bottom:14px">🎯 中間地点の候補駅（経路ベース）</div>';
  for(var i=0;i<results.length;i++){
    var r=results[i];
    var rankClass=i<3?'rank-'+(i+1):'rank-other';
    var stInfo=STATIONS[r.name];
    html+='<div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:10px">';
    html+='<div><span class="rank '+rankClass+'">'+(i+1)+'</span>';
    html+='<span style="font-size:1.05em;font-weight:700;color:#2d3748">'+r.name+'</span>';
    if(r.badges&&r.badges.length>0){
      for(var bi=0;bi<r.badges.length;bi++){
        var bc=r.badges[bi]==='最速'?'background:#c6f6d5;color:#276749':r.badges[bi]==='最安'?'background:#bee3f8;color:#2a4365':'background:#fefcbf;color:#975a16';
        html+=' <span style="display:inline-block;'+bc+';padding:1px 8px;border-radius:10px;font-size:.65em;font-weight:600;margin-left:4px">'+r.badges[bi]+'</span>';
      }
    }
    html+=' <a href="https://www.google.com/search?q='+encodeURIComponent(r.name+' 居酒屋')+'" target="_blank" rel="noopener" style="font-size:.7em;color:#e53e3e;text-decoration:none;margin-left:6px">🍺居酒屋を検索</a></div>';
    html+='<div style="color:#718096;font-size:.75em;margin:3px 0 8px;line-height:1.4">'+stInfo.lines.join(' / ')+'</div>';
    html+='<table style="width:100%;border-collapse:collapse;font-size:.85em">';
    html+='<tr><th style="text-align:left;padding:4px 6px;color:#718096;font-weight:500;border-bottom:1px solid #e2e8f0">出発駅</th>';
    html+='<th style="text-align:left;padding:4px 6px;color:#718096;font-weight:500;border-bottom:1px solid #e2e8f0">所要時間</th>';
    html+='<th style="text-align:left;padding:4px 6px;color:#718096;font-weight:500;border-bottom:1px solid #e2e8f0">経路</th></tr>';
    for(var j=0;j<r.routes.length;j++){
      var rt=r.routes[j];
      html+='<tr><td style="padding:4px 6px;border-bottom:1px solid #f7fafc">'+rt.from+'</td>';
      html+='<td style="padding:4px 6px;border-bottom:1px solid #f7fafc">';
      html+='<span style="display:inline-block;background:#ebf8ff;color:#2b6cb0;padding:2px 8px;border-radius:4px;font-weight:600;font-size:.9em">約'+rt.minutes+'分</span>';
      html+=' <span style="display:inline-block;background:#f0fff4;color:#276749;padding:2px 8px;border-radius:4px;font-size:.8em">約¥'+rt.fare+'</span>';
      if(rt.transfers>0){
        var detailId='detail-'+i+'-'+j;
        html+=' <span onclick="toggleDetail(\''+detailId+'\')" style="display:inline-block;background:#fefcbf;color:#975a16;padding:1px 6px;border-radius:3px;font-size:.7em;cursor:pointer;user-select:none">乗換'+rt.transfers+'回 ▼</span>';
      }
      html+='</td>';
      html+='<td style="padding:4px 6px;border-bottom:1px solid #f7fafc;color:#a0aec0;font-size:.75em">'+rt.routeLines.join(' → ')+'</td></tr>';
      if(rt.transfers>0&&rt.path&&rt.path.length>0){
        var detailId='detail-'+i+'-'+j;
        html+='<tr id="'+detailId+'" style="display:none"><td colspan="3" style="padding:6px 6px 10px 20px">';
        html+='<div style="font-size:.75em;color:#4a5568;line-height:1.8">';
        var curLine='';
        for(var k=0;k<rt.path.length;k++){
          var p=rt.path[k];
          if(p.line&&p.line!==curLine){
            if(curLine) html+='<br><span style="color:#e53e3e;font-weight:600">⇄ 乗換</span><br>';
            html+='<span style="background:#e2e8f0;padding:1px 6px;border-radius:3px;margin-right:4px">'+p.line+'</span>';
            curLine=p.line;
          }
          html+='<span style="margin:0 2px">'+p.station+'</span>';
          if(k<rt.path.length-1&&rt.path[k+1].line===curLine) html+=' → ';
        }
        html+='</div></td></tr>';
      }
    }
    html+='</table>';
    html+='<div style="display:flex;gap:12px;margin-top:8px;font-size:.8em;color:#718096;flex-wrap:wrap">';
    html+='<span>平均: 約'+r.avgMin+'分</span>';
    html+='<span>最大: 約'+r.maxMin+'分</span>';
    html+='<span>合計運賃: 約¥'+r.totalFare+'</span>';
    html+='</div></div>';
  }
  html+='</div>';
  area.innerHTML=html;
}

function toggleDetail(id){
  var el=document.getElementById(id);
  if(el) el.style.display=el.style.display==='none'?'':'none';
}

function showError(msg){
  document.getElementById('resultArea').innerHTML=
    '<div class="card"><div style="background:#fed7d7;color:#c53030;padding:12px;border-radius:8px;text-align:center">'+msg+'</div></div>';
  document.getElementById('btnSearch').disabled=false;
}


// ===== 起動 =====
loadData();
