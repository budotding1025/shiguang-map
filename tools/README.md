# 北京馆展情报（RSS / WeWe）

时光地图本身是静态站，**不会**自动订阅微信公众号。用这套家用小管道：

## 流程

1. 自建 [WeWe-RSS](https://github.com/cooderl/wewe-rss)（或「今天看啥」等），添加：
   - 故宫博物院、中国国家博物馆、首都博物馆（主线）
   - 中国考古博物馆、先农坛等（周末可选）
2. 把每个源的 `.rss` 地址填进 `museum-feeds.json` 的 `rssUrl`
3. 在本目录运行：

```bash
python fetch_exhibition_candidates.py
```

4. 打开 `pending-exhibitions.md` / `pending-exhibitions.json`
5. **人工确认**展期、是否北京、对应朝代后，再改 `js/data.js` 里的 `exhibitions`
6. 网页右上角点「馆展提醒」，把已上线的临展导入手机日历

## 原则

- 只当雷达，不当自动编辑器
- 常设馆靠手工维护；RSS 主要服务临展
- 游学广告、全国巡展会被关键词过滤掉一部分，仍要人审
- 不要让脚本直接 `git push`

## 提醒

地图里带明确起止日期的 `kind: "special"` 条目，可用「馆展提醒」导出 `.ics`：

- 开幕当天
- 结束前约 7 天
