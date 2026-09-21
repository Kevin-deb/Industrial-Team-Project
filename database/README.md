# CareLink 数据库 SQL 交付

本目录提供可以脱离应用启动过程、直接执行的 SQLite 数据库快照。

- `schema.sql`：最终表结构、索引、触发器和 24 条迁移登记，不包含业务演示数据。
- `seed.sql`：当前合成演示基线，包括 5 名医生、10 名患者、医患授权关系、社区及各业务模块演示数据。

所有数据均为合成演示数据，不得作为真实患者资料或医疗结论使用。

## 创建数据库

```bash
sqlite3 carelink.sqlite < database/schema.sql
sqlite3 carelink.sqlite < database/seed.sql
sqlite3 carelink.sqlite 'PRAGMA foreign_key_check;'
```

最后一条命令没有输出代表外键关系完整。

## 重新生成

```bash
npm run database:export
npm run database:verify
```

运行时结构的唯一维护来源仍是 `apps/api/src` 中的迁移文件；`schema.sql` 和
`seed.sql` 是由应用真实迁移及种子流程生成的可审阅快照，避免手工维护两套结构造成漂移。

## 后端如何联动

后端通过 Node.js SQLite 驱动执行 SQL：

- `apps/api/src/database/connection.ts` 执行迁移、事务和初始化种子流程。
- 各模块 `repository.ts` 使用参数化 `prepare(...).get/all/run` 完成查询和写入。
- API 服务负责身份、权限及患者范围校验；前端不会直接连接 SQLite。
- 默认运行数据库位于 `runtime/data/doctor.sqlite`；桌面应用使用其应用数据目录中的数据库文件。

生产或持续升级仍应启动后端让迁移按版本执行；独立 SQL 适用于新建数据库、审阅、教学展示和测试。
