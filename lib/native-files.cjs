'use strict';
const fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const pending=new Set();
// Linux: file copies are offered to other apps as a text/uri-list via wl-copy.
function copyFiles({files,text='',marker=''}){
 if(!Array.isArray(files)||!files.length||files.length>1000||files.some(file=>typeof file!=='string'||!path.isAbsolute(file)||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))return Promise.reject(new Error('A copied file is unavailable.'));
 if(typeof text!=='string'||text.length>1024*1024||typeof marker!=='string'||marker.length>100) return Promise.reject(new Error('Invalid file clipboard payload.'));
 const list=files.map(file=>pathToFileURL(file).href).join('\r\n')+'\r\n';
 return new Promise((resolve,reject)=>{
  const child=execFile('wl-copy',['--type','text/uri-list'],{timeout:12000},(error,stdout,stderr)=>{
   pending.delete(child);
   if(error)return reject(new Error('wl-copy could not copy these files: '+String(stderr||error.message).slice(0,200)));
   resolve({ok:true});
  });pending.add(child);child.stdin.on('error',()=>{});child.stdin.end(list);
 });
}
function cancelFileCopies(){for(const child of pending)child.kill();pending.clear();}
module.exports={copyFiles,cancelFileCopies};
