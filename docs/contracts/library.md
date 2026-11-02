# 文献库与本机导入契约

本契约位于 `src/contracts/library.ts`，逻辑实现位于 `src/domain/library`、`src/data/library-database.ts`。运行时适配 `LibraryView`，不让 UI 直接访问 IndexedDB。

## 数据与身份

- LibraryItem 独立于 DocumentRecord。只有书目的条目可以没有 PDF；关联 PDF 使用 documentId + fileVersion。
- 标题、作者、年份、期刊/会议、摘要、短注释、星标、文件夹、标签及收藏关系均为正式业务数据。
- `inLibrary` 是收藏关系。移出只解除关系，不删除 PDF、阅读位置或研究成果。带 revision 的撤销不会覆盖后续修改；重复导入可重新收藏。
- 标签按 NFKC + 不区分大小写去重。文件夹支持层级，禁止循环；只允许删除没有子文件夹和收藏论文的空文件夹。
- 书目原始 CSL 数据保留作者结构、卷页、DOI 等。手动修改的字段优先于原始 CSL。DOI 或规范化 CSL 内容用于重复书目复用；不同 PDF 只按文件 SHA-256 复用，不凭标题猜测同一篇。
- 书目与已有 PDF 的人工关联入口尚未提供；不会错误地将标题相近的条目自动合并。

## 保存与并发

数据库版本 2 是增量迁移，从既有 documents 建立 libraryItems，不清空旧数据。文件仍是 assets 中的 Blob，由 FileStore 模块管理；文件、文档、初始文献库记录和变更日志在同一事务中提交。导入后目标文件夹关联为第二个短事务：若目标已删除，原 PDF 已保存，任务明确提示重新选择。

所有实体更改写入新的 revision 和 change 记录。元信息修改要求 expectedRevision；提供 baseline 时允许安全合并不同字段，同一字段改变仍返回冲突；星标、移动、加标签等表达字段意图，在事务中读取最新数据再修改。移出撤销要求移出后的 revision 匹配。多页面通过 BroadcastChannel 和页面重新可见时刷新。

FileStore.read / put 隔离原文件读写。未来迁移 OPFS / 外部目录时需实现文件预写、数据库确认和孤儿恢复流程；不能假设跨存储仍有 IndexedDB 的原子性。清除 cache 不触及文件或业务数据。本机存储不等于备份；扩展卸载、删除扩展数据仍需通过未来同步或备份恢复。

## 查询与偏好

查询包括集合、任意标签匹配、字段子串搜索和排序；每次追加 60 条。使用游标扫描并保留有限的排序窗口，不读取 PDF Blob。当前全文和 AI 总结没有索引，unavailableSearchFields 明确返回 body / summary。列表和详情显示当前 PDF 版本已保存且未删除的批注数，纯书目为 0。

视图模式、可见列、列宽、侧栏和详情栏开关保存在 libraryPreferences。查询文本/当前选择不属于持久化数据。ReadingPosition 由 PDF.js 提供，保存页码、页内纵向比例、缩放、旋转和最近阅读时间。

## 导入队列

每个文献库页面只有一个活动导入任务，文件顺序执行；一个失败不阻塞后续任务。状态：queued → reading → validating / password-required → saving → completed，或者 failed / cancelled。保存事务开始后不可取消，避免已落库却显示取消。失败/取消可重试；原文件句柄和密码只留在页面内存，关闭页面后需要重新选择文件，不伪称可以续传。

本地 PDF 与网络直链复用同一 PDF 校验和 SHA-256 导入流程。单 PDF 上限 256 MiB；网络请求有超时且拒绝登录页等非 PDF 响应。扩展点击 URL 导入时先请求该源权限，排队执行时只检查权限；普通网页预览受 CORS 限制。下载重定向涉及其他源的扩展授权仍需在已安装扩展中验证。

BibTeX / CSL JSON 每文件上限 10 MiB、5000 条，验证后一次事务保存。Citation.js 只加载 BibTeX 与 CSL 插件，不调用 DOI 元数据服务。重复书目恢复收藏但不覆盖手工编辑。

