#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const skillRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(skillRoot,'project-path.txt');
const project=process.env.SITE_PROJECT_DIR??(fs.existsSync(file)?fs.readFileSync(file,'utf8').trim():path.resolve(skillRoot,'../../..'));
const entry=path.join(project,'tools/cli/site-cli.mjs');
if(!fs.existsSync(entry)){process.stderr.write(JSON.stringify({error:{code:'PROJECT_NOT_FOUND',message:'Set SITE_PROJECT_DIR to the installed personal website project.'}})+'\n');process.exitCode=1;}
else {const child=spawn(process.execPath,[entry,...process.argv.slice(2)],{cwd:project,stdio:'inherit',env:process.env,windowsHide:true});child.on('exit',code=>{process.exitCode=code??1;});child.on('error',()=>{process.stderr.write('CLI could not start.\n');process.exitCode=1;});}
