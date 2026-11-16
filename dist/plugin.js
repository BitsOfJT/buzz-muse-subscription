// embedded:native-bridge
var native_bridge_default = 'var M=require("node:child_process"),U=require("node:fs"),f=require("node:fs/promises"),_=require("node:os"),l=require("node:path"),G=require("node:string_decoder"),R=Object.freeze({request:4*1024*1024,line:16*1024*1024,output:4*1024*1024}),H="1.1.0",ne=new Set(["muse-wonder-1.0","muse-spark-1.3","muse-ember-1.0"]),y=class extends Error{},d=e=>{throw new y(e)};function B(e){return e instanceof y?e.message:"The bridge operation failed. Check Muse, muse-acp, and Node.js availability, then retry."}function A(e,n=(0,_.homedir)()){return(typeof e!="string"||e.length===0||e.length>4096||/[\\x00-\\x1f\\x7f]/.test(e))&&d("Paths must be absolute paths or start with ~/."),e==="~"?n:e.startsWith("~/")||process.platform==="win32"&&e.startsWith("~\\\\")?(0,l.normalize)((0,l.join)(n,e.slice(2))):((0,l.isAbsolute)(e)||d("Paths must be absolute paths or start with ~/."),(0,l.normalize)(e))}function se(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function P(e,n,t=!1){return typeof e=="string"&&Buffer.byteLength(e)<=n&&(!t||e.length>0)&&!e.includes("\\0")}function V(e){(!se(e)||!["status","run"].includes(e.action))&&d("Invalid bridge request.");let n=e.action==="run"?["action","adapter","model","prompt","systemPrompt","sessionId","resume","permissionMode","cwd"]:["action","adapter"];return Object.keys(e).some(t=>!n.includes(t))&&d("Unexpected bridge request field."),e.adapter!==void 0&&e.adapter!==""&&e.adapter!=="muse-acp"&&A(e.adapter),e.adapter!==void 0&&typeof e.adapter!="string"&&d("Invalid muse-acp executable path."),e.action!=="run"||(e.model!==void 0&&e.model!=="default"&&!ne.has(e.model)&&d("Unsupported Muse model."),(!P(e.prompt,2*1024*1024,!0)||!P(e.systemPrompt??"",1024*1024))&&d("Invalid or oversized prompt."),typeof e.resume!="boolean"&&d("An explicit resume flag is required."),e.resume&&!P(e.sessionId,256,!0)&&d("A stored session id is required to resume."),!e.resume&&e.sessionId!==void 0&&e.sessionId!==null&&!P(e.sessionId,256)&&d("Invalid session id."),["default","acceptEdits"].includes(e.permissionMode)||d("Only default and acceptEdits permission modes are supported."),A(e.cwd)),e}async function F(e,{signal:n,timeout:t=15e3}={}){let s=0,a=[],r=()=>e.destroy(new y("Bridge request cancelled.")),o=setTimeout(()=>e.destroy(new y("Timed out waiting for a complete bridge request.")),t);n?.addEventListener("abort",r,{once:!0});try{n?.aborted&&d("Bridge request cancelled.");for await(let c of e){let u=Buffer.isBuffer(c)?c:Buffer.from(c);s+=u.length,s>R.request&&d("Bridge request exceeds the size limit."),a.push(u)}let i;try{i=JSON.parse(Buffer.concat(a,s).toString("utf8"))}catch{d("Bridge input must contain exactly one JSON request.")}return i}finally{clearTimeout(o),n?.removeEventListener("abort",r)}}function C(e=process.env,{home:n=(0,_.homedir)(),museBin:t}={}){let s={};for(let[o,i]of Object.entries(e))/^(?:NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|BASH_ENV|ENV|LD_PRELOAD|LD_LIBRARY_PATH|LD_AUDIT|DYLD_.*)$/i.test(o)||/^(?:HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)$/i.test(o)||/^MUSE_.*(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(o)||i!==void 0&&(s[o]=i);let a=[(0,l.join)(n,".local","bin"),(0,l.join)(n,".npm-global","bin"),"/usr/local/bin","/opt/homebrew/bin"],r=(s.PATH||"").split(l.delimiter).filter(Boolean);for(let o of a)r.includes(o)||r.push(o);return s.PATH=r.join(l.delimiter),t&&(s.MUSE_BIN=t),s}function W(e,n){let t,s=()=>{e.exitCode!==null||e.signalCode!==null||(e.kill("SIGTERM"),t??=setTimeout(()=>e.kill("SIGKILL"),1500))},a=new Promise(r=>{e.once("error",()=>r({code:null,failed:!0})),e.once("close",o=>r({code:o,failed:!1}))});return n?.addEventListener("abort",s,{once:!0}),n?.aborted&&s(),{stop:s,closed:a,dispose(){clearTimeout(t),n?.removeEventListener("abort",s)}}}async function oe(e,n,{env:t,timeout:s=8e3,limit:a=4096,signal:r}={}){r?.aborted&&d("Bridge operation cancelled.");let o=(0,M.spawn)(e,n,{env:t,stdio:["ignore","pipe","pipe"],windowsHide:!0}),i=W(o,r),c=[],u=0;o.stdout.on("data",x=>{u+=x.length,u<=a&&c.push(x)}),o.stderr.on("data",()=>{});let h=setTimeout(()=>i.stop(),s);try{let x=await i.closed;return{code:x.code,failed:x.failed,output:Buffer.concat(c).toString("utf8")}}finally{clearTimeout(h),i.dispose()}}async function Y(e){try{return await(0,f.access)(e,U.constants.X_OK),(await(0,f.stat)(e)).isFile()}catch{return!1}}async function J(e,{env:n=process.env,home:t=(0,_.homedir)(),signal:s}={}){let a=e!==void 0&&e!==""&&e!=="muse-acp",r=[];if(a)r.push(A(e,t));else{let o=process.platform==="win32"?"muse-acp.cmd":"muse-acp",i=Object.entries(n).find(([c])=>c.toUpperCase()==="PATH")?.[1]??"";for(let c of i.split(l.delimiter))(0,l.isAbsolute)(c)&&r.push((0,l.join)(c,o));r.push((0,l.join)(t,".local","bin","muse-acp"),(0,l.join)(t,".npm-global","bin","muse-acp"))}for(let o of new Set(r)){if(s?.aborted&&d("Bridge operation cancelled."),!await Y(o))continue;let i=o;try{i=await(0,f.realpath)(o)}catch{}return i.endsWith(".js")?{path:o,command:process.execPath,args:[i]}:process.platform==="win32"&&/\\.(?:cmd|bat)$/i.test(o)?{path:o,command:"cmd.exe",args:["/d","/s","/c",`"${o}"`]}:{path:o,command:o,args:[]}}return a&&d("The configured muse-acp executable is unavailable."),null}async function X({env:e=process.env,home:n=(0,_.homedir)(),signal:t}={}){let s=[],a=process.platform==="win32"?"muse.exe":"muse",r=Object.entries(e).find(([i])=>i.toUpperCase()==="PATH")?.[1]??"";for(let i of r.split(l.delimiter))(0,l.isAbsolute)(i)&&s.push((0,l.join)(i,a));s.push((0,l.join)(n,".local","bin","muse"));let o=null;for(let i of new Set(s)){if(t?.aborted&&d("Bridge operation cancelled."),!await Y(i))continue;let c=await oe(i,["--version"],{env:C(e,{home:n}),signal:t}).catch(()=>null),u=c?.code===0?c.output.match(/\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?/):null;if(u)return{binary:i,version:u[0]};o??={binary:i,version:null}}return o}var D=e=>`\'${String(e).replace(/\'/g,"\'\\\\\'\'")}\'`;function ie(e,n){return process.platform==="win32"?["@echo off","rem Generated by the buzz-muse-subscription bridge: run the genuine Muse",`rem client, adding --model ${n} to \\`muse serve\\` invocations only.`,\'if /i not "%~1"=="serve" goto passthrough\',\'set "REST="\',"shift",":collect",\'if "%~1"=="" goto launch\',\'set REST=%REST% "%~1"\',"shift","goto collect",":launch",`"${e}" serve --model ${n}%REST%`,"exit /b %errorlevel%",":passthrough",`"${e}" %*`,"exit /b %errorlevel%",""].join(`\\r\n`):["#!/bin/sh","# Generated by the buzz-muse-subscription bridge: run the genuine Muse",`# client, adding --model ${n} to \\`muse serve\\` invocations only;`,"# every other invocation passes through untouched.",\'if [ "$1" = "serve" ]; then\',"  shift",`  exec ${D(e)} serve --model ${n} "$@"`,"fi",`exec ${D(e)} "$@"`,""].join(`\n`)}async function re(e,n,{home:t=(0,_.homedir)()}={}){let s=(0,l.join)(t,".buzz","muse-subscription","bin"),a=(0,l.join)(s,process.platform==="win32"?`muse-${n}.cmd`:`muse-${n}`),r=ie(e,n);try{await(0,f.mkdir)(s,{recursive:!0});let o=null;try{o=await(0,f.readFile)(a,"utf8")}catch{}o!==r&&(await(0,f.writeFile)(a,r,{mode:493}),process.platform!=="win32"&&await(0,f.chmod)(a,493))}catch{d(`Could not prepare the model launcher for ${n}. Check that ${s} is writable, or choose Muse default for this agent.`)}return a}var O=class{constructor(n,{env:t,signal:s,onUpdate:a,onPermission:r}){this.child=(0,M.spawn)(n.command,n.args,{env:t,stdio:["pipe","pipe","pipe"],windowsHide:!0}),this.tracked=W(this.child,s),this.pending=new Map,this.nextId=1,this.onUpdate=a,this.onPermission=r,this.dead=null;let o=new G.StringDecoder("utf8"),i="";this.child.stdout.on("data",c=>{if(this.dead)return;i+=o.write(c);let u;for(;(u=i.indexOf(`\n`))!==-1;){let h=i.slice(0,u);if(i=i.slice(u+1),this.receive(h),this.dead){i="";return}}i.length>R.line&&this.failAll(new y("The muse-acp adapter sent an oversized line."))}),this.child.stderr.on("data",()=>{}),this.child.stdin.on("error",()=>{}),this.tracked.closed.then(({code:c})=>{this.failAll(new y(`The muse-acp adapter exited unexpectedly (${c??"signal"}).`))})}failAll(n){if(!this.dead){this.dead=n;for(let t of this.pending.values())t.reject(n);this.pending.clear(),this.tracked.stop()}}receive(n){if(!n.trim())return;let t;try{t=JSON.parse(n)}catch{this.failAll(new y("The muse-acp adapter sent malformed output."));return}if(t.id!==void 0&&t.id!==null&&(t.result!==void 0||t.error!==void 0)){let s=this.pending.get(t.id);if(!s)return;this.pending.delete(t.id),t.error?s.reject(new y(ae(t.error))):s.resolve(t.result);return}if(t.method==="session/update"){this.onUpdate?.(t.params);return}if(t.method==="session/request_permission"&&t.id!==void 0){Promise.resolve().then(()=>this.onPermission?.(t.params)).then(s=>this.respond(t.id,s??{outcome:{outcome:"cancelled"}})).catch(()=>this.respondError(t.id));return}t.method&&t.id!==void 0&&this.respondError(t.id)}send(n){if(this.dead)throw this.dead;this.child.stdin.write(`${JSON.stringify(n)}\n`)}request(n,t,{timeout:s=6e4,signal:a}={}){let r=this.nextId++;return new Promise((o,i)=>{let c=setTimeout(()=>{this.pending.delete(r),i(new y(`Timed out waiting for the Muse engine (${n}).`))},s),u=()=>{this.pending.delete(r),clearTimeout(c),i(new y("Bridge operation cancelled."))};a?.addEventListener("abort",u,{once:!0}),this.pending.set(r,{resolve:h=>{clearTimeout(c),a?.removeEventListener("abort",u),o(h)},reject:h=>{clearTimeout(c),a?.removeEventListener("abort",u),i(h)}});try{this.send({jsonrpc:"2.0",id:r,method:n,params:t})}catch(h){this.pending.delete(r),clearTimeout(c),i(h)}})}notify(n,t){try{this.send({jsonrpc:"2.0",method:n,params:t})}catch{}}respond(n,t){try{this.send({jsonrpc:"2.0",id:n,result:t})}catch{}}respondError(n){try{this.send({jsonrpc:"2.0",id:n,error:{code:-32601,message:"Unsupported by this client."}})}catch{}}async close(){this.tracked.stop(),await this.tracked.closed,this.tracked.dispose()}};function ae(e){let n=typeof e?.message=="string"?e.message.replace(/[\\r\\n]+/g," ").trim().slice(0,300):"";return/auth|login|sign.?in|unauthor|credential/i.test(n)?"Muse reports it is not signed in. Run `muse login` in a terminal on this computer, then try again.":n?`Muse turn failed: ${n}`:"Muse turn failed."}async function ce(e,{emit:n,signal:t}={}){V(e);let s=A(e.cwd);try{(await(0,f.stat)(s)).isDirectory()||d("The requested working directory does not exist.")}catch{d("The requested working directory does not exist or is inaccessible.")}let a=await J(e.adapter,{signal:t});a||d("muse-acp was not found. Install Muse and the muse-acp adapter, or configure the adapter executable path in the agent settings.");let r=await X({signal:t}).catch(()=>null),o=r?.binary;e.model&&e.model!=="default"&&(r?.binary||d("The Muse client was not found, so the selected model cannot be applied. Install Muse, or choose Muse default for this agent."),o=await re(r.binary,e.model));let i=C(process.env,{museBin:o}),c="",u=0,h=!1,x=!1,j=new Set,z=[],v=new O(a,{env:i,signal:t,onUpdate:w=>{let p=w?.update;if(!(!p||typeof p!="object")&&x)if(p.sessionUpdate==="agent_message_chunk"&&p.content?.type==="text"&&typeof p.content.text=="string"){if(!h){let m=p.content.text,T=Buffer.byteLength(m);if(u+T>R.output){let E=R.output-u,b=m;for(;b.length&&Buffer.byteLength(b)>E;)b=b.slice(0,-1);c+=b,u+=Buffer.byteLength(b),h=!0}else c+=m,u+=T}n({type:"assistant",message:{content:[{type:"text",text:c}]}})}else p.sessionUpdate==="tool_call"&&p.toolCallId&&!j.has(p.toolCallId)&&(j.add(p.toolCallId),n({type:"assistant",message:{content:[{type:"tool_use",name:p.title||p.kind||"tool"}]}}))},onPermission:w=>{let p=w?.toolCall||{},m=Array.isArray(w?.options)?w.options:[],T=e.permissionMode==="acceptEdits"&&p.kind==="edit",E=m.find(g=>g?.kind==="allow_once"),b=m.find(g=>g?.kind==="reject_once")||m.find(g=>typeof g?.kind=="string"&&g.kind.startsWith("reject")),I=T?E:b;return T&&I?.optionId||z.push({tool_name:p.title||p.kind||"a tool"}),I?.optionId?{outcome:{outcome:"selected",optionId:I.optionId}}:{outcome:{outcome:"cancelled"}}}});try{let w=await v.request("initialize",{protocolVersion:1,clientCapabilities:{fs:{readTextFile:!1,writeTextFile:!1},terminal:!1},clientInfo:{name:"buzz-muse-subscription",version:H}},{timeout:3e4,signal:t});(!w||typeof w!="object")&&d("The muse-acp adapter did not complete its handshake.");let p=w.agentCapabilities?.loadSession!==!1,m,T=!1;if(e.resume&&e.sessionId&&p)try{await v.request("session/load",{sessionId:e.sessionId,cwd:s,mcpServers:[]},{timeout:3e4,signal:t}),m=e.sessionId}catch{}if(!m){let S=await v.request("session/new",{cwd:s,mcpServers:[]},{timeout:3e4,signal:t});(!S||typeof S.sessionId!="string"||!S.sessionId)&&d("The Muse engine did not return a session."),m=S.sessionId,T=!0}await n({type:"bridge_started"});let E=typeof e.systemPrompt=="string"?e.systemPrompt.trim():"",b=T&&E?`${E}\n\n---\n\n${e.prompt}`:e.prompt,I;x=!0;let g=await v.request("session/prompt",{sessionId:m,prompt:[{type:"text",text:b}]},{timeout:1860*1e3,signal:t}).catch(S=>(I=S,null));if(t?.aborted&&(v.notify("session/cancel",{sessionId:m}),d("Muse run cancelled.")),I)throw I;let L=typeof g?.stopReason=="string"?g.stopReason:"end_turn",N=L==="end_turn"||L==="max_tokens",te=h?`${c}\n\n[Reply truncated \\u2014 it exceeded the plugin\'s reply size limit.]`:c;return await n({type:"result",session_id:m,result:te,is_error:!N,subtype:L,permission_denials:z}),N?0:1}finally{await v.close()}}async function de(e,{signal:n}={}){let t={adapter:null,adapterVersion:null,muse:null,museVersion:null,engineReady:!1},s=await X({signal:n}).catch(()=>null);s&&(t.muse=s.binary,t.museVersion=s.version);let a=await J(e,{signal:n}).catch(()=>null);if(!a)return t.error="muse-acp was not found. Install it (npm install -g muse-acp) or configure its executable path in the agent settings.",t;t.adapter=a.path;let r=new O(a,{env:C(process.env,{museBin:s?.binary}),signal:n,onUpdate:()=>{},onPermission:()=>({outcome:{outcome:"cancelled"}})});try{let o=await r.request("initialize",{protocolVersion:1,clientCapabilities:{fs:{readTextFile:!1,writeTextFile:!1},terminal:!1},clientInfo:{name:"buzz-muse-subscription",version:H}},{timeout:3e4,signal:n});t.engineReady=!!(o&&typeof o=="object"),t.adapterVersion=typeof o?.agentInfo?.version=="string"?o.agentInfo.version:null,t.engineReady||(t.error="The muse-acp adapter did not complete its handshake.")}catch(o){t.error=B(o)}finally{await r.close()}return t}async function K(e,{emit:n,signal:t}={}){return V(e),e.action==="status"?(await n({type:"bridge_status",...await de(e.adapter,{signal:t})}),0):await ce(e,{emit:n,signal:t})}var k=new AbortController,$,Z=e=>{$=e==="SIGINT"?130:143,k.abort()},q=()=>Z("SIGTERM"),ee=()=>Z("SIGINT"),le=()=>k.abort();process.on("SIGTERM",q);process.on("SIGINT",ee);process.stdout.on("error",le);function Q(e){return new Promise((n,t)=>{let s=setTimeout(()=>{k.abort(),t(new Error("Output unavailable."))},15e3);process.stdout.write(`${JSON.stringify(e)}\n`,a=>{clearTimeout(s),a?t(a):n()})})}async function ue(){try{let e=await F(process.stdin,{signal:k.signal});process.exitCode=await K(e,{emit:Q,signal:k.signal})}catch(e){if(process.exitCode=$??1,!process.stdout.destroyed)try{await Q({type:"bridge_error",message:B(e)})}catch{}}finally{$&&(process.exitCode=$),process.removeListener("SIGTERM",q),process.removeListener("SIGINT",ee),process.stdin.destroy()}}ue();\n';

