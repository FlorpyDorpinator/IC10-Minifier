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
    let m=line.match(/^define\s+([A-Za-z_][\w$]*)\s+(.+?)(?:\s*#.*)?$/);
    if(m){
      const name=m[1]; const value=m[2].trim();
      if(/^(?:-?\d+(?:\.\d+)?|HASH\(\".*\"\)|\$[0-9A-Fa-f]+)$/.test(value)){
        defines.set(name,value); keepLine[idx]=false;
      }
      continue;
    }
    m=line.match(/^alias\s+([A-Za-z_][\w$]*)\s+(r(?:[0-9]|1[0-5]))(?:\s|#|$)/);
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
  // A label name is a line-number constant in IC10 and can appear as an operand of
  // ANY instruction (e.g. `move coolingState waitForHot`), not just branch ops.
  // Treat every operand token that matches a known label name as a reference.
  const refs=new Set();
  for(let idx=0; idx<lines.length; idx++){
    const raw=lines[idx]; const parts=splitQuotedSegments(raw);
    let code=parts.filter(p=>!p.quoted).map(p=>p.text).join(' ');
    code=code.replace(/#.*$/,'');
    const tokens=code.split(/\s+/).filter(Boolean); if(tokens.length===0) continue;
    // Skip a leading label-definition token (e.g. "loop:") and the opcode itself.
    let start=0;
    if(/^[A-Za-z_][\w$]*:$/.test(tokens[0])) start=1;
    for(let t=start+1; t<tokens.length; t++){
      const tok=tokens[t];
      if(/^[A-Za-z_][\w$]*$/.test(tok) && labelSet.has(tok)) refs.add(tok);
    }
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
      // Always strip inline comments, even on lines with HASH() or STR()
      const parts=splitQuotedSegments(replaced); let newText=''; let commentFound=false;
      for(const seg of parts){
        if(seg.quoted){ newText+=seg.text; continue; }
        if(commentFound) continue;
        const hashIdx=seg.text.indexOf('#');
        if(hashIdx>=0){ newText+=seg.text.slice(0,hashIdx); commentFound=true; continue; }
        newText+=seg.text;
      }
      replaced=newText.trimEnd();
      // Check if line contains actual HASH() or similar function calls with quotes
      const hasHashFunction=/\b(?:HASH|STR)\s*\(/.test(replaced);
      // Remove comment-only lines (starting with #) unless they contain HASH(
      if(/^\s*#/.test(replaced) && !hasHashFunction) continue;
    }
    replaced = replaced.replace(/^\s+/, '');
    const segmentParts=splitQuotedSegments(replaced).map(p=> p.quoted ? p.text : p.text.replace(/\s{2,}/g,' ') );
    replaced=segmentParts.join('').replace(/\s+$/,'');
    // Skip lines that are just quoted strings (comments disguised as strings)
    if(/^"[^"]*"$/.test(replaced.trim())) continue;
    if(replaced.trim().length===0) continue;
    outLines.push(replaced);
  }
  return outLines.join('\n');
}

function convertLabelsToLineNumbers(src){
  const origLines=src.split(/\r?\n/);
  
  // First pass: identify label definitions and build original label map
  const labelDefinitionLines=new Set();
  const labelOriginalLineMap=new Map(); // label name -> original line index
  for(let i=0; i<origLines.length; i++){
    const t=origLines[i].trim();
    if(!t) continue;
    const m=t.match(/^([A-Za-z_][\w$]*):\s*$/);
    if(m){ 
      labelDefinitionLines.add(i);
      labelOriginalLineMap.set(m[1], i); 
    }
  }
  
  // Second pass: build output line mapping (original line index -> output line index)
  const originalToOutputLineMap=new Map();
  let outputLineNum=0;
  for(let i=0; i<origLines.length; i++){
    if(labelDefinitionLines.has(i)){
      // Label definition line will be removed, but any label on next line gets this position
      continue;
    }
    originalToOutputLineMap.set(i, outputLineNum);
    outputLineNum++;
  }
  
  // Build final label map: label name -> output line number (IC10 0-based)
  const labelFinalLineMap=new Map();
  for(const [labelName, origLine] of labelOriginalLineMap.entries()){
    // Find the next non-label line after this label definition
    let targetLine=origLine+1;
    while(targetLine<origLines.length && labelDefinitionLines.has(targetLine)){
      targetLine++;
    }
    if(targetLine<origLines.length && originalToOutputLineMap.has(targetLine)){
      labelFinalLineMap.set(labelName, originalToOutputLineMap.get(targetLine));
    }
  }
  
  // Third pass: build output, replacing label references.
  // Labels are line-number constants and can appear as operands of ANY instruction
  // (e.g. `move coolingState waitForHot`), not just branch ops.
  const outLines=[];
  for(let i=0; i<origLines.length; i++){
    let line=origLines[i];

    // Skip label definition lines
    if(labelDefinitionLines.has(i)) continue;

    // Replace label references with line numbers
    const parts=splitQuotedSegments(line);
    for(const part of parts){
      if(part.quoted) continue;

      // Split into tokens, skipping any leading label-definition token and the opcode.
      let code=part.text.replace(/#.*$/,''); // Remove comments for parsing
      const tokens=code.split(/\s+/).filter(Boolean);
      if(tokens.length===0) continue;
      let opIdx=0;
      if(/^[A-Za-z_][\w$]*:$/.test(tokens[0])) opIdx=1;

      for(let t=opIdx+1; t<tokens.length; t++){
        const tok=tokens[t];
        if(/^[A-Za-z_][\w$]*$/.test(tok) && labelFinalLineMap.has(tok)){
          const ic10LineNum=labelFinalLineMap.get(tok);
          part.text=part.text.replace(new RegExp(`\\b${escapeRegExp(tok)}\\b`,'g'), String(ic10LineNum));
        }
      }
    }

    line=parts.map(p=>p.text).join('');
    outLines.push(line);
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
      // Replace all content instead of inserting
      const fullRange = new vscode.Range(
        previewDoc.positionAt(0),
        previewDoc.positionAt(previewDoc.getText().length)
      );
      edit.replace(fullRange, outText);
    });
    // Try to preserve the language of the source file for better syntax highlighting
    try { await vscode.languages.setTextDocumentLanguage(previewDoc, doc.languageId || 'plaintext'); } catch {}
  });
  context.subscriptions.push(previewCmd);

  const convertLabelsCmd = vscode.commands.registerCommand('ic10SafeMinifier.convertLabels', async () => {
    const editor = vscode.window.activeTextEditor;
    if(!editor){ vscode.window.showErrorMessage('No active editor'); return; }
    const doc = editor.document;
    const text = doc.getText();
    const outText = convertLabelsToLineNumbers(text);
    const fsPath = doc.uri.fsPath;
    const base = path.basename(fsPath);
    const ext = path.extname(base) || '.ic10';
    const nameNoExt = base.endsWith(ext) ? base.slice(0, -ext.length) : base;
    const outPath = path.join(path.dirname(fsPath), `${nameNoExt} ABSOLUTE${ext}`);
    try{
      await vscode.workspace.fs.writeFile(vscode.Uri.file(outPath), Buffer.from(outText, 'utf8'));
      vscode.window.showInformationMessage('IC10 labels converted to line numbers → ' + path.basename(outPath));
      const newDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(outPath));
      await vscode.window.showTextDocument(newDoc, { preview: false });
    }catch(err){
      vscode.window.showErrorMessage('Label conversion failed: ' + (err && err.message ? err.message : String(err)));
    }
  });
  context.subscriptions.push(convertLabelsCmd);
}

function deactivate(){}

module.exports = { activate, deactivate };
