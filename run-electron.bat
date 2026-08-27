@echo off
set ELECTRON_RUN_AS_NODE=
cd /d %~dp0
node node_modules\electron\cli.js electron\main.cjs %*