// src/session.mjs
function sessionKey(agent, conversation) {
  return JSON.stringify([agent.key, agent.relay, conversation.key]);
}
function abortError() {
  return new DOMException("Muse turn stopped.", "AbortError");
}
function safeMessage(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\b(?:sk|key|token)[-_][A-Za-z0-9_-]{16,}/gi, "[redacted]").slice(0, 1500);
}
var JsonLines = class {
  constructor(accept, maxLine = 32 * 1024 * 1024) {
    this.accept = accept;
    this.maxLine = maxLine;
    this.buffer = "";
    this.error = void 0;
  }
  push(chunk) {
    if (this.error) return;
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      this.line(line);
      if (this.error) return;
    }
    if (this.buffer.length > this.maxLine) this.error = new Error("Muse output exceeded the protocol line limit.");
  }
  line(line) {
    if (!line.trim()) return;
    if (line.length > this.maxLine) {
      this.error = new Error("Muse output exceeded the protocol line limit.");
      return;
    }
    let value;
    try {
      value = JSON.parse(line);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    } catch {
      this.error = new Error("The Muse bridge returned invalid stream JSON.");
      return;
    }
    this.accept(value);
  }
  finish() {
    if (!this.error && this.buffer.trim()) this.line(this.buffer);
    this.buffer = "";
    if (this.error) throw this.error;
  }
};
var TurnOutput = class {
  constructor(step = () => {
  }) {
    this.step = step;
    this.result = void 0;
    this.failure = void 0;
    this.lastText = "";
  }
  accept(event) {
    if (event.type === "bridge_error") this.failure = new Error(safeMessage(event.message || "Muse bridge failed."));
    if (event.type === "assistant") {
      const content = event.message?.content;
      if (Array.isArray(content)) {
        const text = content.filter((block) => block.type === "text").map((block) => block.text || "").join("\n");
        if (text) this.lastText = text;
        for (const block of content) if (block.type === "tool_use") this.step(toolName(block.name));
      }
    }
    if (event.type === "result") {
      if (this.result) this.failure = new Error("Muse returned multiple terminal results.");
      this.result = event;
    }
  }
  finish(code, cancelled = false) {
    if (cancelled) throw abortError();
    if (this.failure) throw this.failure;
    if (!this.result) throw new Error(`Muse exited without a result (${code ?? "signal"}). Check the Muse installation and sign-in in Settings.`);
    const denied = Array.isArray(this.result.permission_denials) ? this.result.permission_denials : [];
    const denials = [...new Set(denied.map((item) => toolName(item?.tool_name)))];
    if (this.result.is_error || code !== 0) {
      const permissions = denials.length ? ` Permission denied: ${denials.join(", ").slice(0, 300)}. This harness cannot answer interactive approvals.` : "";
      const detail = typeof this.result.result === "string" ? safeMessage(this.result.result).trim().slice(0, 900) : "";
      const subtype = safeMessage(this.result.subtype || "process error").slice(0, 100);
      throw new Error(`Muse could not complete this turn (${subtype}; exit ${code ?? "signal"}).${permissions}${detail ? ` ${detail}` : ""}`);
    }
    return {
      sessionId: this.result.session_id,
      text: typeof this.result.result === "string" ? this.result.result : this.lastText,
      denials
    };
  }
};
var SessionLanes = class {
  constructor() {
    this.lanes = /* @__PURE__ */ new Map();
  }
  run(key, signal, action) {
    const prior = this.lanes.get(key) || Promise.resolve();
    let removeAbort = () => {
    };
    let started = false;
    const cancelled = new Promise((_, reject) => {
      const abort = () => {
        if (!started) reject(signal.reason || abortError());
      };
      signal.addEventListener("abort", abort, { once: true });
      removeAbort = () => signal.removeEventListener("abort", abort);
      if (signal.aborted) abort();
    });
    const queued = prior.then(() => {
      signal.throwIfAborted();
      started = true;
      removeAbort();
      return action();
    });
    const settled = queued.then(() => {
    }, () => {
    });
    this.lanes.set(key, settled);
    void settled.then(() => {
      if (this.lanes.get(key) === settled) this.lanes.delete(key);
    });
    return Promise.race([queued, cancelled]).finally(removeAbort);
  }
};
async function bridgeRequest(host, source, request, { signal, onEvent = () => {
} } = {}) {
  if (!host.spawn) throw new Error("Buzz desktop process access is unavailable. Install this plugin in Buzz desktop with the Node process grant.");
  signal?.throwIfAborted();
  let process;
  let failure;
  let stopped = false;
  const parser = new JsonLines((event) => {
    if (event.type === "bridge_error") failure = new Error(safeMessage(event.message || "Muse bridge failed."));
    onEvent(event);
  });
  const stop = () => {
    stopped = true;
    if (process) void process.kill().catch(() => {
    });
  };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    try {
      process = await host.spawn("bridge", {
        args: ["-e", source],
        // Strip code-injection vectors from the bridge's own environment; the
        // bridge builds a clean environment for the adapter child itself.
        env: {
          NODE_OPTIONS: null,
          NODE_PATH: null,
          LD_PRELOAD: null,
          LD_LIBRARY_PATH: null,
          LD_AUDIT: null,
          DYLD_INSERT_LIBRARIES: null,
          DYLD_LIBRARY_PATH: null,
          DYLD_FRAMEWORK_PATH: null,
          DYLD_FALLBACK_LIBRARY_PATH: null,
          DYLD_FALLBACK_FRAMEWORK_PATH: null,
          DYLD_ROOT_PATH: null,
          DYLD_IMAGE_SUFFIX: null,
          DYLD_VERSIONED_LIBRARY_PATH: null,
          DYLD_VERSIONED_FRAMEWORK_PATH: null
        },
        onStdout: (chunk) => {
          if (failure) return;
          try {
            parser.push(chunk);
            if (parser.error) throw parser.error;
          } catch (error) {
            failure = error;
            stop();
          }
        },
        // Bridge stderr is unstructured diagnostics; never render it.
        onStderr: () => {
        }
      });
    } catch (error) {
      if (failure) throw failure;
      throw new Error(`Cannot start the Node bridge: ${safeMessage(error)}. Check Node.js 20+ on the desktop PATH and the plugin process grant.`);
    }
    if (failure) throw failure;
    if (stopped || signal?.aborted) throw signal?.reason || abortError();
    await process.write(JSON.stringify(request));
    signal?.throwIfAborted();
    await process.end();
    const code = await process.exited;
    signal?.throwIfAborted();
    if (failure) throw failure;
    parser.finish();
    if (failure) throw failure;
    return code;
  } finally {
    signal?.removeEventListener("abort", stop);
    if (process) await process.kill().catch(() => {
    });
  }
}
var PREFIX = "bitsofjt.buzz-muse-subscription/session/v1/";
var SessionStore = class {
  constructor(storage) {
    this.storage = storage;
    this.writes = Promise.resolve();
  }
  async get(key, fingerprint) {
    const raw = await this.storage.read(PREFIX + key);
    if (!raw) return void 0;
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      await this.remove(key);
      return void 0;
    }
    if (typeof value?.id !== "string" || !value.id || value.id.length > 256 || typeof value.cursor !== "string" || value.fingerprint !== fingerprint || value.inFlight) {
      await this.remove(key);
      return void 0;
    }
    return value;
  }
  mutate(action) {
    const result = this.writes.then(action);
    this.writes = result.catch(() => {
    });
    return result;
  }
  put(key, value) {
    return this.mutate(async () => {
      await this.storage.set(PREFIX + key, JSON.stringify(value));
      const agentKey = JSON.parse(key)[0];
      const entries = await this.storage.scan(PREFIX);
      const matching = Object.entries(entries).flatMap(([storedKey, raw]) => {
        try {
          if (JSON.parse(storedKey.slice(PREFIX.length))[0] !== agentKey) return [];
          const saved = JSON.parse(raw);
          return [{ key: storedKey, at: Number.isFinite(saved.at) ? saved.at : 0 }];
        } catch {
          return [];
        }
      }).sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
      for (const old of matching.slice(200)) await this.storage.set(old.key, null);
    });
  }
  remove(key) {
    return this.mutate(() => this.storage.set(PREFIX + key, null));
  }
  clear(agentKey) {
    return this.mutate(async () => {
      const entries = await this.storage.scan(PREFIX);
      for (const storedKey of Object.keys(entries)) {
        let identity;
        try {
          identity = JSON.parse(storedKey.slice(PREFIX.length));
        } catch {
          continue;
        }
        if (identity[0] === agentKey) await this.storage.set(storedKey, null);
      }
    });
  }
  async prune(snapshot) {
    if (snapshot?.status !== "ready") return;
    const removed = new Set((snapshot.agents || []).filter((agent) => agent.deleting).map((agent) => agent.key));
    for (const key of removed) await this.clear(key);
  }
};
function toolName(name) {
  return safeMessage(typeof name === "string" && name ? name : "a tool");
}
function finalReply(text, postedTexts) {
  if (postedTexts.size || typeof text !== "string" || !text.trim()) return void 0;
  return text;
}

