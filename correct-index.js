"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const siyuan_1 = require("siyuan");
const index_cjs_1 = require("./index.cjs");

class FSRSPlugin extends siyuan_1.Plugin {
    onload() {
        // 插件加载逻辑
        console.log('FSRS Plugin loaded');
    }
    
    onunload() {
        // 插件卸载逻辑
        console.log('FSRS Plugin unloaded');
    }
}

exports.default = FSRSPlugin;