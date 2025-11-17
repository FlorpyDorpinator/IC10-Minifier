const vscode = require('vscode');
const path = require('path');

function escapeRegExp(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function splitQuotedSegments(line){
  const out=[]; let i=0; const n=line.length;
  while(i<n){
    if(line[i]==='"'){
      let j=i+1; let seg='"'; let esc=false;
      while(j<n){ const ch=line[j]; seg+=ch; j++; if(esc){esc=false; continue;} if(ch==='\\'){esc=true; continue;} if(ch==='"') break; }
      out.push({text:seg,quoted:true}); i=j; continue;
    }
    let j=i; let seg='';
    while(j<n && line[j]!=='"'){seg+=line[j++];}
    out.push({text:seg,quoted:false}); i=j;
  }
  return out;
}

function parseDefinesAliases(lines){
  const defines=new Map(); const aliases=new Map(); const keepLine=new Array(lines.length).fill(true);
  for(let idx=0; idx<lines.length; idx++){
    const line=lines[idx].trim();
    if(!line){ keepLine[idx]=false; continue; }
    let m=line.match(/^define\s+([A-Za-z_][\w$]*)\s+(.+)$/);
    if(m){
      const name=m[1]; const value=m[2].trim();
      if(/^(?:-?\d+(?:\.\d+)?|HASH\(\".*\"\)|\$[0-9A-Fa-f]+)$/.test(value)){
        defines.set(name,value); keepLine[idx]=false;
      }
      continue;
    }
    m=line.match(/^alias\s+([A-Za-z_][\w$]*)\s+(r(?:[0-9]|1[0-5]))$/);
    if(m){ aliases.set(m[1],m[2]); keepLine[idx]=false; continue; }
  }
  return {defines,aliases,keepLine};
}

function collectLabels(lines){
  const labels=new Map();
  for(let i=0;i<lines.length;i++){
    const t=lines[i].trim(); if(!t) continue; const m=t.match(/^([A-Za-z_][\w$]*):\s*$/); if(m) labels.set(m[1],i);
  }
  return labels;
}

function collectLabelRefs(lines,labelSet){
  const refs=new Set(); const branchOps=new Set(['j','jr','jal','beq','bne','blt','bgt','ble','bge','beqz','bnez','bltz','bgez','blez','bgtz','bdse','bdns','bap','bna','bapz','bnaz','beqal','bneal','bltzal','bgezal','blezal','bgtzal','bltal','bgtal','bleal','bgeal','beqzal','bnezal','bapzal','bnazal','bapal','bnaal','bdseal','bdnsal','breq','brne','brlt','brgt','brle','brge','breqz','brnez','brltz','brgez','brlez','brgtz','brdse','brdns','brap','brna','brapz','brnaz']);
  for(let idx=0; idx<lines.length; idx++){
    const raw=lines[idx]; const parts=splitQuotedSegments(raw);
    let code=parts.filter(p=>!p.quoted).map(p=>p.text).join(' ');
    code=code.replace(/#.*$/,'');
    const tokens=code.split(/\s+/).filter(Boolean); if(tokens.length===0) continue;
    if(/^[A-Za-z_][\w$]*:$/.test(tokens[0])) tokens.shift(); if(tokens.length===0) continue;
    const op=tokens[0]; if(!branchOps.has(op)) continue;
    const cand=tokens[tokens.length-1];
    if(cand && /^[A-Za-z_][\w$]*$/.test(cand) && labelSet.has(cand)) refs.add(cand);
  }
  return refs;
}

function applyReplacements(line,aliases,defines){
  const parts=splitQuotedSegments(line);
  for(const part of parts){
    if(part.quoted) continue;
    for(const [name,reg] of aliases){ const rx=new RegExp(`\\b${escapeRegExp(name)}\\b`,'g'); part.text=part.text.replace(rx,reg); }
    for(const [name,val] of defines){ const rx=new RegExp(`\\b${escapeRegExp(name)}\\b`,'g'); part.text=part.text.replace(rx,val); }
  }
  return parts.map(p=>p.text).join('');
}

function minifyContent(src, options){
  const cfg = options || {};
  const stripComments = cfg.stripComments !== false; // default true
  const origLines=src.split(/\r?\n/);
  const {defines,aliases,keepLine}=parseDefinesAliases(origLines);
  const labelMap=collectLabels(origLines); const labelSet=new Set(labelMap.keys());
  const labelRefs=collectLabelRefs(origLines,labelSet);
  const outLines=[];
  for(let i=0;i<origLines.length;i++){
    if(!keepLine[i]) continue;
    let line=origLines[i];
    const m=line.trim().match(/^([A-Za-z_][\w$]*):\s*$/);
    if(m){ const name=m[1]; if(!labelRefs.has(name)) continue; }
    if(!line.trim()) continue;
    let replaced=applyReplacements(line,aliases,defines).trimEnd();
    if(stripComments){
      const leadingTrim=replaced.trimStart();
      if(!leadingTrim.startsWith('HASH(')){
        const parts=splitQuotedSegments(replaced); let newText=''; let commentFound=false;
        for(const seg of parts){
          if(seg.quoted){ newText+=seg.text; continue; }
          if(commentFound) continue;
          const hashIdx=seg.text.indexOf('#');
          if(hashIdx>=0){ newText+=seg.text.slice(0,hashIdx); commentFound=true; continue; }
          newText+=seg.text;
        }
        replaced=newText.trimEnd();
      }
      if(/^\s*#/.test(replaced) && !/^\s*HASH\(/.test(replaced)) continue;
    }
    replaced = replaced.replace(/^\s+/, '');
    const segmentParts=splitQuotedSegments(replaced).map(p=> p.quoted ? p.text : p.text.replace(/\s{2,}/g,' ') );
    replaced=segmentParts.join('').replace(/\s+$/,'');
    if(replaced.trim().length===0) continue;
    outLines.push(replaced);
  }
  return outLines.join('\n');
}

function activate(context){
  const disposable = vscode.commands.registerCommand('ic10SafeMinifier.minify', async () => {
    const editor = vscode.window.activeTextEditor;
    if(!editor){ vscode.window.showErrorMessage('No active editor'); return; }
    const doc = editor.document;
    const text = doc.getText();
    const cfg = vscode.workspace.getConfiguration('ic10SafeMinifier');
    const outText = minifyContent(text, { stripComments: cfg.get('stripComments', true) });
    const fsPath = doc.uri.fsPath;
    const base = path.basename(fsPath);
    const ext = path.extname(base) || '.ic10';
    const nameNoExt = base.endsWith(ext) ? base.slice(0, -ext.length) : base;
    const outPath = path.join(path.dirname(fsPath), `${nameNoExt} MINIFIED${ext}`);
    try{
      await vscode.workspace.fs.writeFile(vscode.Uri.file(outPath), Buffer.from(outText, 'utf8'));
      vscode.window.showInformationMessage('IC10 minified → ' + path.basename(outPath));
      const newDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(outPath));
      await vscode.window.showTextDocument(newDoc, { preview: false });
    }catch(err){
      vscode.window.showErrorMessage('Minify failed: ' + (err && err.message ? err.message : String(err)));
    }
  });
  context.subscriptions.push(disposable);

  const previewCmd = vscode.commands.registerCommand('ic10SafeMinifier.preview', async () => {
    const editor = vscode.window.activeTextEditor;
    if(!editor){ vscode.window.showErrorMessage('No active editor'); return; }
    const doc = editor.document;
    const text = doc.getText();
    const cfg = vscode.workspace.getConfiguration('ic10SafeMinifier');
    const outText = minifyContent(text, { stripComments: cfg.get('stripComments', true) });
    // Build an untitled URI that controls the tab title, e.g., "<name> Temp minified file.ic10"
  const fsPath = doc.uri.fsPath || 'untitled.ic10';
  const base = path.basename(fsPath);
  const ext = path.extname(base) || '.ic10';
  const nameNoExt = base.endsWith(ext) ? base.slice(0, -ext.length) : base;
  const tempName = `${nameNoExt} TEMP MINIFIED${ext}`;
    const untitledUri = vscode.Uri.from({ scheme: 'untitled', path: `/${tempName}` });

    // Create an untitled document with the desired name, then fill it with the minified content
    const previewDoc = await vscode.workspace.openTextDocument(untitledUri);
    const shown = await vscode.window.showTextDocument(previewDoc, { preview: true });
    await shown.edit(edit => {
      edit.insert(new vscode.Position(0, 0), outText);
    });
    // Try to preserve the language of the source file for better syntax highlighting
    try { await vscode.languages.setTextDocumentLanguage(previewDoc, doc.languageId || 'plaintext'); } catch {}
  });
  context.subscriptions.push(previewCmd);
}

function deactivate(){}

module.exports = { activate, deactivate };
