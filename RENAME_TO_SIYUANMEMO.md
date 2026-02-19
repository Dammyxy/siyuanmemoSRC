# 插件改名总结：FSRS → SiyuanMemo

## 改名完成清单

### ✅ 已完成的修改

1. **配置文件**
   - `plugin.json`: name, url, displayName, description, keywords
   - `package.json`: name, description

2. **代码标识符**
   - 全局变量: `siyuanFsrsPlugin` → `siyuanMemoPlugin`
   - 图标ID: `iconFSRS` → `iconSiyuanMemo`
   - Tab类型: `plugin-fsrs-*` → `plugin-siyuanmemo-*`
   - Dock类型: `fsrs-dock` → `siyuanmemo-dock`
   - 日志前缀: `[FSRS]` → `[SiyuanMemo]`
   - 日志控制: `toggleFSRSLogs` → `toggleSiyuanMemoLogs`
   - 环境变量: `FSRS_DISABLE_LOGS` → `SIYUANMEMO_DISABLE_LOGS`

3. **CSS 类名**
   - `.fsrs-*` → `.siyuanmemo-*`
   - `.plugin-fsrs-*` → `.plugin-siyuanmemo-*`

4. **UI 文本**
   - 菜单标签: `FSRS` → `SiyuanMemo`
   - Dock 标题: `FSRS` → `SiyuanMemo`

## 数据存储路径变化

### ⚠️ 重要提示

改名后，插件的数据存储路径会发生变化：

- **旧路径**: `/data/storage/petal/siyuan-plugin-fsrs/`
- **新路径**: `/data/storage/petal/siyuan-plugin-siyuanmemo/`

由于你是唯一用户且使用测试数据，旧数据将不会自动迁移。

### 清理旧数据（可选）

如果需要清理旧数据，可以手动删除：
```
<思源笔记工作空间>/data/storage/petal/siyuan-plugin-fsrs/
```

## Git 仓库处理

### 重命名文件夹

使用提供的 `rename-folder.ps1` 脚本：

```powershell
.\rename-folder.ps1
```

这个脚本会：
1. 检查是否有未提交的更改
2. 重命名文件夹（保留 .git 目录）
3. 提示你更新远程仓库

### Git 历史保留

✅ **好消息**：重命名文件夹不会影响 Git 历史！

- `.git` 目录会随文件夹一起移动
- 所有提交历史、分支、标签都会保留
- 本地仓库完全正常工作

### 更新远程仓库

如果你有 GitHub 远程仓库，需要：

**方案 A：重命名 GitHub 仓库（推荐）**
1. 在 GitHub 上进入仓库
2. Settings → Repository name
3. 改为 `siyuan-plugin-siyuanmemo`
4. 更新本地远程 URL：
   ```bash
   cd siyuan-plugin-siyuanmemo
   git remote set-url origin https://github.com/你的用户名/siyuan-plugin-siyuanmemo.git
   git push
   ```

**方案 B：创建新仓库**
1. 在 GitHub 创建新仓库 `siyuan-plugin-siyuanmemo`
2. 更新远程 URL：
   ```bash
   cd siyuan-plugin-siyuanmemo
   git remote set-url origin https://github.com/你的用户名/siyuan-plugin-siyuanmemo.git
   git push -u origin main
   ```

**方案 C：保持旧仓库名**
- 如果不想改 GitHub 仓库名，也可以保持不变
- 只是仓库名和本地文件夹名不一致而已

## 使用新插件

### 1. 重命名文件夹
```powershell
.\rename-folder.ps1
```

### 2. 进入新文件夹
```bash
cd siyuan-plugin-siyuanmemo
```

### 3. 构建插件
```bash
npm run build
```

### 4. 在思源笔记中
- 卸载旧插件 `siyuan-plugin-fsrs`
- 安装新插件（从 `dist` 目录）

### 5. 重启思源笔记
重启后新插件将以 `SiyuanMemo` 的名称出现

## 注意事项

1. **提交更改**: 重命名前建议先提交所有更改
   ```bash
   cd siyuan-plugin-fsrs
   git add .
   git commit -m "Rename plugin to SiyuanMemo"
   ```

2. **README 文件**: 记得更新 README.md 和 README_zh_CN.md 中的项目名称

3. **文档**: 更新所有文档中的项目名称引用

4. **测试**: 重新运行测试确保改名没有破坏功能

## 验证清单

- [ ] 文件夹已重命名
- [ ] Git 仓库正常工作
- [ ] 远程仓库已更新（如果需要）
- [ ] 插件能正常加载
- [ ] 顶栏图标显示正常
- [ ] 块菜单显示 "SiyuanMemo" 而不是 "FSRS"
- [ ] 数据能正常保存和读取
- [ ] 所有功能正常工作
- [ ] 日志前缀显示为 `[SiyuanMemo]`

## 常见问题

### Q: 重命名后 Git 历史会丢失吗？
A: 不会。`.git` 目录会随文件夹一起移动，所有历史都保留。

### Q: 需要重新 clone 仓库吗？
A: 不需要。直接重命名文件夹即可。

### Q: 远程仓库必须改名吗？
A: 不是必须的，但建议保持一致。如果不改，只是名字不匹配而已。

### Q: 如何验证 Git 是否正常？
A: 进入新文件夹后运行：
```bash
git status
git log --oneline -5
git remote -v
```
