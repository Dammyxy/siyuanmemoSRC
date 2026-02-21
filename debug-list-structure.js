/**
 * 调试脚本：查看列表项的结构
 * 
 * 使用方法：
 * 1. 在思源笔记中打开开发者工具（F12）
 * 2. 复制这个脚本到控制台
 * 3. 将 BLOCK_ID 替换为你要检查的块 ID
 * 4. 运行脚本
 */

const BLOCK_ID = '20260221133949-007ew46'; // 你创建的列表项块

async function debugListStructure(blockId) {
    console.log('=== 开始调试列表结构 ===');
    console.log('Block ID:', blockId);
    
    // 1. 获取块信息
    const blockInfo = await fetch('/api/query/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            stmt: `SELECT id, type, subtype, parent_id, content FROM blocks WHERE id = '${blockId}'`
        })
    }).then(r => r.json());
    
    console.log('\n1. 当前块信息:');
    console.table(blockInfo.data);
    
    if (!blockInfo.data || blockInfo.data.length === 0) {
        console.error('块不存在！');
        return;
    }
    
    const block = blockInfo.data[0];
    
    // 2. 获取父块信息
    if (block.parent_id) {
        const parentInfo = await fetch('/api/query/sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stmt: `SELECT id, type, subtype, parent_id, content FROM blocks WHERE id = '${block.parent_id}'`
            })
        }).then(r => r.json());
        
        console.log('\n2. 父块信息:');
        console.table(parentInfo.data);
        
        // 3. 如果父块是列表容器，获取祖父块
        if (parentInfo.data && parentInfo.data.length > 0 && parentInfo.data[0].type === 'l') {
            const grandParentId = parentInfo.data[0].parent_id;
            const grandParentInfo = await fetch('/api/query/sql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stmt: `SELECT id, type, subtype, parent_id, content FROM blocks WHERE id = '${grandParentId}'`
                })
            }).then(r => r.json());
            
            console.log('\n3. 祖父块信息（父列表项）:');
            console.table(grandParentInfo.data);
            
            // 4. 获取祖父块的所有子列表项
            if (grandParentInfo.data && grandParentInfo.data.length > 0) {
                const listContainerId = block.parent_id;
                const siblingsInfo = await fetch('/api/query/sql', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        stmt: `SELECT id, type, subtype, content FROM blocks WHERE parent_id = '${listContainerId}' AND type = 'i' ORDER BY id`
                    })
                }).then(r => r.json());
                
                console.log('\n4. 所有兄弟列表项:');
                console.table(siblingsInfo.data);
            }
        }
    }
    
    // 5. 获取子块
    const childrenInfo = await fetch('/api/query/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            stmt: `SELECT id, type, subtype, content FROM blocks WHERE parent_id = '${blockId}' ORDER BY id`
        })
    }).then(r => r.json());
    
    console.log('\n5. 子块信息:');
    console.table(childrenInfo.data);
    
    // 6. 检查是否为列表项的子项
    if (block.type === 'i' && block.parent_id) {
        const parentType = await fetch('/api/query/sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stmt: `SELECT type FROM blocks WHERE id = '${block.parent_id}'`
            })
        }).then(r => r.json());
        
        if (parentType.data && parentType.data[0].type === 'l') {
            console.log('\n✅ 这是一个子列表项（父块是列表容器）');
            console.log('应该被 isListTemplateChild 检测到并跳过创建');
        } else {
            console.log('\n❌ 这不是子列表项（父块不是列表容器）');
        }
    }
    
    console.log('\n=== 调试完成 ===');
}

// 运行调试
debugListStructure(BLOCK_ID);