// src/runtime.mjs
var MODELS = [
  { id: "default", label: "Muse default" },
  { id: "muse-wonder-1.0", label: "Muse Wonder" },
  { id: "muse-spark-1.3", label: "Muse Spark" },
  { id: "muse-ember-1.0", label: "Muse Ember" }
];
var modelLabel = (id) => MODELS.find((entry) => entry.id === id)?.label ?? "Muse default";
var defaults = () => ({
  model: "default",
  cwd: "~/.buzz/muse-subscription-workspace",
  permissionMode: "default",
  instructions: "",
  scope: "thread",
  adapter: ""
});
function configOf(config) {
  const value = { ...defaults(), ...config };
  for (const name of ["cwd", "adapter", "instructions"]) value[name] = String(value[name] ?? "").trim();
  value.model = MODELS.some((entry) => entry.id === value.model) ? value.model : "default";
  return value;
}
var configReady = (config) => Boolean(configOf(config).cwd);
async function saveSettings(save, draft) {
  const config = configOf(draft);
  if (!configReady(config)) throw new Error("Enter a working folder before saving.");
  await save(config);
}
var FALLBACK_INSTRUCTIONS = "Publication rule for this harness: your final nonempty message WILL be posted to the conversation as your reply; write it for that audience, and leave it empty for intentional silence on a non-mention wake.";
function createRuntime(ctx, source) {
  const kit = ctx.agents.harness;
  const store = new SessionStore(ctx.agents.storage);
  const lanes = new SessionLanes();
  const active = /* @__PURE__ */ new Set();
  const retiring = /* @__PURE__ */ new Map();
  let disposed = false;
  function cancel(operation, reason) {
    if (operation.controller.signal.aborted) return;
    operation.reason = reason;
    operation.controller.abort(reason === "deadline" ? new Error("Muse turn exceeded its run deadline, including time waiting for this conversation. Please try again.") : abortError());
  }
  async function perform(delivery, conversation, operation) {
    const signal = operation.controller.signal;
    const config = configOf(delivery.config);
    const key = sessionKey(delivery.agent, conversation);
    let prompt;
    let started = false;
    const current = () => {
      if (disposed || !delivery.current()) cancel(operation, "lifetime");
      signal.throwIfAborted();
    };
    try {
      current();
      if (!ctx.host.resolveDirectory) throw new Error("This harness requires Buzz desktop file access. Review the plugin host grants.");
      if (!config.cwd) throw new Error("Enter a working folder in this agent\u2019s Settings.");
      if (!["default", "acceptEdits"].includes(config.permissionMode)) throw new Error("Unsupported permissions setting. Select Default or Accept edits in this agent\u2019s Settings.");
      const cwd = await ctx.host.resolveDirectory(config.cwd, { create: config.cwd === defaults().cwd });
      current();
      const instructions = [config.instructions, FALLBACK_INSTRUCTIONS].filter(Boolean).join("\n\n");
      const systemPrompt = await kit.systemPrompt(delivery, { scope: config.scope, cwd, instructions, tools: false });
      current();
      const fingerprint = JSON.stringify([cwd, config.adapter, config.scope]);
      const previous = await store.get(key, fingerprint);
      current();
      prompt = await kit.turnPrompt(delivery, conversation, previous ? { cursor: previous.cursor } : {});
      current();
      await store.put(key, { id: previous?.id || "pending", cursor: prompt.cursor, fingerprint, inFlight: true, at: Date.now() });
      current();
      const postedTexts = /* @__PURE__ */ new Set();
      const output = new TurnOutput((tool) => delivery.step?.(tool));
      const code = await bridgeRequest(ctx.host, source, {
        action: "run",
        adapter: config.adapter || void 0,
        model: delivery.model?.trim() || config.model || void 0,
        prompt: prompt.text,
        systemPrompt,
        sessionId: previous?.id,
        resume: Boolean(previous),
        permissionMode: config.permissionMode,
        cwd
      }, { signal, onEvent: (event) => {
        if (event.type === "bridge_started") started = true;
        output.accept(event);
      } });
      current();
      const result = output.finish(code);
      if (!result.sessionId) throw new Error("Muse returned no session identity. The saved association has been cleared to prevent mixing conversations.");
      const answer = finalReply(result.text, postedTexts);
      if (answer) {
        current();
        await kit.reply(delivery.agent, conversation, answer);
      }
      if (result.denials.length) {
        current();
        await kit.reply(
          delivery.agent,
          conversation,
          `Muse permission denied: ${result.denials.join(", ")}. This headless harness cannot answer interactive approvals. Review the requested action and the agent's permission setting; no permission bypass is enabled.`,
          { notifyOwner: true }
        );
      } else if (!postedTexts.size && !result.text?.trim() && delivery.trigger.type === "mention") {
        throw new Error("Muse finished without a reply. Ask again with a specific request.");
      }
      current();
      await store.put(key, { id: result.sessionId, cursor: prompt.cursor, fingerprint, at: Date.now() });
    } catch (error) {
      if (!started) prompt?.restore();
      await store.remove(key);
      throw error;
    }
  }
  function run(delivery) {
    if (retiring.has(delivery.agent.key) || disposed) {
      delivery.ignored?.();
      return;
    }
    const operation = { controller: new AbortController(), agentKey: delivery.agent.key };
    active.add(operation);
    const abort = () => cancel(operation, delivery.current() ? "deadline" : "lifetime");
    delivery.signal.addEventListener("abort", abort, { once: true });
    if (delivery.signal.aborted) abort();
    let conversation;
    const done = (async () => {
      conversation = await kit.conversation(delivery, configOf(delivery.config).scope);
      if (!conversation) {
        delivery.ignored?.();
        return { ok: true };
      }
      delivery.acknowledged?.();
      delivery.interruptible?.(async () => {
        cancel(operation, "owner-stop");
        await operation.done;
      });
      await lanes.run(
        sessionKey(delivery.agent, conversation),
        operation.controller.signal,
        () => perform(delivery, conversation, operation)
      );
      return { ok: true };
    })().catch(async (error) => {
      if (operation.reason === "owner-stop") return { ok: true, stopped: true };
      if (operation.reason && operation.reason !== "deadline") {
        return { ok: false, error: operation.reason === "reset" ? "Saved conversations were reset." : "The agent is no longer active." };
      }
      const message = safeMessage(operation.reason === "deadline" ? operation.controller.signal.reason : error);
      if (conversation && !disposed && delivery.current()) {
        try {
          await kit.reply(delivery.agent, conversation, `Muse subscription: ${message}`, { notifyOwner: true });
        } catch (replyError) {
          return { ok: false, error: `${message} The error reply also failed: ${safeMessage(replyError)}` };
        }
      }
      return { ok: false, error: message };
    }).finally(() => {
      delivery.signal.removeEventListener("abort", abort);
      active.delete(operation);
    });
    operation.done = done;
    delivery.workingUntil(done);
  }
  function retire(key) {
    if (retiring.has(key)) return retiring.get(key);
    const done = Promise.resolve().then(async () => {
      const pending = [...active].filter((operation) => operation.agentKey === key);
      for (const operation of pending) cancel(operation, "reset");
      await Promise.all(pending.map((operation) => operation.done));
      await store.clear(key);
    }).finally(() => retiring.delete(key));
    retiring.set(key, done);
    return done;
  }
  return {
    run,
    retire,
    prune: (snapshot) => store.prune(snapshot),
    dispose() {
      disposed = true;
      for (const operation of active) cancel(operation, "lifetime");
    }
  };
}

