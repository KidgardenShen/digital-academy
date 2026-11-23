# 经典研读室源码盘点

核对项目 appgprj_6affb5532448819182fec07edbb6f28f 的已保存版本 20，提交 7180ce7dd1039d2fac7d6db19468cf7d32aa0703。源码在独立临时目录只读查阅。此工作区独立于云端仓库。

| 旧源码位置 | 核对结果及本地处理 |
| --- | --- |
| package.json、worker/index.ts | 旧站为 Vinext、React、Vite 与 Worker；托管清单的 D1 和 R2 均为空。本地阅读核心采用 JavaScript 模块和 Vite，保留 IndexedDB 持久化。部署平台待验收。 |
| app/page.tsx、app/editions/page.jsx | 首页先加载 classics.json，再挂载一系列全局脚本；版本页重定向至书架。重写空书架入口，页面从仓储读取版本。 |
| lib/edition-import/schema.json、public/edition-data.mjs | 直接复用 1.0.0 Schema。保留层次、引用、UTF-16 定位、版本键。重写共享校验器以报告字段路径，改用事务内冲突检查及新增写入。 |
| public/shelf-edition.mjs | 原适配器从 display_groups.entries 的 display_order 构建弹窗，可合并相邻锚点。新实现按锚点边界计算命中，按组去重，无需猜测合并。 |
| public/reader.js、public/relations.js | 保留原文点击、章导航、版本选择、分栏阅读。将原文和弹窗关联逻辑提取为可单测的阅读模型。 |
| public/classics.json、public/alignment.json、public/samples/ | 原有书目、对齐数据和注本样例全部排除。测试夹具使用人工合成字符。 |
| public/notes.js、public/assistant.js | 笔记、录制和助手在本次最小框架范围之外。 |

验收后的迁移对象是新站代码和规范。待确定本地个人书架或多人共享书架的生产需求，再决定托管和存储；独立预览验收后再切换入口。
