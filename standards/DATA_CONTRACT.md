# 经典注疏 JSON 数据契约 1.1.0（网站兼容摘要）

规范原件由 jingzhu-duidu 维护，见其 `docs/一坐两忘_经典数据导入规范_v1.1.md`。本目录的 Schema 与合成样例为上游发布前的同步副本。`pnpm test:parity` 检查副本内容及两个校验器的普通、交付结果。

一份 UTF-8 JSON 保存一个注疏版本的一次修订，可独立导入空书架。网站、制作者和命令行使用同一份 [JSON Schema](edition.schema.json) 与[语义校验器](../src/validate.mjs)。Schema 定义字段、类型、必填项和枚举值。本契约定义跨字段含义与导入行为。文献整理的方法见[编辑工作流程](../.agents/skills/jingzhu-duidu/SKILL.md)。

## 版本与导入

| 项目 | 约定 |
| --- | --- |
| `schema_version` | 接受 `1.0.0` 和 `1.1.0`。旧格式维持原字段（包括可有可无的译文单元）。1.1.0 增加必填顶层数组 `ai_translations`。空数组可导入并用于编辑中的材料。 |
| `data_version` | 注本修订号。书架键为 `[work.work_id, edition.edition_id, data_version]`。补译、改译、修改底本或复核资料后再次上架，须使用新的修订号。 |
| 写入 | 通过结构及语义校验后，在同一事务中检查冲突并入架。同键同内容复用已有记录。对象字段次序无关，数组次序有意义。同键异内容、同一经典标识异书名均报错。修订独立保存。 |

## 文献数据

| 字段 | 语义 |
| --- | --- |
| `work`、`edition` | 标识经典及本次整理的注本，注明责任者、所用章法与实际收录范围。 |
| `sources`、`layers` | 登记文献出处、卷页定位及经、注、疏等层次；层间承接关系须能解析，且无循环。 |
| `structure.sections`、`text_units` | 按底本记录父子层级和章序，同章依 `sequence` 排列，同序保持文件次序。无章号的篇首使用 `section_id: null`。数据须有可阅读原文。 |
| `annotations`、`display_groups` | 注文及其直接解释对象独立于原文入口、章级入口及弹窗次序。定位和排序见[标注规则](ANNOTATION_RULES.md)。 |
| `validation`、`annotations[].review` | 前者记录版本的校核情况，后者记录单条注文的核校情况。两者均独立于 AI 今译的人工复核。 |

同一经典可有不同底本、节选和章法。对读须同章标识及原文单元标识、次序和文字完全一致。保留底本的字形、标点和换行。

## 章节级 AI 今译

`ai_translations` 专用于帮助读者读懂本章的现代汉语译文。每章至多一条，可用换行分段。每条均归属于本文件所载的注本、底本和修订。

| 字段 | 约定 |
| --- | --- |
| `section_id` | 指向本版章节。篇首经文使用 `null`。仅含题名或原序等非经文单元时无须生成。 |
| `source_units[]` | 按底本顺序列出本章全部非空 `classic_text` 单元，每项含 `text_id` 和逐字相同的 `source_text` 快照。错章、跳段、重录、次序错误及文字变动均报错。可由单元追溯其 `source_id` 和卷页。 |
| `text` | 逐段覆盖原文的连贯白话。材料自带的现代译文仍可保存在有出处的 `translation` 文献层；另行生成的 AI 今译只写入本数组。 |
| `generator` | `provider` 记录实际生成服务，`model` 记录可确认的模型名，模型未披露时填 `null`。 |
| `generation_status` | `draft` 表示已写出译文草稿，`generated` 表示生成完毕。 |
| `human_review` | 待人工复核为 `{"status":"pending","reviewer":null}`。人工核对之后填 `reviewed` 或 `needs_revision`，并填写实际复核人。生成完毕、机器校验通过都不能充当人工复核。 |

AI 记录不分配用于锚点的文献文字或注文 ID。原典、历史注疏、所附译文及显示组各自保持原有含义。修改原文时须重新核对今译与引用快照。修改译文后重置人工复核，直至复核者再次确认。校验程序可核对引用和状态，译意及署名真实性须另行核实。

## 制作与兼容

- 直接导入旧文件无须迁移。旧文件中的“本次整理今译”不能据此推断为 AI 所作。
- 新制或重制使用 1.1.0。由旧数据另存新修订，保存原有文献记录，新增独立今译；若经核实旧单元就是 AI 译文，逐条迁移并复查依赖该单元的引用。
- 普通校验使用 `node scripts/validate.mjs <文件路径>`。新制或重制交付使用 `node scripts/validate.mjs --for-delivery <文件路径>`。1.1.0 交付须为每个含非空经文的章节（含篇首）提供已生成、无待修订结论的 AI 今译。待人工复核可以交付，须保留真实状态。1.0.0 的交付检查仍按同章非空译文及译文层核验。
- [v1.0 旧样本](fixtures/edition.json)、[v1.1 两章示例](fixtures/ai-chapters.json)和[填写模板](../templates/edition.json)可配合[测试说明](../docs/V1.1_TESTS.md)使用。

## 1.2.0
每个注本以 canonical_ref.file、canonical_ref.locator_version 引用同一经典的 {work_id}__canonical.json。独立定位文件保存章节、单元、可选句段与修订号。各版原文和 UTF-16 偏移独立。alignment_refs 支持一对一、拆分、合并、部分对应、缺文和待核；数组可为空。verified 必须记录实际人工 reviewer。定位改版须重新校验受影响映射。详见 work.schema.json、edition.schema.json 与 fixtures/composite.json。历史数据沿用原契约与版本键。