// src/setup.mjs
function createSetup(host, source) {
  const listeners = /* @__PURE__ */ new Set();
  const controllers = /* @__PURE__ */ new Set();
  const pending = /* @__PURE__ */ new Map();
  const cache = /* @__PURE__ */ new Map();
  let epoch = 0;
  let checking;
  let disposed = false;
  let state = {
    revision: 0,
    status: void 0,
    error: "",
    connection: { readiness: "checking", attentionDescription: "Checking local Muse subscription setup\u2026" }
  };
  const update = (change) => {
    if (disposed) return;
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  };
  async function inspect(adapter = "") {
    adapter = adapter.trim();
    const generation = epoch;
    if (cache.has(adapter)) return cache.get(adapter);
    const existing = pending.get(adapter);
    if (existing) {
      if (existing.epoch === generation) {
        const answer2 = await existing.done;
        return generation === epoch ? answer2 : inspect(adapter);
      }
      await existing.done.catch(() => {
      });
      return inspect(adapter);
    }
    if (disposed) throw new Error("Muse setup is closed.");
    const controller = new AbortController();
    controllers.add(controller);
    const operation = { epoch: generation };
    operation.done = (async () => {
      let answer2;
      const code = await bridgeRequest(host, source, { action: "status", ...adapter ? { adapter } : {} }, {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "bridge_status") answer2 = event;
        }
      });
      if (code !== 0 || !answer2) throw new Error("The Muse bridge did not return installation status. Check Node.js 20+ and the muse-acp installation.");
      if (generation === epoch) cache.set(adapter, answer2);
      return answer2;
    })().finally(() => {
      controllers.delete(controller);
      if (pending.get(adapter) === operation) pending.delete(adapter);
    });
    pending.set(adapter, operation);
    const answer = await operation.done;
    return generation === epoch ? answer : inspect(adapter);
  }
  function describe(status) {
    if (!status?.adapter) return "Install Muse and the muse-acp adapter (npm install -g muse-acp) on this computer, then restart Buzz.";
    if (status.error) return status.error;
    if (!status.engineReady) return "muse-acp was found but its engine handshake did not answer. Confirm Muse is installed and signed in.";
    const adapterBit = `muse-acp${status.adapterVersion ? ` ${status.adapterVersion}` : ""}`;
    const museBit = status.muse ? `Muse${status.museVersion ? ` ${status.museVersion}` : ""}` : "Muse client not on PATH (the engine handshake answered, so the adapter found it)";
    return `${adapterBit} \xB7 ${museBit} \u2014 sign-in belongs to Muse itself (run \`muse login\` once in a terminal); this check spends no model request and does not remotely validate the subscription.`;
  }
  function check() {
    if (checking) return checking;
    update({ connection: { ...state.connection, readiness: "checking" } });
    checking = inspect().then((status) => {
      const error = status.error ? safeMessage(status.error) : "";
      const ready = Boolean(status.adapter && status.engineReady && !error);
      update({ status, error, revision: state.revision + 1, connection: {
        readiness: ready ? "ready" : "attention",
        attentionLabel: "Set up Muse",
        attentionDescription: error || describe(status)
      } });
    }, (error) => update({
      status: void 0,
      error: safeMessage(error),
      revision: state.revision + 1,
      connection: { readiness: "attention", attentionLabel: "Fix Muse setup", attentionDescription: safeMessage(error) }
    })).finally(() => {
      checking = void 0;
    });
    return checking;
  }
  async function refresh() {
    await checking;
    epoch++;
    cache.clear();
    await check();
  }
  return {
    inspect,
    check,
    refresh,
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort();
      listeners.clear();
    }
  };
}

