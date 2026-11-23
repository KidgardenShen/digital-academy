# 一坐两忘 · 经典研读室

本地独立阅读站。初始书架为空，导入一个注本 JSON 即可阅读。每个注本修订独立保存。在「主读注本」切换版本，在「同章对读」增选可对齐的版本。悬停或轻触原文下方的彩线，可查看对应注本在该处的注文；「本章注疏」按注家与注本连续呈现全章注文。

## 本机运行

本项目已使用 Node.js 24 和 pnpm 11 验证。在项目根目录运行以下命令，浏览器打开终端显示的本机地址。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

书架使用当前浏览器的 IndexedDB。不同浏览器配置、地址或端口各自保存书架。原始 JSON 请自行留存，以便在其他书架重新导入。

## 校验及构建

v1.1 制作包的入口为[通用编辑流程](.agents/skills/jingzhu-duidu/SKILL.md)、[书目任务示例](docs/TASK_EXAMPLES.md)和[版本测试说明](docs/V1.1_TESTS.md)。发行 ZIP 另附可用 Node.js 直接运行的离线校验器。

```sh
node scripts/validate.mjs "你的注本.json"
node scripts/validate.mjs --for-delivery "新制或重制的注本.json"
pnpm test
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4174 --strictPort
```

命令行遇到错误会给出文件及字段位置，返回非零退出码。网站执行相同的文件校验，再在单次事务内检查已有书架并保存。构建产物位于 dist/。测试目录中的合成材料仅用于验收。

## 规则与源码

软件由 [digital-academy](https://github.com/KidgardenShen/digital-academy) 管理，数据标准和注本制作流程由 [jingzhu-duidu](https://github.com/KidgardenShen/jingzhu-duidu) 维护。本地构建当前使用工作区内兼容 `1.0.0` 和 `1.1.0` 的标准副本。上游发布兼容版本后，按 [AGENTS.md](AGENTS.md) 固定子模块提交并复测校验结果。

- [网站呈现规则](standards/READING_RULES.md)
- [JSON 数据契约](standards/DATA_CONTRACT.md) 与 [JSON Schema](standards/edition.schema.json)
- [注疏标注与显示](standards/ANNOTATION_RULES.md)
- [旧站源码盘点与迁移范围](docs/SOURCE_AUDIT.md)
- [制作用 Skill](.agents/skills/jingzhu-duidu/SKILL.md) 与 [完整合成样例](standards/fixtures/edition.json)

src/validate.mjs 负责文件校验，src/storage.mjs 负责上架与版本冲突，src/reader.mjs 负责章节、对齐和点击命中，src/app.mjs 连接页面操作。
