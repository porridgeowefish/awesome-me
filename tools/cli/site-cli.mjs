#!/usr/bin/env node
import { tsImport } from 'tsx/esm/api';
const {runCli}=await tsImport('./main.ts',import.meta.url);
try { const result=await runCli(); process.stdout.write(JSON.stringify(result,null,2)+'\n'); }
catch(error) { process.stderr.write(JSON.stringify({error:{code:error.code??'CLI_ERROR',message:error.message}},null,2)+'\n'); process.exitCode=1; }
