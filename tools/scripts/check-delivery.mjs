import fs from 'node:fs';
import path from 'node:path';
if(fs.existsSync('.env.server'))process.loadEnvFile('.env.server');
const root=path.resolve('public/.build');
if(!fs.existsSync(path.join(root,'index.html')))throw new Error('Build the website first');
if(fs.existsSync(path.join(root,'content')))throw new Error('Legacy/private content must not be copied into dist');
const forbidden=['AMAP_SERVICE_KEY','AMAP_SECURITY_CODE'].map(name=>process.env[name]).filter(value=>value&&value.length>8);
let checked=0;
function scan(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Unexpected build symlink');if(entry.isDirectory())scan(target);else if(/\.(js|css|html|json|map)$/.test(entry.name)){const source=fs.readFileSync(target,'utf8');if(forbidden.some(value=>source.includes(value)))throw new Error('A server credential appears in the client build');checked++;}}}
scan(root);console.log(JSON.stringify({clientFilesChecked:checked,serverSecretsFound:0,legacyContentCopied:false}));
