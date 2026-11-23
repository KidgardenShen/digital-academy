# 经典研读室项目约定

适用范围为本工作区。改动网站前先阅读 standards/READING_RULES.md 和 docs/SOURCE_AUDIT.md。涉及数据接口时，另按下述约定读取数据契约及标注规则。

## 经典数据标准

经典数据的数据契约、JSON Schema、语义校验规则和注本制作流程由 [jingzhu-duidu](https://github.com/KidgardenShen/jingzhu-duidu) 统一维护。Codex 修改导入、校验或经注呈现前，须阅读所用版本的 Schema、语义校验器、数据导入规范和经注关联规范。软件根据 `target_refs` 解释学术关系，根据 `display_groups` 实现阅读入口。导入前执行结构和语义校验。

兼容现有 `1.0.0` 和 `1.1.0` 注本的上游版本发布后，在 `standards/jingzhu-duidu/` 接入 Git 子模块并固定到该发布对应的提交。升级时更新所固定的提交，并验证网站和命令行对合成样例的校验结果一致。接入完成前使用现有本地 Schema 与共享 JavaScript 校验器，契约改动在标准仓库维护。公开软件仓库的子模块需要单独取得私有标准仓库的读取权限。

过渡期间，`standards/DATA_CONTRACT.md`、`standards/ANNOTATION_RULES.md` 和 `standards/edition.schema.json` 是当前软件实际使用的兼容副本。上游接入时，检查构建、浏览器导入和命令行的标准入口均使用同一个固定版本，再移除重复副本。

`schema_version` 标识 JSON 格式及其校验规则。破坏格式兼容性的变更须使用新的 `schema_version`。`data_version` 标识单个注本的内容修订。补译、校字等内容改动再次入架时，使用新的 `data_version`。书架按 `[work.work_id, edition.edition_id, data_version]` 保存修订。

## 软件开发与验收

数字书院维护导入器、数据库、API、阅读器和软件回归测试。
本机整理的注本及校核报告放在 `editions/`，标准发行 ZIP 由标准仓库管理。这两类文件均不随软件提交。
导入在一次事务内直接入架，修订独立保存。测试数据仅放在 standards/fixtures/ 或 tests/，正式书架初始为空。发布及旧站切换另行安排。
提交前执行 `pnpm build`，其中包括导入、存储和阅读规则的回归测试。
新制及重制注本交付时逐章核对今译，并运行 `node scripts/validate.mjs --for-delivery <文件路径>`。