// src/ui.jsx
function createUI(React, setup, runtime) {
  function Form({ children }) {
    return /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 16, minWidth: 0 } }, /* @__PURE__ */ React.createElement("style", null, `
        .bitsofjt-muse-control {
          box-sizing: border-box; min-width: 0; padding: 9px 11px;
          border: 1px solid color-mix(in srgb,currentColor 25%,transparent);
          border-radius: 9px; background: color-mix(in srgb,currentColor 5%,transparent);
          color: inherit; font: inherit;
        }
        :is(input,textarea,select).bitsofjt-muse-control { display: block; width: 100%; margin-top: 6px; }
        button.bitsofjt-muse-control { cursor: pointer; }
        .bitsofjt-muse-control:disabled { opacity: .5; cursor: not-allowed; }
        .bitsofjt-muse-control:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
        .bitsofjt-muse-copy { font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
      `), children);
  }
  const Button = (props) => /* @__PURE__ */ React.createElement("button", { className: "bitsofjt-muse-control", ...props });
  const Copy = (props) => /* @__PURE__ */ React.createElement("p", { className: "bitsofjt-muse-copy", ...props });
  function Connection() {
    const { connection, status, error } = React.useSyncExternalStore(setup.subscribe, setup.snapshot);
    const [message, setMessage] = React.useState("");
    React.useEffect(() => {
      void setup.check();
    }, []);
    async function recheck() {
      setMessage("");
      await setup.refresh();
      setMessage("Status refreshed. This check spends no model request; the subscription itself is verified on the first turn.");
    }
    return /* @__PURE__ */ React.createElement(Form, null, /* @__PURE__ */ React.createElement("section", { className: "ui-card", style: { padding: 16, display: "grid", gap: 12 } }, /* @__PURE__ */ React.createElement("h2", null, "Muse (subscription)"), /* @__PURE__ */ React.createElement(Copy, null, "Uses your Muse subscription through the genuine Muse client \u2014 not a pay-as-you-go Model API key, and not Buzz's built-in harnesses."), /* @__PURE__ */ React.createElement("dl", { style: { overflowWrap: "anywhere" } }, /* @__PURE__ */ React.createElement("dt", null, "muse-acp adapter"), /* @__PURE__ */ React.createElement("dd", null, status?.adapter || "Not detected"), /* @__PURE__ */ React.createElement("dt", null, "Adapter version"), /* @__PURE__ */ React.createElement("dd", null, status?.adapterVersion || "Not detected"), /* @__PURE__ */ React.createElement("dt", null, "Muse client"), /* @__PURE__ */ React.createElement("dd", null, status?.muse || "Not detected on PATH"), /* @__PURE__ */ React.createElement("dt", null, "Muse version"), /* @__PURE__ */ React.createElement("dd", null, status?.museVersion || "Not detected"), /* @__PURE__ */ React.createElement("dt", null, "Engine handshake"), /* @__PURE__ */ React.createElement("dd", null, status ? status.engineReady ? "Answered" : "Not answering" : "Unknown"), /* @__PURE__ */ React.createElement("dt", null, "Subscription sign-in"), /* @__PURE__ */ React.createElement("dd", null, "Managed by Muse itself \u2014 this plugin never sees or stores your credentials")), /* @__PURE__ */ React.createElement(Copy, { role: error ? "alert" : "status" }, error || connection.attentionDescription), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Button, { disabled: connection.readiness === "checking", onClick: () => void recheck() }, "Check status")), message && /* @__PURE__ */ React.createElement(Copy, { role: "status" }, message), /* @__PURE__ */ React.createElement(Copy, null, "Setup on the computer that runs the agent: install Node.js 20+, install Muse and sign in once with ", /* @__PURE__ */ React.createElement("code", null, "muse login"), " in a terminal, install the adapter with ", /* @__PURE__ */ React.createElement("code", null, "npm install -g muse-acp"), ", then restart Buzz so the desktop app picks up the new PATH entries."), /* @__PURE__ */ React.createElement(Copy, null, "Current limits of the adapter (muse-acp 0.1.x): Buzz's own MCP tools cannot be handed to the agent yet, so the agent replies with its final message instead of posting through Buzz tools; the model is chosen per agent in the agent settings and applied when the Muse engine host starts. Agent instructions are delivered as a preamble on the first turn of each new conversation."), /* @__PURE__ */ React.createElement(Copy, null, "Muse's tool permissions are not an OS sandbox. This trusted plugin, Muse and approved tools can access this account's files and network. No Buzz protection or permission bypass is enabled.")));
  }
  function Fields({ config, onChange, disabled, onAdapterBlur }) {
    const value = { ...defaults(), ...config };
    const field = (name, next) => onChange({ ...value, [name]: next });
    return /* @__PURE__ */ React.createElement(Form, null, /* @__PURE__ */ React.createElement("fieldset", { disabled, style: { display: "grid", gap: 16 } }, /* @__PURE__ */ React.createElement("label", null, "Model", /* @__PURE__ */ React.createElement("select", { className: "bitsofjt-muse-control", value: value.model, onChange: (event) => field("model", event.target.value) }, MODELS.map((entry) => /* @__PURE__ */ React.createElement("option", { key: entry.id, value: entry.id }, entry.label)))), /* @__PURE__ */ React.createElement(Copy, null, "Per agent, applying to turns run after the change; switching keeps the conversation. Muse default follows the Muse client's own model setting on the host \u2014 currently Wonder unless you changed it there. The named models pin this agent to that model instead."), /* @__PURE__ */ React.createElement("label", null, "Working folder", /* @__PURE__ */ React.createElement("input", { className: "bitsofjt-muse-control", value: value.cwd, onChange: (event) => field("cwd", event.target.value) })), /* @__PURE__ */ React.createElement(Copy, null, "Use an absolute path or ~/\u2026 on the system running Buzz. The default folder is created automatically; a custom folder must exist. This is a working directory, not filesystem containment."), /* @__PURE__ */ React.createElement("label", null, "muse-acp executable (optional)", /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "bitsofjt-muse-control",
        value: value.adapter,
        placeholder: "Auto-detect, or absolute path to muse-acp",
        onChange: (event) => field("adapter", event.target.value),
        onBlur: onAdapterBlur
      }
    )), /* @__PURE__ */ React.createElement("label", null, "Permissions", /* @__PURE__ */ React.createElement("select", { className: "bitsofjt-muse-control", value: value.permissionMode, onChange: (event) => field("permissionMode", event.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "default" }, "Default \u2014 deny actions that need interactive approval, and report them"), /* @__PURE__ */ React.createElement("option", { value: "acceptEdits" }, "Accept edits \u2014 automatically approve file edits only"))), /* @__PURE__ */ React.createElement(Copy, null, "This harness has no interactive approval prompt. In Default mode, tool actions that ask for permission are refused and reported to you. Accept edits approves file-edit requests only \u2014 never shell commands or other tools. Neither mode is an OS sandbox."), /* @__PURE__ */ React.createElement("label", null, "Conversation sessions", /* @__PURE__ */ React.createElement("select", { className: "bitsofjt-muse-control", value: value.scope, onChange: (event) => field("scope", event.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "thread" }, "One per thread (DMs and Solo chats stay whole)"), /* @__PURE__ */ React.createElement("option", { value: "channel" }, "One per channel"))), /* @__PURE__ */ React.createElement("label", null, "Agent instructions", /* @__PURE__ */ React.createElement(
      "textarea",
      {
        className: "bitsofjt-muse-control",
        value: value.instructions,
        rows: 6,
        onChange: (event) => field("instructions", event.target.value)
      }
    )), /* @__PURE__ */ React.createElement(Copy, null, "Never include credentials in agent instructions.")));
  }
  function Create(props) {
    const { revision, connection } = React.useSyncExternalStore(setup.subscribe, setup.snapshot);
    const [adapter, setAdapter] = React.useState(() => configOf(props.config).adapter);
    const [checked, setChecked] = React.useState();
    const [problem, setProblem] = React.useState("");
    React.useEffect(() => {
      let active = true;
      setChecked(void 0);
      setProblem("");
      void setup.inspect(adapter).then((value) => {
        if (!active) return;
        setChecked({ adapter, revision, ready: Boolean(value.adapter && value.engineReady && !value.error) });
        setProblem(value.error ? safeMessage(value.error) : "");
      }, (error) => {
        if (active) setProblem(safeMessage(error));
      });
      return () => {
        active = false;
      };
    }, [adapter, revision]);
    const ready = Boolean(checked?.ready && checked.adapter === configOf(props.config).adapter && checked.revision === revision && configReady(props.config));
    React.useEffect(() => {
      props.onReadyChange?.(ready);
    }, [ready, props.onReadyChange]);
    return /* @__PURE__ */ React.createElement(Form, null, props.harnessControl, /* @__PURE__ */ React.createElement("details", null, /* @__PURE__ */ React.createElement("summary", { className: "bitsofjt-muse-control" }, "Muse setup"), /* @__PURE__ */ React.createElement(Connection, null)), /* @__PURE__ */ React.createElement(Fields, { ...props, onAdapterBlur: () => setAdapter(configOf(props.config).adapter) }), /* @__PURE__ */ React.createElement(Copy, { role: problem ? "alert" : "status" }, problem || (ready ? "Muse setup is ready." : "Enter a working folder, then leave the adapter field to check it. Open Muse setup if anything is missing.")));
  }
  function Settings({ agent, save, settingsHost, settingsContent }) {
    const [draft, setDraft] = React.useState(() => configOf(agent.config));
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState("");
    const [confirmReset, setConfirmReset] = React.useState(false);
    async function commit() {
      setBusy(true);
      setMessage("");
      try {
        await saveSettings(save, draft);
        setMessage("Settings saved for future turns. Active turns continue; model, instruction and permission changes preserve conversations.");
      } catch (error) {
        setMessage(safeMessage(error));
      } finally {
        setBusy(false);
      }
    }
    async function reset() {
      setBusy(true);
      setMessage("");
      try {
        await runtime.retire(agent.key);
        setConfirmReset(false);
        setMessage("Saved conversation associations cleared. Muse transcript files are not deleted.");
      } catch (error) {
        setMessage(safeMessage(error));
      } finally {
        setBusy(false);
      }
    }
    return /* @__PURE__ */ React.createElement(Form, null, settingsContent, settingsHost?.typeControl?.(JSON.stringify(draft) !== JSON.stringify(configOf(agent.config))), /* @__PURE__ */ React.createElement(Fields, { config: draft, onChange: setDraft, disabled: busy }), /* @__PURE__ */ React.createElement(Button, { disabled: busy || !configReady(draft), onClick: () => void commit() }, "Save settings"), /* @__PURE__ */ React.createElement(Button, { disabled: busy, onClick: () => setConfirmReset(true) }, "Reset saved conversations\u2026"), confirmReset && /* @__PURE__ */ React.createElement("div", { role: "alert" }, /* @__PURE__ */ React.createElement(Copy, null, "Stop this agent's active turns and forget its session associations? New arrivals are ignored during reset. The next turn receives Buzz conversation history; previous tool actions are not undone."), /* @__PURE__ */ React.createElement(Button, { disabled: busy, onClick: () => void reset() }, "Confirm reset"), " ", /* @__PURE__ */ React.createElement(Button, { onClick: () => setConfirmReset(false) }, "Cancel")), message && /* @__PURE__ */ React.createElement(Copy, { role: "status" }, message));
  }
  return { Connection, Create, Settings };
}