## UI 接合

LibraryView 的 CRUD、批量标星/标签/移动/移出、文件夹管理、搜索/排序/筛选、列宽/视图偏好、打开和新标签页打开已由 runtime 适配。

BibTeX 与 APA 尝试复制，剪贴板受限时提供结果和下载；CSV 直接下载并处理公式注入。BibTeX 保留 Unicode，避免丢失中文标题；重复的引用键使用稳定条目 ID 区分。原 PDF 可从已打开的阅读器导出。引用导出不是包含 PDF/笔记/对话的完整备份。

URL/队列容器由 runtime 使用现有 Button、Dialog、TextField、ProgressBar 组合，正式位置将在界面接合时确定。缺少单条引用导出、给纯书目关联 PDF、批注数量未知态及全文未就绪的禁用态。阅读器仍用已有 PDF.js 接合页，研究数据持久化和新版受控高亮接口另行接合。

## PDF 书目信息补全

导入校验复用已打开的 PDF.js worker，先读取 PDF Info / XMP 中的标题、作者、DOI、出版名和明确的出版日期；缺失标题/作者时尝试首页文字的字号、位置及作者区规则。首页明确的出版/版权标识可补年份。不会把 PDF 创建时间或正文中随便出现的年份当作出版年份。

PdfBibliography 带提取版本和字段来源（pdf-metadata / first-page），和文档一起保存；LibraryItem.metadataSources 记录实际填入的字段来源。手动编辑过的字段，包括主动清空的作者/年份，优先于自动补全。其余已有有效信息也不覆盖；只有未编辑的文件名标题可以被识别标题替换。解析失败仍允许导入原 PDF，标题保留文件名，缺失字段保留为空。

打开文献库时，当前已加载的旧 PDF 条目按顺序在本机补全，每份文件当前版本只提取一次；新导入任务优先，后台提取可中止。旧加密 PDF 不弹出后台密码请求，可重新导入并输入密码完成补全。无需重新导入普通旧文件，刷新文献库即可。

这不是在线书目检索或 OCR。扫描件、特殊版式、错误的内嵌元数据可能仍需手工修正。没有上传 PDF，也没有调用 AI 或 DOI 查询接口。摘要与完整出版字段不能保证自动取得。

## 批量星标切换

`star(ids, starred)` 保留显式设值语义，供单篇控件使用。`toggleStars(ids)` 在同一事务中读取选中条目的最新状态：全部已标星则全部取消，否则全部标星；不会逐项反转混合状态。批量 UI 根据全选状态显示“标星/取消标星”；runtime 在多选时用 toggleStars 在事务内判断最新状态。


## 批量标签正式保存

LibraryService.addTags(ids, tags) 接收完整批次，LibraryDatabase 在同一 readwrite 事务中检查论文、复用/新建规范化标签、更新所有 tagIds 及变更日志。任何一项失败均 abort，不允许循环调用多个 addTag 冒充一次保存。addTag 复用同一实现。重试不会重复建标签或重复关联；已有的标签关联保持。

LibraryView.onAddTags 返回成功/失败结果；BatchTagPopover 等待提交结果，保存中锁定重复操作，失败显示原因并保留 selected/created 草稿，只有成功才关闭。只把选中的标签交给服务，未勾选的新标签不写库。正式 library.html 已连接此接口；library-preview.html 继续作为明确标识的内存预览。


## 阅读入口与本机偏好

`reader.html?item=<libraryId>` 打开数据库原 PDF；不带 item 的 `reader.html` 保留示例阅读器和原讨论/概览示例，`?view=gallery` 保留组件目录。`reader-proof.html` 仍是独立文件验证入口。真实阅读器的快速设置直接保存本机外观偏好，模型/密钥等完整配置未接合；不注入虚假的已配置模型。

外观偏好存入 `meta` 中独立的 `readerPreferences` 记录，字段按现有 UI Preferences 的合法范围验证，单字段事务合并避免跨页覆盖；在成功提交后广播刷新。与文献库列宽/布局偏好、可清除缓存分开。