// src/plugin.jsx
var inject = ["react", "agents", "settingsCards", "host"];
function apply(ctx) {
  if (!ctx.agents.harness || !ctx.agents.storage) {
    throw new Error("Muse subscription requires Buzz 1.0.2 with the external harness kit and agent storage.");
  }
  const runtime = createRuntime(ctx, native_bridge_default);
  const setup = createSetup(ctx.host, native_bridge_default);
  const { Connection, Create, Settings } = createUI(ctx.react, setup, runtime);
  ctx.settingsCards.register({
    id: "subscription",
    title: "Muse (subscription)",
    personal: true,
    component: Connection
  });
  ctx.agents.register({
    id: "muse-subscription",
    title: "Muse (subscription)",
    description: "Your Muse subscription through the genuine Muse client \u2014 no API key.",
    defaults: () => ({ config: defaults() }),
    summary: (agent) => `${modelLabel(configOf(agent.config).model)} \xB7 subscription`,
    CreateConfiguration: Create,
    tabs: [{ id: "settings", title: "Settings", role: "settings", component: Settings }],
    provider: {
      snapshot: () => setup.snapshot().connection,
      subscribe: setup.subscribe,
      check: setup.refresh,
      DialogBody: Connection
    },
    // muse-acp 0.1.x exposes no per-session model choice, so the model is an
    // agent setting: the bridge applies it when the engine host starts, and
    // it governs every turn that host serves. 'default' leaves the Muse
    // client's own configured model in charge.
    models: (agent) => ({
      current: configOf(agent.config).model,
      models: MODELS.map(({ id, label }) => ({ id, label, efforts: [] }))
    }),
    protectionUnavailable: "Standard Muse tool permissions only; this harness does not implement Buzz protection or OS sandboxing.",
    retire: runtime.retire,
    timeoutMs: 30 * 60 * 1e3,
    run: runtime.run
  });
  ctx.effect(() => {
    void setup.check();
    const prune = () => {
      void runtime.prune(ctx.agents.snapshot?.()).catch(() => {
      });
    };
    const unsubscribe = ctx.agents.subscribe?.(prune);
    prune();
    return () => {
      unsubscribe?.();
      runtime.dispose();
      setup.dispose();
    };
  });
}
export {
  apply,
  inject
};
